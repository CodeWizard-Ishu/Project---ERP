import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS } from '@erp/shared';
import { logger } from '../../src/utils/logger.js';

export const seedPermissions = async (prisma: PrismaClient): Promise<void> => {
  logger.info('[Seed] Seeding permissions...');

  const permissionsData = ALL_PERMISSIONS.map((perm) => {
    const [resource, action] = perm.split(':') as [string, string];
    return {
      resource,
      action,
      description: `Permission to ${action} ${resource} resources`,
    };
  });

  let created = 0;
  let skipped = 0;

  for (const perm of permissionsData) {
    const existing = await prisma.permission.findUnique({
      where: { resource_action: { resource: perm.resource, action: perm.action } },
    });

    if (existing) {
      skipped++;
    } else {
      await prisma.permission.create({ data: perm });
      created++;
    }
  }

  logger.info(`[Seed] Permissions: ${String(created)} created, ${String(skipped)} already existed`);
};
