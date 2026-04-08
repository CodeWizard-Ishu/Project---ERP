import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SYSTEM_ROLES } from '@erp/shared';
import { logger } from '../../src/utils/logger.js';

const SUPERADMIN_EMAIL = process.env['SUPERADMIN_EMAIL'] ?? 'superadmin@erp.local';
const SUPERADMIN_PASSWORD = process.env['SUPERADMIN_PASSWORD'] ?? 'SuperAdmin@123!';

export const seedSuperadminUser = async (
  prisma: PrismaClient,
  superadminTenantId: string,
): Promise<void> => {
  logger.info('[Seed] Seeding superadmin user...');

  if (SUPERADMIN_PASSWORD === 'SuperAdmin@123!') {
    logger.warn(
      '[Seed] ⚠️  Using default superadmin password. Set SUPERADMIN_PASSWORD env var in production.',
    );
  }

  const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);

  let user = await prisma.user.findFirst({
    where: { tenantId: superadminTenantId, email: SUPERADMIN_EMAIL },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        tenantId: superadminTenantId,
        email: SUPERADMIN_EMAIL,
        passwordHash,
        firstName: 'Platform',
        lastName: 'Admin',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
  }

  // Assign SUPERADMIN system role
  const superadminRole = await prisma.role.findFirst({
    where: { name: SYSTEM_ROLES.SUPERADMIN, tenantId: null },
  });

  if (!superadminRole) {
    throw new Error('[Seed] SUPERADMIN role not found — run seeds/02-roles.seed.ts first');
  }

  const existingAssignment = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: user.id, roleId: superadminRole.id } },
  });

  if (!existingAssignment) {
    await prisma.userRole.create({
      data: { userId: user.id, roleId: superadminRole.id },
    });
  }

  logger.info(`[Seed] Superadmin user ready: email=${SUPERADMIN_EMAIL}`);
};
