import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger.js';
import { seedPermissions } from './seeds/01-permissions.seed.js';
import { seedRoles } from './seeds/02-roles.seed.js';
import { seedSuperadminTenant } from './seeds/03-superadmin-tenant.seed.js';
import { seedSuperadminUser } from './seeds/04-superadmin-user.seed.js';
import { seedDemoTenant } from './seeds/05-demo-tenant.seed.js';

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'error' }],
});

async function main(): Promise<void> {
  logger.info('='.repeat(60));
  logger.info('[Seed] Starting ERP database seed...');
  logger.info('='.repeat(60));

  // Order matters — each step depends on the previous
  await seedPermissions(prisma);
  await seedRoles(prisma);                                // system roles (SUPERADMIN)
  const superadminTenantId = await seedSuperadminTenant(prisma);
  await seedSuperadminUser(prisma, superadminTenantId);
  await seedDemoTenant(prisma);

  logger.info('='.repeat(60));
  logger.info('[Seed] ✅ Database seed complete!');
  logger.info('[Seed] Demo credentials:');
  logger.info('[Seed]   Admin:    admin@demo-company.com / Admin@Demo123!');
  logger.info('[Seed]   Manager:  manager@demo-company.com / Manager@Demo123!');
  logger.info('[Seed]   Employee: employee@demo-company.com / Employee@Demo123!');
  logger.info('[Seed]   Superadmin: superadmin@erp.local / SuperAdmin@123!');
  logger.info('='.repeat(60));
}

main()
  .catch((error: unknown) => {
    logger.error('[Seed] ❌ Seed failed:', { error });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
