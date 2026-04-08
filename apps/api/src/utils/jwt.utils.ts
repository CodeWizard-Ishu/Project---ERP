import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { ErrorCode } from '../errors/errorCodes.js';
import { UnauthorizedError } from '../errors/HttpError.js';
import type { AccessTokenPayload } from '@erp/shared';

/**
 * Parses a duration string (e.g. '15m', '7d') into seconds.
 * Used to convert JWT expiry config values into Redis TTL integers.
 */
export const parseDurationToSeconds = (duration: string): number => {
  const units: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error(
      `Invalid duration format: '${duration}'. Expected format: '15m', '7d', etc.`,
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multiplier = units[unit];
  if (!multiplier) {throw new Error(`Unknown duration unit: ${unit}`);}
  return value * multiplier;
};

export interface GenerateAccessTokenParams {
  userId: string;
  tenantId: string;
}

export interface GenerateAccessTokenResult {
  token: string;
  jti: string;
  expiresIn: number;   // seconds
  expiresAt: Date;
}

/**
 * Generates a signed JWT access token.
 *
 * SECURITY: Payload contains ONLY: sub, tid, jti, iat, exp.
 * Never include roles, permissions, email, or any PII in the payload.
 * Roles/permissions are fetched fresh from Redis on every authenticated request.
 */
export const generateAccessToken = (
  params: GenerateAccessTokenParams,
): GenerateAccessTokenResult => {
  const jti = randomUUID();
  const expiresIn = parseDurationToSeconds(config.JWT_ACCESS_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: params.userId,
    tid: params.tenantId,
    jti,
  };

  const token = jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn,
    algorithm: 'HS256',
    issuer: 'erp-system',
    audience: 'erp-api',
  });

  return { token, jti, expiresIn, expiresAt };
};

/**
 * Verifies and decodes an access token.
 *
 * SECURITY: Validates signature, expiry, algorithm, issuer, and audience.
 * Throws typed UnauthorizedError on all failure cases — never returns null.
 * Callers should catch UnauthorizedError.
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'erp-system',
      audience: 'erp-api',
    }) as AccessTokenPayload;
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError(
        'Access token has expired. Please refresh.',
        { code: ErrorCode.AUTH_TOKEN_EXPIRED },
      );
    }
    if (error instanceof jwt.NotBeforeError) {
      throw new UnauthorizedError(
        'Access token not yet valid.',
        { code: ErrorCode.AUTH_TOKEN_INVALID },
      );
    }
    // JsonWebTokenError covers: invalid signature, malformed, wrong algorithm
    throw new UnauthorizedError(
      'Access token is invalid.',
      { code: ErrorCode.AUTH_TOKEN_INVALID },
    );
  }
};

/**
 * Decodes a token WITHOUT verifying the signature.
 *
 * SECURITY: ONLY use this when you need the payload from an already-expired
 * token (e.g. to extract the jti for blacklisting after logout).
 * NEVER use this to authenticate a user — it does not verify the signature.
 */
export const decodeTokenUnsafe = (token: string): AccessTokenPayload | null => {
  try {
    return jwt.decode(token) as AccessTokenPayload | null;
  } catch {
    return null;
  }
};

/**
 * Returns the remaining lifetime of an access token in seconds.
 * Returns 0 if the token is already expired.
 *
 * Used to set precise Redis TTL when blacklisting JTIs on logout,
 * ensuring blacklist entries never outlive the token itself.
 */
export const getTokenRemainingTTL = (payload: AccessTokenPayload): number => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - nowSeconds;
  return Math.max(0, remaining);
};
