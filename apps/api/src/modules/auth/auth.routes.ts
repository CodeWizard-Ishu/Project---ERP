import cookieParser from 'cookie-parser';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { authRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { requireTenant, optionalTenant } from '../../middleware/tenant.middleware.js';
import { AuthController } from './auth.controller.js';

const router = Router();
const controller = new AuthController();

// Apply cookie parser to all auth routes for HttpOnly refresh token cookie support
router.use(cookieParser());

// ─── Public routes (no authentication required) ─────────────────

/**
 * POST /auth/register
 * Creates a new tenant + admin user.
 * optionalTenant: the tenant doesn't exist yet at registration time,
 * so we can't require it — but we allow it in case the user sends a header.
 * authRateLimiter: 5 attempts per 15 min per IP.
 */
router.post(
  '/register',
  authRateLimiter,
  optionalTenant,
  (req, res) => void controller.register(req, res),
);

/**
 * POST /auth/login
 * requireTenant: login is always scoped to a specific tenant.
 * The tenant must exist and be ACTIVE before credentials are checked.
 */
router.post(
  '/login',
  authRateLimiter,
  requireTenant,
  (req, res) => void controller.login(req, res),
);

/**
 * POST /auth/refresh
 * No tenant check — the tenantId is stored on the refresh token DB record.
 * No rate limiter — refresh requests are not a brute-force attack vector
 * (they require a valid 128-char random token).
 */
router.post(
  '/refresh',
  (req, res) => void controller.refresh(req, res),
);

/**
 * POST /auth/forgot-password
 * requireTenant: email addresses are tenant-scoped.
 * authRateLimiter: prevents bulk email enumeration attempts.
 */
router.post(
  '/forgot-password',
  authRateLimiter,
  requireTenant,
  (req, res) => void controller.forgotPassword(req, res),
);

/**
 * POST /auth/reset-password
 * No tenant check — the userId is stored in the Redis reset token, not in tenant.
 * authRateLimiter: prevents brute-force guessing of reset tokens.
 */
router.post(
  '/reset-password',
  authRateLimiter,
  (req, res) => void controller.resetPassword(req, res),
);

// ─── Protected routes (requireAuth required) ───────────────────

/**
 * POST /auth/logout — single device logout
 * requireTenant before requireAuth because requireAuth validates token.tid
 * matches req.tenantId (cross-tenant protection).
 */
router.post(
  '/logout',
  requireTenant,
  requireAuth,
  (req, res) => void controller.logout(req, res),
);

/**
 * POST /auth/logout-all — all devices logout
 */
router.post(
  '/logout-all',
  requireTenant,
  requireAuth,
  (req, res) => void controller.logoutAll(req, res),
);

/**
 * POST /auth/change-password
 * Requires the current password in the request body.
 */
router.post(
  '/change-password',
  requireTenant,
  requireAuth,
  (req, res) => void controller.changePassword(req, res),
);

/**
 * GET /auth/me
 * Returns the current user's identity and permission list.
 * Used by the frontend to determine what UI elements to show.
 */
router.get(
  '/me',
  requireTenant,
  requireAuth,
  (req, res) => void controller.me(req, res),
);

export default router;
