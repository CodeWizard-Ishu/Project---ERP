import { prisma } from '../config/database.js';
import { cacheClient } from '../config/redis.js';
import { ErrorCode } from '../errors/errorCodes.js';
import { UnauthorizedError, ForbiddenError } from '../errors/HttpError.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { UserRepository } from '../modules/user/user.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/jwt.utils.js';
import { requestContext } from '../utils/logger.js';
import type { Permission } from '@erp/shared';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Module-level singletons — instantiated once per process, not per request
const authService = new AuthService(prisma, cacheClient);
const userRepository = new UserRepository(prisma);

/**
 * requireAuth — verifies the access token and loads user permissions.
 *
 * This middleware is the gatekeeper for every protected route.
 * Must be mounted AFTER: requestIdMiddleware, requireTenant (or optionalTenant)
 * Must be mounted BEFORE: any route handler that requires authentication
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify JWT signature + expiry + issuer + audience
 * 3. Check JTI is not blacklisted in Redis (catches logout invalidation)
 * 4. Verify token.tid matches the resolved tenantId (prevents cross-tenant token use)
 * 5. Load permissions from Redis cache (5 min TTL) or DB on cache miss
 * 6. Attach userId, tenantId, permissions, jti, exp to req + AsyncLocalStorage
 */
export const requireAuth: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError(
        'Authorization header missing or malformed. Expected: Bearer <token>',
        { code: ErrorCode.UNAUTHORIZED },
      );
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // Verify signature, expiry, algorithm, issuer, audience — throws on any failure
    const payload = verifyAccessToken(token);

    // Check JTI blacklist — the user may have logged out since this token was issued
    const isBlacklisted = await authService.isJtiBlacklisted(payload.jti);
    if (isBlacklisted) {
      throw new UnauthorizedError(
        'Access token has been revoked. Please log in again.',
        { code: ErrorCode.AUTH_TOKEN_INVALID },
      );
    }

    // Cross-tenant protection: token.tid must match the tenant resolved from requireTenant
    if (req.tenantId && payload.tid !== req.tenantId) {
      throw new UnauthorizedError(
        'Token tenant mismatch.',
        { code: ErrorCode.UNAUTHORIZED },
      );
    }

    // Load permissions: Redis cache → DB fallback
    let permissions = await authService.getCachedPermissions(payload.tid, payload.sub);

    if (!permissions) {
      // Cache miss — load from DB and repopulate the cache
      const context = requestContext.getStore();
      if (context) {
        context.tenantId = payload.tid;
        context.userId = payload.sub;
      }

      const userWithPerms = await userRepository.findByIdWithPermissions(payload.sub);
      if (!userWithPerms) {
        throw new UnauthorizedError(
          'User account not found or has been deactivated.',
          { code: ErrorCode.UNAUTHORIZED },
        );
      }

      if (userWithPerms.status !== 'ACTIVE') {
        throw new UnauthorizedError(
          'User account is not active.',
          { code: ErrorCode.UNAUTHORIZED },
        );
      }

      const userProfile = UserRepository.buildUserProfile(userWithPerms);
      permissions = userProfile.permissions;
      await authService.cachePermissions(payload.tid, payload.sub, permissions);
    }

    // Attach to request for controllers and downstream middleware
    req.userId = payload.sub;
    req.tenantId = payload.tid;
    req.permissions = permissions;
    req.accessTokenJti = payload.jti;
    req.accessTokenExp = payload.exp;

    // Update AsyncLocalStorage context for structured logging
    const context = requestContext.getStore();
    if (context) {
      context.userId = payload.sub;
      context.tenantId = payload.tid;
    }

    next();
  },
);

/**
 * requirePermission — checks that the authenticated user has exactly the given permission.
 *
 * MUST be mounted AFTER requireAuth.
 *
 * Usage:
 *   router.get('/employees', requireAuth, requirePermission('hr:read'), controller.list)
 */
export const requirePermission = (permission: Permission): RequestHandler =>
  asyncHandler(
    (req: Request, _res: Response, next: NextFunction): Promise<void> => {
      if (!req.permissions) {
        throw new UnauthorizedError(
          'requirePermission called without requireAuth. Check route middleware order.',
          { code: ErrorCode.UNAUTHORIZED },
        );
      }

      if (!req.permissions.includes(permission)) {
        throw new ForbiddenError(
          `You do not have permission to perform this action. Required: ${permission}`,
          { code: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS },
        );
      }

      next();
      return Promise.resolve();
    },
  );

/**
 * requirePermissions — all listed permissions must be present (AND logic).
 *
 * Usage:
 *   router.post('/reports/export', requireAuth, requirePermissions(['reports:read', 'reports:export']), ...)
 */
export const requirePermissions = (permissions: Permission[]): RequestHandler =>
  asyncHandler(
    (req: Request, _res: Response, next: NextFunction): Promise<void> => {
      if (!req.permissions) {
        throw new UnauthorizedError(
          'requirePermissions called without requireAuth.',
          { code: ErrorCode.UNAUTHORIZED },
        );
      }
      const missing = permissions.filter((p) => !req.permissions!.includes(p));
      if (missing.length > 0) {
        throw new ForbiddenError(
          `Missing required permissions: ${missing.join(', ')}`,
          { code: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS },
        );
      }
      next();
      return Promise.resolve();
    },
  );

/**
 * requireAnyPermission — at least one of the listed permissions must be present (OR logic).
 *
 * Usage:
 *   router.get('/finance', requireAuth, requireAnyPermission(['finance:read', 'finance:approve']), ...)
 */
export const requireAnyPermission = (permissions: Permission[]): RequestHandler =>
  asyncHandler(
    (req: Request, _res: Response, next: NextFunction): Promise<void> => {
      if (!req.permissions) {
        throw new UnauthorizedError(
          'requireAnyPermission called without requireAuth.',
          { code: ErrorCode.UNAUTHORIZED },
        );
      }
      const hasAny = permissions.some((p) => req.permissions!.includes(p));
      if (!hasAny) {
        throw new ForbiddenError(
          `Requires at least one of: ${permissions.join(', ')}`,
          { code: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS },
        );
      }
      next();
      return Promise.resolve();
    },
  );
