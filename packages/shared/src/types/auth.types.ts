import type { UserProfile } from './user.types.js';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;        // access token TTL in seconds (e.g. 900)
  tokenType: 'Bearer';
  user: UserProfile;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface RegisterResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AccessTokenPayload {
  sub: string;              // userId
  tid: string;              // tenantId
  jti: string;              // JWT ID — unique per token, used for blacklisting
  iat: number;
  exp: number;
}

export interface ForgotPasswordResponse {
  message: string;          // Always same message to prevent user enumeration
}

export interface PasswordResetResponse {
  message: string;
}
