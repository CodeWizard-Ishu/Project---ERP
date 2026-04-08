import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_TENANT_ROLES } from '@erp/shared';
import { seedRoles } from './02-roles.seed.js';
import { logger } from '../../src/utils/logger.js';

export const DEMO_TENANT_SLUG = 'demo-company';

export const seedDemoTenant = async (prisma: PrismaClient): Promise<void> => {
  logger.info('[Seed] Seeding demo tenant...');

  let tenant = await prisma.tenant.findFirst({
    where: { slug: DEMO_TENANT_SLUG },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Demo Company Pvt. Ltd.',
        slug: DEMO_TENANT_SLUG,
        plan: 'PROFESSIONAL',
        status: 'ACTIVE',
        settings: {
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          dateFormat: 'DD/MM/YYYY',
          fiscalYearStartMonth: 4,
        },
        metadata: { isDemoTenant: true },
      },
    });
  }

  // Seed default roles for this tenant
  await seedRoles(prisma, tenant.id);

  // Fetch the seeded roles
  const [adminRole, managerRole, employeeRole] = await Promise.all([
    prisma.role.findFirstOrThrow({ where: { tenantId: tenant.id, name: DEFAULT_TENANT_ROLES.ADMIN } }),
    prisma.role.findFirstOrThrow({ where: { tenantId: tenant.id, name: DEFAULT_TENANT_ROLES.MANAGER } }),
    prisma.role.findFirstOrThrow({ where: { tenantId: tenant.id, name: DEFAULT_TENANT_ROLES.EMPLOYEE } }),
  ]);

  // Create demo users
  const demoUsers = [
    {
      email: 'admin@demo-company.com',
      firstName: 'Arjun',
      lastName: 'Sharma',
      role: adminRole,
      password: 'Admin@Demo123!',
    },
    {
      email: 'manager@demo-company.com',
      firstName: 'Priya',
      lastName: 'Patel',
      role: managerRole,
      password: 'Manager@Demo123!',
    },
    {
      email: 'employee@demo-company.com',
      firstName: 'Rahul',
      lastName: 'Verma',
      role: employeeRole,
      password: 'Employee@Demo123!',
    },
  ];

  for (const demoUser of demoUsers) {
    const passwordHash = await bcrypt.hash(demoUser.password, 12);

    let user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, email: demoUser.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: demoUser.email,
          passwordHash,
          firstName: demoUser.firstName,
          lastName: demoUser.lastName,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });
    }

    const existingAssignment = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: user.id, roleId: demoUser.role.id } },
    });

    if (!existingAssignment) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: demoUser.role.id },
      });
    }

    logger.info(`[Seed]   Demo user: ${demoUser.email} (${demoUser.role.name})`);
  }

  logger.info(`[Seed] Demo tenant ready: slug=${DEMO_TENANT_SLUG}`);
};
