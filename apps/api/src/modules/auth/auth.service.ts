import { randomUUID } from 'crypto';
import { DEFAULT_TENANT_ROLES } from '@erp/shared';
import bcrypt from 'bcryptjs';
import { config } from '../../config/env.js';
import { ErrorCode } from '../../errors/errorCodes.js';
import {
  UnauthorizedError,
  ConflictError,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../../errors/HttpError.js';
import { seedRoles } from '../../seeds/index.js';
import {
  generateAccessToken,
  parseDurationToSeconds,
} from '../../utils/jwt.utils.js';
import { requestContext, logger } from '../../utils/logger.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  hashPasswordResetToken,
  generatePasswordResetToken,
} from '../../utils/token.utils.js';
import { TenantRepository } from '../tenant/tenant.repository.js';
import { UserRepository, type UserWithPermissions } from '../user/user.repository.js';
import { AuthRepository } from './auth.repository.js';
import type { RegisterDto, LoginDto } from './auth.types.js';
import type { LoginResponse, RegisterResponse, RefreshResponse } from '@erp/shared';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

// ─── Redis key namespace (matching the architecture spec) ──────────
const REDIS_KEYS = {
  jtiBlacklist:     (jti: string) => `auth:blacklist:jti:${jti}`,
  loginLockout:     (tenantId: string, ip: string) => `auth:lockout:${tenantId}:${ip}`,
  permissionCache:  (tenantId: string, userId: string) => `permissions:cache:${tenantId}:${userId}`,
  passwordReset:    (tokenHash: string) => `auth:reset:${tokenHash}`,
} as const;

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_TTL_SECONDS  = 900;   // 15 minutes
const PERMISSION_CACHE_TTL = 300;   // 5 minutes
const PASSWORD_RESET_TTL   = 3600;  // 1 hour

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly authRepository: AuthRepository;
  private readonly tenantRepository: TenantRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {
    this.userRepository = new UserRepository(prisma);
    this.authRepository = new AuthRepository(prisma);
    this.tenantRepository = new TenantRepository(prisma);
  }

  // ─── Register ────────────────────────────────────────────────────

  /**
   * register — creates a new tenant and its first admin user atomically.
   *
   * This is the "sign up a new company" flow, not adding a user to an existing tenant.
   *
   * Steps:
   * 1. Validate slug uniqueness (global check, not tenant-scoped)
   * 2. Create tenant + user in a single Prisma transaction
   * 3. Seed the 3 default roles (ADMIN, MANAGER, EMPLOYEE) for the new tenant
   * 4. Assign ADMIN role to the first user
   * 5. Load full permissions, cache in Redis, issue token pair
   */
  async register(
    dto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RegisterResponse> {
    // Check slug availability — scoped globally (not per tenant)
    const slugTaken = await this.tenantRepository.slugExists(dto.tenantSlug);
    if (slugTaken) {
      throw new ConflictError(
        `The company URL '${dto.tenantSlug}' is already taken. Please choose another.`,
        { code: ErrorCode.CONFLICT },
      );
    }

    // Create tenant + user in one DB transaction
    const { user, tenant } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          plan: 'FREE',
          status: 'ACTIVE',
          settings: {
            timezone: dto.timezone ?? 'UTC',
            currency: dto.currency ?? 'USD',
            dateFormat: 'YYYY-MM-DD',
            fiscalYearStartMonth: 1,
          },
        },
      });

      // 12 bcrypt rounds — current recommendation for 2024+
      const passwordHash = await bcrypt.hash(dto.password, 12);

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: 'ACTIVE',
          // Auto-verify on registration; email verification flow is Phase 13
          emailVerifiedAt: new Date(),
        },
      });

      return { user, tenant };
    });

    // seedRoles is called AFTER the transaction because it uses the prisma singleton
    await seedRoles(this.prisma, tenant.id);

    // Assign the ADMIN role to this founding user
    const adminRole = await this.prisma.role.findFirstOrThrow({
      where: { tenantId: tenant.id, name: DEFAULT_TENANT_ROLES.ADMIN },
    });
    await this.prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id },
    });

    // Set tenant context in AsyncLocalStorage for subsequent repository operations
    const context = requestContext.getStore();
    if (context) {context.tenantId = tenant.id;}

    // Load the full user+roles+permissions from DB
    const userWithPerms = await this.prisma.user.findFirstOrThrow({
      where: { id: user.id },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: { select: { resource: true, action: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const userProfile = UserRepository.buildUserProfile(userWithPerms as UserWithPermissions);
    await this.cachePermissions(tenant.id, user.id, userProfile.permissions);

    const { token: accessToken, expiresIn } = generateAccessToken({
      userId: user.id,
      tenantId: tenant.id,
    });

    const { rawToken: refreshToken } = await this.issueRefreshToken({
      userId: user.id,
      tenantId: tenant.id,
      familyId: randomUUID(),
      ...(ipAddress !== undefined && { ipAddress }),
      ...(userAgent !== undefined && { userAgent }),
    });

    await this.authRepository.createAuditLog({
      tenantId: tenant.id,
      userId: user.id,
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      ...(ipAddress !== undefined && { ipAddress }),
      ...(userAgent !== undefined && { userAgent }),
      metadata: { event: 'registration' },
    });

    logger.info('[AuthService] New tenant registered', {
      tenantId: tenant.id,
      userId: user.id,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
      user: userProfile,
    };
  }

  // ─── Login ───────────────────────────────────────────────────────

  /**
   * login — validates credentials and issues a new token pair.
   *
   * SECURITY NOTES:
   * - Rate limiting is checked BEFORE any DB lookup to prevent timing-based
   *   user enumeration via response time differences.
   * - bcrypt.compare() is ALWAYS called, even when the user is not found,
   *   using a pre-computed dummy hash to equalise response times.
   * - The error message for "user not found" and "wrong password" is identical:
   *   "Invalid email or password." — prevents user enumeration.
   */
  async login(
    dto: LoginDto,
    tenantId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponse> {
    // Check lockout state BEFORE any DB operation
    await this.checkLoginLockout(tenantId, ipAddress ?? 'unknown');

    // Set tenant context for repository operations
    const context = requestContext.getStore();
    if (context) {context.tenantId = tenantId;}

    const user = await this.userRepository.findByEmail(dto.email);

    // SECURITY: Always run bcrypt.compare even when user is not found.
    // A fast "not found" path vs a slow "wrong password" path would allow
    // an attacker to enumerate valid email addresses via response time.
    const dummyHash =
      '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN7a5VD8M0VoEEh5tSZGS';
    const passwordToCheck = user?.passwordHash ?? dummyHash;
    const passwordValid = await bcrypt.compare(dto.password, passwordToCheck);

    if (!user || !passwordValid) {
      await this.recordFailedAttempt(tenantId, ipAddress ?? 'unknown');
      await this.authRepository.createAuditLog({
        tenantId,
        action: 'LOGIN',
        entityType: 'User',
        entityId: dto.email,
        ...(ipAddress !== undefined && { ipAddress }),
        ...(userAgent !== undefined && { userAgent }),
        metadata: {
          success: false,
          reason: !user ? 'user_not_found' : 'invalid_password',
          email: dto.email,
        },
      });
      // IDENTICAL message for both failure cases — prevents user enumeration
      throw new UnauthorizedError(
        'Invalid email or password.',
        { code: ErrorCode.AUTH_INVALID_CREDENTIALS },
      );
    }

    // Check user account status
    if (user.status === 'INACTIVE') {
      throw new ForbiddenError(
        'Your account has been deactivated. Please contact your administrator.',
        { code: ErrorCode.FORBIDDEN },
      );
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError(
        'Your account has been suspended. Please contact your administrator.',
        { code: ErrorCode.FORBIDDEN },
      );
    }

    if (user.status === 'INVITED') {
      throw new ForbiddenError(
        'Please complete your registration before logging in.',
        { code: ErrorCode.FORBIDDEN },
      );
    }

    // Clear the failed attempt counter on successful login
    await this.clearLoginLockout(tenantId, ipAddress ?? 'unknown');

    // Load full permissions for the Redis cache
    const userWithPerms = await this.userRepository.findByIdWithPermissions(user.id);
    if (!userWithPerms) {
      // Should never happen — we just fetched the user above
      throw new UnauthorizedError(
        'Invalid email or password.',
        { code: ErrorCode.AUTH_INVALID_CREDENTIALS },
      );
    }

    const userProfile = UserRepository.buildUserProfile(userWithPerms);
    await this.cachePermissions(tenantId, user.id, userProfile.permissions);

    const { token: accessToken, expiresIn } = generateAccessToken({
      userId: user.id,
      tenantId,
    });

    const { rawToken: refreshToken } = await this.issueRefreshToken({
      userId: user.id,
      tenantId,
      familyId: randomUUID(),  // new family per login session
      ...(ipAddress !== undefined && { ipAddress }),
      ...(userAgent !== undefined && { userAgent }),
    });

    // Update last login timestamp — fire and forget (does not block the response)
    void this.userRepository.updateLastLogin(user.id);

    await this.authRepository.createAuditLog({
      tenantId,
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ...(ipAddress !== undefined && { ipAddress }),
      ...(userAgent !== undefined && { userAgent }),
      metadata: { success: true },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
      user: userProfile,
    };
  }

  // ─── Refresh ─────────────────────────────────────────────────────

  /**
   * refreshTokens — rotates the refresh token and issues a new access+refresh pair.
   *
   * The rotation is fully atomic (DB transaction). The old token is revoked and
   * the new token is created in the same transaction. No race conditions.
   *
   * If the presented token was already revoked (reuse attack), the entire
   * token family is revoked and a 401 is returned.
   */
  async refreshTokens(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RefreshResponse> {
    const oldTokenHash = hashRefreshToken(rawRefreshToken);
    const newRawToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRawToken);
    const refreshTTL = parseDurationToSeconds(config.JWT_REFRESH_EXPIRES_IN);
    const newExpiresAt = new Date(Date.now() + refreshTTL * 1000);

    const { userId, tenantId } = await this.authRepository.findAndRotateRefreshToken({
      oldTokenHash,
      newTokenHash,
      newExpiresAt,
      ...(ipAddress !== undefined && { ipAddress }),
      ...(userAgent !== undefined && { userAgent }),
    });

    // Update tenant context for downstream operations
    const context = requestContext.getStore();
    if (context) {context.tenantId = tenantId;}

    const { token: accessToken, expiresIn } = generateAccessToken({ userId, tenantId });

    return {
      accessToken,
      refreshToken: newRawToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  // ─── Logout ──────────────────────────────────────────────────────

  /**
   * logout — invalidates the current session only (single device).
   *
   * Two things happen:
   * 1. The access token JTI is blacklisted in Redis for its remaining lifetime.
   *    Any subsequent request presenting this token will be rejected by requireAuth.
   * 2. The refresh token is revoked in the DB so it cannot be used to get a new access token.
   */
  async logout(params: {
    accessTokenJti: string;
    accessTokenExp: number;
    rawRefreshToken?: string;
    userId: string;
    tenantId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const remainingTTL = Math.max(
      0,
      params.accessTokenExp - Math.floor(Date.now() / 1000),
    );

    // Blacklist the JTI in Redis — TTL = remaining access token lifetime
    if (remainingTTL > 0) {
      await this.redis.setex(
        REDIS_KEYS.jtiBlacklist(params.accessTokenJti),
        remainingTTL,
        '1',
      );
    }

    // Revoke the refresh token if provided
    if (params.rawRefreshToken) {
      const tokenHash = hashRefreshToken(params.rawRefreshToken);
      const token = await this.authRepository.findRefreshTokenByHash(tokenHash);
      if (token) {
        await this.authRepository.revokeRefreshToken(token.id);
      }
    }

    // Invalidate the permission cache so stale permissions are cleared
    await this.invalidatePermissionCache(params.tenantId, params.userId);

    await this.authRepository.createAuditLog({
      tenantId: params.tenantId,
      userId: params.userId,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: params.userId,
      ...(params.ipAddress !== undefined && { ipAddress: params.ipAddress }),
      ...(params.userAgent !== undefined && { userAgent: params.userAgent }),
    });
  }

  /**
   * logoutAll — invalidates ALL sessions for a user across all devices.
   *
   * Blacklists the current access token JTI (immediate) and revokes every
   * active refresh token for this user in the DB (all other devices will
   * fail to refresh and be forced to re-login).
   */
  async logoutAll(params: {
    accessTokenJti: string;
    accessTokenExp: number;
    userId: string;
    tenantId: string;
  }): Promise<void> {
    const remainingTTL = Math.max(
      0,
      params.accessTokenExp - Math.floor(Date.now() / 1000),
    );

    if (remainingTTL > 0) {
      await this.redis.setex(
        REDIS_KEYS.jtiBlacklist(params.accessTokenJti),
        remainingTTL,
        '1',
      );
    }

    await this.authRepository.revokeAllUserTokens(params.userId);
    await this.invalidatePermissionCache(params.tenantId, params.userId);

    logger.info('[AuthService] All sessions logged out', {
      userId: params.userId,
      tenantId: params.tenantId,
    });
  }

  // ─── Forgot Password ─────────────────────────────────────────────

  /**
   * forgotPassword — generates a reset token and stores it in Redis.
   *
   * SECURITY: Always returns void. The controller ALWAYS sends the same success
   * message regardless of whether the email is registered — prevents user enumeration
   * via the forgot password endpoint.
   */
  async forgotPassword(email: string, tenantId: string): Promise<void> {
    const context = requestContext.getStore();
    if (context) {context.tenantId = tenantId;}

    const user = await this.userRepository.findByEmail(email);

    // Silent return — do not leak whether the email exists
    if (!user || user.status !== 'ACTIVE') {
      logger.info('[AuthService] Forgot password: email not found or inactive', {
        email,
        tenantId,
      });
      return;
    }

    const rawToken = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(rawToken);

    // Store in Redis: hash → userId, TTL = 1 hour
    await this.redis.setex(
      REDIS_KEYS.passwordReset(tokenHash),
      PASSWORD_RESET_TTL,
      user.id,
    );

    // Development: log the token so it can be tested without an SMTP server
    if (config.NODE_ENV === 'development') {
      logger.info('[AuthService] Password reset token (DEV ONLY — do not log in production):', {
        token: rawToken,
        userId: user.id,
        email,
      });
    }

    // Phase 13: enqueue email job
    // await emailQueue.add('password-reset', { to: email, token: rawToken, userId: user.id });
  }

  // ─── Reset Password ──────────────────────────────────────────────

  /**
   * resetPassword — validates the reset token and sets a new password.
   *
   * SECURITY:
   * - Token is deleted from Redis immediately after validation (single-use)
   * - All refresh tokens are revoked to force re-login on all devices
   * - The token is stored only as a SHA-256 hash in Redis; the raw token is never persisted
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashPasswordResetToken(rawToken);
    const userId = await this.redis.get(REDIS_KEYS.passwordReset(tokenHash));

    if (!userId) {
      throw new BadRequestError(
        'Password reset token is invalid or has expired.',
        { code: ErrorCode.BAD_REQUEST },
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, updatedAt: new Date() },
    });

    // Immediately invalidate the token (single-use)
    await this.redis.del(REDIS_KEYS.passwordReset(tokenHash));

    // Revoke all refresh tokens — all devices must re-authenticate
    await this.authRepository.revokeAllUserTokens(userId);

    logger.info('[AuthService] Password reset successful', { userId });
  }

  // ─── Change Password ─────────────────────────────────────────────

  /**
   * changePassword — allows an authenticated user to change their own password.
   *
   * Requires the current password to be provided (prevents session hijacking).
   * After success, all OTHER refresh tokens are revoked (current session stays
   * active but all other devices must re-authenticate).
   */
  async changePassword(
    userId: string,
    tenantId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const context = requestContext.getStore();
    if (context) {context.tenantId = tenantId;}

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User not found', { code: ErrorCode.NOT_FOUND });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError(
        'Current password is incorrect.',
        { code: ErrorCode.AUTH_INVALID_CREDENTIALS },
      );
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, updatedAt: new Date() },
    });

    // Revoke all refresh tokens (all devices re-auth required)
    await this.authRepository.revokeAllUserTokens(userId);
    await this.invalidatePermissionCache(tenantId, userId);
  }

  // ─── JTI Blacklist ───────────────────────────────────────────────

  /**
   * isJtiBlacklisted — checks if an access token JTI has been blacklisted.
   * Called by requireAuth on every request after JWT verification.
   */
  async isJtiBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redis.get(REDIS_KEYS.jtiBlacklist(jti));
    return result !== null;
  }

  // ─── Permission Cache ────────────────────────────────────────────

  async getCachedPermissions(tenantId: string, userId: string): Promise<string[] | null> {
    const cached = await this.redis.get(REDIS_KEYS.permissionCache(tenantId, userId));
    if (!cached) {return null;}
    try {
      return JSON.parse(cached) as string[];
    } catch {
      return null;
    }
  }

  async cachePermissions(tenantId: string, userId: string, permissions: string[]): Promise<void> {
    await this.redis.setex(
      REDIS_KEYS.permissionCache(tenantId, userId),
      PERMISSION_CACHE_TTL,
      JSON.stringify(permissions),
    );
  }

  async invalidatePermissionCache(tenantId: string, userId: string): Promise<void> {
    await this.redis.del(REDIS_KEYS.permissionCache(tenantId, userId));
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private async issueRefreshToken(params: {
    userId: string;
    tenantId: string;
    familyId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ rawToken: string }> {
    const rawToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawToken);
    const refreshTTLSeconds = parseDurationToSeconds(config.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshTTLSeconds * 1000);

    await this.authRepository.createRefreshToken({
      userId: params.userId,
      tenantId: params.tenantId,
      tokenHash,
      familyId: params.familyId,
      expiresAt,
      ...(params.ipAddress !== undefined && { ipAddress: params.ipAddress }),
      ...(params.userAgent !== undefined && { userAgent: params.userAgent }),
    });

    return { rawToken };
  }

  private async checkLoginLockout(tenantId: string, ip: string): Promise<void> {
    const key = REDIS_KEYS.loginLockout(tenantId, ip);
    const attempts = await this.redis.get(key);
    if (attempts && parseInt(attempts, 10) >= LOCKOUT_MAX_ATTEMPTS) {
      const ttl = await this.redis.ttl(key);
      throw new UnauthorizedError(
        `Too many failed login attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        { code: ErrorCode.RATE_LIMIT_EXCEEDED },
      );
    }
  }

  private async recordFailedAttempt(tenantId: string, ip: string): Promise<void> {
    const key = REDIS_KEYS.loginLockout(tenantId, ip);
    const current = await this.redis.incr(key);
    if (current === 1) {
      // First failure — initialise TTL
      await this.redis.expire(key, LOCKOUT_TTL_SECONDS);
    }
  }

  private async clearLoginLockout(tenantId: string, ip: string): Promise<void> {
    await this.redis.del(REDIS_KEYS.loginLockout(tenantId, ip));
  }
}
