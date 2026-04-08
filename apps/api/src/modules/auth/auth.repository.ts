import { ErrorCode } from '../../errors/errorCodes.js';
import { UnauthorizedError } from '../../errors/HttpError.js';
import { logger } from '../../utils/logger.js';
import type { PrismaClient, RefreshToken, Prisma } from '@prisma/client';

/**
 * AuthRepository — handles all DB operations specific to authentication.
 *
 * Does NOT extend BaseRepository because:
 * 1. Refresh token operations span tenants during rotation (we used stored tenantId)
 * 2. Audit log writes are fire-and-forget (never block the primary operation)
 * 3. Auth operations bypass the AsyncLocalStorage tenant context by design
 */
export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── Refresh Token Operations ──────────────────────────────────────

  /**
   * createRefreshToken — persists a hashed refresh token.
   * familyId groups all tokens issued from the same login session,
   * enabling family-wide revocation on reuse detection.
   */
  async createRefreshToken(params: {
    userId: string;
    tenantId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        tokenHash: params.tokenHash,
        familyId: params.familyId,
        expiresAt: params.expiresAt,
        // Prisma nullable fields require null, not undefined
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }

  /**
   * findRefreshTokenByHash — looks up a token by its SHA-256 hash.
   * Includes the minimal user fields needed for immediate validation.
   */
  async findRefreshTokenByHash(
    tokenHash: string,
  ): Promise<(RefreshToken & { user: { id: string; tenantId: string; status: string; email: string } }) | null> {
    return this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, tenantId: true, status: true, email: true },
        },
      },
    }) as Promise<(RefreshToken & { user: { id: string; tenantId: string; status: string; email: string } }) | null>;
  }

  /**
   * revokeRefreshToken — marks a single token as revoked by setting revokedAt.
   * Called on single-device logout and during rotation (old token revoked, new created).
   */
  async revokeRefreshToken(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * revokeFamilyTokens — revokes ALL active tokens in a family.
   *
   * SECURITY: Called when token reuse is detected (a previously-revoked token is
   * presented again). This is a strong signal of token theft — we invalidate the
   * entire session family to force re-authentication on all devices.
   */
  async revokeFamilyTokens(familyId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.warn(`[AuthRepository] Revoked ${result.count} tokens in family ${familyId} — reuse detected`);
    return result.count;
  }

  /**
   * revokeAllUserTokens — revokes all active refresh tokens for a user.
   * Called on logout-all and password change/reset to evict all devices.
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * findAndRotateRefreshToken — atomic refresh token rotation inside a DB transaction.
   *
   * This is the most security-critical method in the auth system. All 5 steps run
   * atomically — there is no window where two concurrent requests could both consume
   * the same token.
   *
   * Step 1: Find the token by hash
   * Step 2: Check for reuse (revokedAt != null → family attack → revoke family → throw)
   * Step 3: Check DB-level expiry
   * Step 4: Revoke the old token
   * Step 5: Create new token with same familyId (preserves session lineage)
   */
  async findAndRotateRefreshToken(params: {
    oldTokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    newTokenId: string;
    userId: string;
    tenantId: string;
    familyId: string;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // Step 1: Find old token
      const oldToken = await tx.refreshToken.findFirst({
        where: { tokenHash: params.oldTokenHash },
      });

      if (!oldToken) {
        throw new UnauthorizedError(
          'Refresh token not found.',
          { code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID },
        );
      }

      // Step 2: Reuse detection — if already revoked, this is a replay attack
      if (oldToken.revokedAt !== null) {
        // Revoke the entire family to force re-login on all devices
        await tx.refreshToken.updateMany({
          where: { familyId: oldToken.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        logger.warn('[Auth] Refresh token reuse detected — entire family revoked', {
          familyId: oldToken.familyId,
          userId: oldToken.userId,
          tenantId: oldToken.tenantId,
        });
        throw new UnauthorizedError(
          'Token reuse detected. Please log in again.',
          { code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID },
        );
      }

      // Step 3: Check DB-level expiry (belt-and-suspenders alongside JWT expiry)
      if (oldToken.expiresAt < new Date()) {
        throw new UnauthorizedError(
          'Refresh token has expired. Please log in again.',
          { code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID },
        );
      }

      // Step 4: Revoke the old token
      await tx.refreshToken.update({
        where: { id: oldToken.id },
        data: { revokedAt: new Date() },
      });

      // Step 5: Create the new token — same familyId preserves session lineage
      const newToken = await tx.refreshToken.create({
        data: {
          userId: oldToken.userId,
          tenantId: oldToken.tenantId,
          tokenHash: params.newTokenHash,
          familyId: oldToken.familyId,   // same family = same login session
          expiresAt: params.newExpiresAt,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      });

      return {
        newTokenId: newToken.id,
        userId: oldToken.userId,
        tenantId: oldToken.tenantId,
        familyId: oldToken.familyId,
      };
    });
  }

  // ─── Audit Logging ─────────────────────────────────────────────────

  /**
   * createAuditLog — writes an audit event to the audit_logs table.
   *
   * IMPORTANT: Failure is logged but NEVER propagates. An audit log write failure
   * must never cause a successful auth operation to appear as an error to the client.
   */
  async createAuditLog(params: {
    tenantId: string;
    userId?: string;
    action: 'LOGIN' | 'LOGOUT' | 'CREATE';
    entityType: string;
    entityId: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          // userId is optional — Prisma requires undefined (not null) for optional relations
          ...(params.userId !== undefined && { userId: params.userId }),
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
          // Cast to Prisma.InputJsonValue — our Record<string,unknown> is a valid JSON object
          metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // Audit log failure must NEVER fail the primary operation
      logger.error('[AuthRepository] Failed to write audit log', { error, params });
    }
  }
}
