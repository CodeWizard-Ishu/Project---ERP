import { randomBytes, createHash } from 'crypto';

/**
 * Generates a cryptographically random refresh token.
 * Returns 128 hex characters (64 bytes of entropy).
 *
 * SECURITY: This raw value is sent to the client and NEVER stored in the database.
 * Only the SHA-256 hash is persisted. If the DB is breached, tokens cannot be replayed.
 */
export const generateRefreshToken = (): string => {
  return randomBytes(64).toString('hex');
};

/**
 * Hashes a refresh token using SHA-256.
 * Only this hash is stored in the database.
 *
 * SECURITY: SHA-256 is one-way — the database stores only this hash.
 * A DB breach cannot expose the raw token needed to impersonate a session.
 */
export const hashRefreshToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex');
};

/**
 * Generates a password reset token.
 * 32 bytes = 64 hex characters. Short enough to fit safely in a URL.
 *
 * SECURITY: Cryptographically random — not guessable. Single-use via Redis delete on consumption.
 */
export const generatePasswordResetToken = (): string => {
  return randomBytes(32).toString('hex');
};

/**
 * Hashes a password reset token using SHA-256 for storage in Redis.
 * Same approach as refresh tokens — only the hash is persisted.
 */
export const hashPasswordResetToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex');
};

/**
 * Converts a JWT expiry string (e.g. '7d', '15m') to milliseconds.
 * Used for cookie maxAge configuration.
 * Defaults to 7 days if the format is unrecognised.
 */
export const parseExpiryToMs = (expiry: string): number => {
  const units: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) {return 7 * 86_400_000;} // default 7d
  const value = parseInt(match[1], 10);
  const unit = match[2];
  return value * (units[unit] ?? 86_400_000);
};
