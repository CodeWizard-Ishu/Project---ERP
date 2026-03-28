import { prisma } from '../src/config/database.js';
import { logger } from '../src/utils/logger.js';

async function seed(): Promise<void> {
  logger.info('🌱 Starting database seed...');

  try {
    // Phase 1: No tables to seed yet.
    // Phase 2 will add:
    // - Superadmin user
    // - Demo tenant
    // - Default roles and permissions

    logger.info('✅ Database seed completed successfully');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Database seed failed', { error: errorMessage });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  logger.error('Seed script crashed', { error: errorMessage });
  process.exit(1);
});
