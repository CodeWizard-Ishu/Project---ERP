import type { Permission, RbacResource, RbacAction } from '../types/rbac.types.js';

const p = (resource: RbacResource, action: RbacAction): Permission =>
  `${resource}:${action}`;

export const PERMISSIONS = {
  // ─── User management ───────────────────────────────────────────
  USERS_READ:   p('users', 'read'),
  USERS_CREATE: p('users', 'create'),
  USERS_UPDATE: p('users', 'update'),
  USERS_DELETE: p('users', 'delete'),

  // ─── Role management ───────────────────────────────────────────
  ROLES_READ:   p('roles', 'read'),
  ROLES_CREATE: p('roles', 'create'),
  ROLES_UPDATE: p('roles', 'update'),
  ROLES_DELETE: p('roles', 'delete'),

  // ─── HR module ─────────────────────────────────────────────────
  HR_READ:      p('hr', 'read'),
  HR_CREATE:    p('hr', 'create'),
  HR_UPDATE:    p('hr', 'update'),
  HR_DELETE:    p('hr', 'delete'),
  HR_EXPORT:    p('hr', 'export'),

  // ─── Payroll module ────────────────────────────────────────────
  PAYROLL_READ:    p('payroll', 'read'),
  PAYROLL_CREATE:  p('payroll', 'create'),
  PAYROLL_APPROVE: p('payroll', 'approve'),
  PAYROLL_EXPORT:  p('payroll', 'export'),

  // ─── Finance module ────────────────────────────────────────────
  FINANCE_READ:    p('finance', 'read'),
  FINANCE_CREATE:  p('finance', 'create'),
  FINANCE_UPDATE:  p('finance', 'update'),
  FINANCE_DELETE:  p('finance', 'delete'),
  FINANCE_APPROVE: p('finance', 'approve'),
  FINANCE_EXPORT:  p('finance', 'export'),

  // ─── Inventory module ──────────────────────────────────────────
  INVENTORY_READ:   p('inventory', 'read'),
  INVENTORY_CREATE: p('inventory', 'create'),
  INVENTORY_UPDATE: p('inventory', 'update'),
  INVENTORY_DELETE: p('inventory', 'delete'),
  INVENTORY_EXPORT: p('inventory', 'export'),

  // ─── Procurement module ────────────────────────────────────────
  PROCUREMENT_READ:    p('procurement', 'read'),
  PROCUREMENT_CREATE:  p('procurement', 'create'),
  PROCUREMENT_UPDATE:  p('procurement', 'update'),
  PROCUREMENT_DELETE:  p('procurement', 'delete'),
  PROCUREMENT_APPROVE: p('procurement', 'approve'),

  // ─── CRM module ────────────────────────────────────────────────
  CRM_READ:   p('crm', 'read'),
  CRM_CREATE: p('crm', 'create'),
  CRM_UPDATE: p('crm', 'update'),
  CRM_DELETE: p('crm', 'delete'),
  CRM_EXPORT: p('crm', 'export'),

  // ─── Reports ───────────────────────────────────────────────────
  REPORTS_READ:   p('reports', 'read'),
  REPORTS_EXPORT: p('reports', 'export'),

  // ─── Settings ──────────────────────────────────────────────────
  SETTINGS_READ:   p('settings', 'read'),
  SETTINGS_UPDATE: p('settings', 'update'),

  // ─── Audit logs ────────────────────────────────────────────────
  AUDIT_READ: p('audit', 'read'),

  // ─── Superadmin only ───────────────────────────────────────────
  TENANTS_READ:   p('tenants', 'read'),
  TENANTS_CREATE: p('tenants', 'create'),
  TENANTS_UPDATE: p('tenants', 'update'),
  TENANTS_DELETE: p('tenants', 'delete'),
} as const satisfies Record<string, Permission>;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionValue = (typeof PERMISSIONS)[PermissionKey];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);
