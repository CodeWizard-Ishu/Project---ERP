export type RbacResource =
  | 'users'
  | 'roles'
  | 'tenants'
  | 'hr'
  | 'payroll'
  | 'finance'
  | 'inventory'
  | 'procurement'
  | 'crm'
  | 'reports'
  | 'settings'
  | 'audit';

export type RbacAction = 'read' | 'create' | 'update' | 'delete' | 'approve' | 'export' | 'import';

export type Permission = `${RbacResource}:${RbacAction}`;

export interface Role {
  id: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
}

export interface PermissionRecord {
  id: string;
  resource: RbacResource;
  action: RbacAction;
  description: string | null;
}
