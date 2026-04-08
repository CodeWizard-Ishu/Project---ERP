export const SYSTEM_ROLES = {
  SUPERADMIN: 'SUPERADMIN',
} as const;

export const DEFAULT_TENANT_ROLES = {
  ADMIN:    'ADMIN',
  MANAGER:  'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];
export type DefaultTenantRole = (typeof DEFAULT_TENANT_ROLES)[keyof typeof DEFAULT_TENANT_ROLES];
export type BuiltInRole = SystemRole | DefaultTenantRole;
