import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, SYSTEM_ROLES, DEFAULT_TENANT_ROLES } from '@erp/shared';
import { logger } from '../../src/utils/logger.js';

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  [SYSTEM_ROLES.SUPERADMIN]: Object.values(PERMISSIONS),

  [DEFAULT_TENANT_ROLES.ADMIN]: [
    PERMISSIONS.USERS_READ, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_UPDATE, PERMISSIONS.USERS_DELETE,
    PERMISSIONS.ROLES_READ, PERMISSIONS.ROLES_CREATE, PERMISSIONS.ROLES_UPDATE, PERMISSIONS.ROLES_DELETE,
    PERMISSIONS.HR_READ, PERMISSIONS.HR_CREATE, PERMISSIONS.HR_UPDATE, PERMISSIONS.HR_DELETE, PERMISSIONS.HR_EXPORT,
    PERMISSIONS.PAYROLL_READ, PERMISSIONS.PAYROLL_CREATE, PERMISSIONS.PAYROLL_APPROVE, PERMISSIONS.PAYROLL_EXPORT,
    PERMISSIONS.FINANCE_READ, PERMISSIONS.FINANCE_CREATE, PERMISSIONS.FINANCE_UPDATE, PERMISSIONS.FINANCE_DELETE, PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.FINANCE_EXPORT,
    PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_CREATE, PERMISSIONS.INVENTORY_UPDATE, PERMISSIONS.INVENTORY_DELETE, PERMISSIONS.INVENTORY_EXPORT,
    PERMISSIONS.PROCUREMENT_READ, PERMISSIONS.PROCUREMENT_CREATE, PERMISSIONS.PROCUREMENT_UPDATE, PERMISSIONS.PROCUREMENT_DELETE, PERMISSIONS.PROCUREMENT_APPROVE,
    PERMISSIONS.CRM_READ, PERMISSIONS.CRM_CREATE, PERMISSIONS.CRM_UPDATE, PERMISSIONS.CRM_DELETE, PERMISSIONS.CRM_EXPORT,
    PERMISSIONS.REPORTS_READ, PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.SETTINGS_READ, PERMISSIONS.SETTINGS_UPDATE,
    PERMISSIONS.AUDIT_READ,
  ],

  [DEFAULT_TENANT_ROLES.MANAGER]: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.HR_READ, PERMISSIONS.HR_UPDATE,
    PERMISSIONS.PAYROLL_READ, PERMISSIONS.PAYROLL_APPROVE,
    PERMISSIONS.FINANCE_READ, PERMISSIONS.FINANCE_APPROVE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.PROCUREMENT_READ, PERMISSIONS.PROCUREMENT_APPROVE,
    PERMISSIONS.CRM_READ, PERMISSIONS.CRM_CREATE, PERMISSIONS.CRM_UPDATE,
    PERMISSIONS.REPORTS_READ, PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.SETTINGS_READ,
  ],

  [DEFAULT_TENANT_ROLES.EMPLOYEE]: [
    PERMISSIONS.HR_READ,
    PERMISSIONS.PAYROLL_READ,
    PERMISSIONS.CRM_READ,
  ],
};

export const seedRoles = async (
  prisma: PrismaClient,
  tenantId?: string,
): Promise<void> => {
  const scope = tenantId ? `tenant ${tenantId}` : 'system';
  logger.info(`[Seed] Seeding roles for ${scope}...`);

  const rolesToSeed = tenantId
    ? Object.values(DEFAULT_TENANT_ROLES)
    : Object.values(SYSTEM_ROLES);

  for (const roleName of rolesToSeed) {
    // Find or create role
    let role = await prisma.role.findFirst({
      where: { name: roleName, tenantId: tenantId ?? null },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          name: roleName,
          tenantId: tenantId ?? null,
          isSystem: true,
          description: `Built-in ${roleName.toLowerCase()} role`,
        },
      });
    }

    // Get permissions for this role
    const permissionStrings = ROLE_PERMISSION_MAP[roleName] ?? [];

    // Resolve permission IDs
    const permissions = await prisma.permission.findMany({
      where: {
        OR: permissionStrings.map((p) => {
          const [resource, action] = p.split(':') as [string, string];
          return { resource, action };
        }),
      },
    });

    // Upsert role_permissions
    for (const permission of permissions) {
      const existing = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      });

      if (!existing) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
      }
    }

    logger.info(`[Seed]   Role '${roleName}': ${String(permissions.length)} permissions assigned`);
  }
};
