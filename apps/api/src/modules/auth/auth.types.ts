// ─── DTOs (Data Transfer Objects — validated input shapes) ─────────

export interface RegisterDto {
  tenantName: string;           // Company name — creates a new tenant
  tenantSlug: string;           // URL slug for the tenant
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  timezone?: string;
  currency?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

// ─── Internal types ────────────────────────────────────────────────

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  permissions: string[];
  roles: string[];
}

export interface CreateRefreshTokenParams {
  userId: string;
  tenantId: string;
  familyId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RotateRefreshTokenParams {
  oldTokenHash: string;
  userId: string;
  tenantId: string;
  ipAddress?: string;
  userAgent?: string;
}
