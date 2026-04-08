import { prisma } from '../../config/database.js';
import { config } from '../../config/env.js';
import { cacheClient } from '../../config/redis.js';
import { ErrorCode } from '../../errors/errorCodes.js';
import { UnauthorizedError, BadRequestError } from '../../errors/HttpError.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response.js';
import { parseExpiryToMs } from '../../utils/token.utils.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { Request, Response } from 'express';

const authService = new AuthService(prisma, cacheClient);

// ─── HttpOnly Cookie configuration ────────────────────────────────

/**
 * Refresh token cookie options.
 * Path is restricted to the refresh endpoint only so the cookie is never
 * sent on regular API requests — reducing token exposure surface.
 */
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: parseExpiryToMs(config.JWT_REFRESH_EXPIRES_IN),
  path: '/api/v1/auth/refresh',
};

const CLEAR_REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth/refresh',
};

// ─── Controller ────────────────────────────────────────────────────

/**
 * AuthController — thin HTTP layer. No business logic here.
 * Validates input → calls service → formats response.
 */
export class AuthController {
  /**
   * POST /auth/register
   * Creates a new tenant and its first admin user.
   * Rate limited by authRateLimiter.
   */
  async register(req: Request, res: Response): Promise<void> {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {throw new ValidationError(parsed.error);}

    const result = await authService.register(
      parsed.data,
      req.ip ?? undefined,
      req.headers['user-agent'],
    );

    // Set refresh token as HttpOnly cookie (in addition to body for mobile clients)
    res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

    sendCreated(res, result, 'Account created successfully');
  }

  /**
   * POST /auth/login
   * Tenant-scoped credential validation.
   * tenantId is set by requireTenant middleware before this handler.
   */
  async login(req: Request, res: Response): Promise<void> {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {throw new ValidationError(parsed.error);}

    if (!req.tenantId) {
      throw new UnauthorizedError(
        'Tenant context is required for login.',
        { code: ErrorCode.UNAUTHORIZED },
      );
    }

    const result = await authService.login(
      parsed.data,
      req.tenantId,
      req.ip ?? undefined,
      req.headers['user-agent'],
    );

    res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    sendSuccess(res, result, 'Login successful');
  }

  /**
   * POST /auth/refresh
   * Accepts refresh token from HttpOnly cookie OR request body.
   * Cookie is preferred (browser clients); body is for mobile/API clients.
   */
  async refresh(req: Request, res: Response): Promise<void> {
    const tokenFromCookie = req.cookies?.['refreshToken'] as string | undefined;
    const bodyParsed = refreshTokenSchema.safeParse(req.body);
    const rawRefreshToken = tokenFromCookie ?? (bodyParsed.success ? bodyParsed.data.refreshToken : undefined);

    if (!rawRefreshToken) {
      throw new BadRequestError(
        'Refresh token is required. Provide it in the request body or as an HttpOnly cookie.',
        { code: ErrorCode.BAD_REQUEST },
      );
    }

    const result = await authService.refreshTokens(
      rawRefreshToken,
      req.ip ?? undefined,
      req.headers['user-agent'],
    );

    res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    sendSuccess(res, result, 'Token refreshed successfully');
  }

  /**
   * POST /auth/logout
   * Blacklists the access token JTI and revokes the refresh token.
   * requireAuth runs before this handler and sets req.accessTokenJti + req.accessTokenExp.
   */
  async logout(req: Request, res: Response): Promise<void> {
    const tokenFromCookie = req.cookies?.['refreshToken'] as string | undefined;
    const body = req.body as Record<string, unknown> | undefined;
    const rawRefreshToken = tokenFromCookie ?? (body?.['refreshToken'] as string | undefined);

    await authService.logout({
      accessTokenJti: req.accessTokenJti!,
      accessTokenExp: req.accessTokenExp!,
      ...(rawRefreshToken !== undefined && { rawRefreshToken }),
      userId: req.userId!,
      tenantId: req.tenantId!,
      ...(req.ip !== undefined && { ipAddress: req.ip }),
      ...(req.headers['user-agent'] !== undefined && { userAgent: req.headers['user-agent'] }),
    });

    res.clearCookie('refreshToken', CLEAR_REFRESH_COOKIE_OPTIONS);
    sendNoContent(res);
  }

  /**
   * POST /auth/logout-all
   * Revokes all refresh tokens for the user across all devices.
   */
  async logoutAll(req: Request, res: Response): Promise<void> {
    await authService.logoutAll({
      accessTokenJti: req.accessTokenJti!,
      accessTokenExp: req.accessTokenExp!,
      userId: req.userId!,
      tenantId: req.tenantId!,
    });

    res.clearCookie('refreshToken', CLEAR_REFRESH_COOKIE_OPTIONS);
    sendNoContent(res);
  }

  /**
   * POST /auth/forgot-password
   * ALWAYS returns the same message regardless of whether the email exists.
   * Prevents user enumeration via the forgot password endpoint.
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {throw new ValidationError(parsed.error);}

    if (!req.tenantId) {
      throw new UnauthorizedError(
        'Tenant context is required.',
        { code: ErrorCode.UNAUTHORIZED },
      );
    }

    await authService.forgotPassword(parsed.data.email, req.tenantId);

    // Identical response whether email exists or not
    sendSuccess(
      res,
      null,
      'If an account with that email exists, a password reset link has been sent.',
    );
  }

  /**
   * POST /auth/reset-password
   * Validates the reset token, sets the new password, revokes all sessions.
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {throw new ValidationError(parsed.error);}

    await authService.resetPassword(parsed.data.token, parsed.data.newPassword);

    sendSuccess(
      res,
      null,
      'Password reset successful. Please log in with your new password.',
    );
  }

  /**
   * POST /auth/change-password
   * Requires the current password. Revokes all sessions after change.
   * requireAuth runs before this handler.
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {throw new ValidationError(parsed.error);}

    await authService.changePassword(
      req.userId!,
      req.tenantId!,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );

    sendSuccess(
      res,
      null,
      'Password changed successfully. Please log in again on other devices.',
    );
  }

  /**
   * GET /auth/me
   * Returns the current user's identity and permissions from the request context.
   * requireAuth runs before this handler and populates req.userId + req.permissions.
   */
  me(req: Request, res: Response): void {
    sendSuccess(res, {
      userId: req.userId!,
      tenantId: req.tenantId!,
      permissions: req.permissions ?? [],
    });
  }
}
