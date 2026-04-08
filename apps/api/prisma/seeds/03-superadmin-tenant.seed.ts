import { PrismaClient } from '@prisma/client';
import { logger } from '../../src/utils/logger.js';

export const SUPERADMIN_TENANT_SLUG = 'platform';

export const seedSuperadminTenant = async (prisma: PrismaClient): Promise<string> => {
  logger.info('[Seed] Seeding superadmin tenant...');

  let tenant = await prisma.tenant.findFirst({
    where: { slug: SUPERADMIN_TENANT_SLUG },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'ERP Platform',
        slug: SUPERADMIN_TENANT_SLUG,
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
        settings: {
          timezone: 'UTC',
          currency: 'USD',
          dateFormat: 'YYYY-MM-DD',
          fiscalYearStartMonth: 1,
        },
        metadata: { isSuperadminTenant: true },
      },
    });
  }

  logger.info(`[Seed] Superadmin tenant ready: id=${tenant.id}, slug=${tenant.slug}`);
  return tenant.id;
};
