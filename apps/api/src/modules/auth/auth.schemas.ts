import { z } from 'zod';

/**
 * Password policy for ERP systems (handles sensitive financial data):
 * - Min 8 / Max 128 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 *
 * The 128-char max prevents bcrypt DoS attacks (bcrypt truncates at 72 bytes
 * in some implementations; max 128 chars ensures the policy stays well under).
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  );

/**
 * Tenant slug: lowercase alphanumeric + hyphens, 3–50 chars.
 * Leading and trailing hyphens are disallowed.
 * Example valid values: 'acme-corp', 'my-company-2024'
 */
const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(50, 'Slug must not exceed 50 characters')
  .regex(
    /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/,
    'Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen',
  );

export const registerSchema = z.object({
  tenantName: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(255, 'Company name must not exceed 255 characters')
    .trim(),
  tenantSlug: slugSchema,
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must not exceed 100 characters')
    .trim(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must not exceed 100 characters')
    .trim(),
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase()
    .trim(),
  password: passwordSchema,
  timezone: z.string().optional().default('UTC'),
  currency: z
    .string()
    .length(3, 'Currency must be a 3-letter ISO 4217 code (e.g. INR, USD)')
    .optional()
    .default('USD'),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255)
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password must not exceed 128 characters'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(128, 'Invalid refresh token')   // 64 bytes hex = 128 chars
    .max(128, 'Invalid refresh token'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const resetPasswordSchema = z.object({
  token: z
    .string()
    .min(64, 'Invalid reset token')
    .max(64, 'Invalid reset token'),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

// ─── Inferred types ────────────────────────────────────────────────
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
