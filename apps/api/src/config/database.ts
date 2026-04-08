import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { config } from './env.js';

const createPrismaClient = (): PrismaClient => {
  return new PrismaClient({
    log:
      config.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (config.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

if (config.NODE_ENV === 'development') {
  prisma.$on('query' as never, (e: { query: string; duration: number }) => {
    if (e.duration > 100) {
      logger.warn('Slow query detected', {
        query: e.query,
        duration: `${String(e.duration)}ms`,
      });
    }
  });
}

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error('Prisma error', { error: e.message });
});

export async function connectDatabase(retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$connect();
      logger.info('Database connection established');
      return;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Database connection attempt ${String(attempt)}/${String(retries)} failed`, {
        error: errorMessage,
      });

      if (attempt === retries) {
        throw new Error(`Failed to connect to database after ${String(retries)} attempts: ${errorMessage}`);
      }

      const delay = Math.pow(2, attempt - 1) * 1000;
      logger.info(`Retrying database connection in ${String(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database connection closed');
}
