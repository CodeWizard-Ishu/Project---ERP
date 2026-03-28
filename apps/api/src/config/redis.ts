import { Redis } from 'ioredis';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

const createRedisClient = (db: number, name: string): Redis => {
  const client = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    db,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        logger.error(`[Redis:${name}] Max retries reached. Giving up.`);
        return null;
      }
      const delay = Math.min(times * 100, 3000);
      logger.warn(`[Redis:${name}] Retrying connection in ${String(delay)}ms (attempt ${String(times)})`);
      return delay;
    },
  });

  client.on('connect', () => {
    logger.info(`[Redis:${name}] Connecting...`);
  });
  client.on('ready', () => {
    logger.info(`[Redis:${name}] Ready`);
  });
  client.on('error', (err: Error) => {
    logger.error(`[Redis:${name}] Error`, { error: err.message });
  });
  client.on('close', () => {
    logger.warn(`[Redis:${name}] Connection closed`);
  });
  client.on('reconnecting', () => {
    logger.info(`[Redis:${name}] Reconnecting...`);
  });

  return client;
};

export const cacheClient = createRedisClient(config.REDIS_DB, 'cache');
export const queueClient = createRedisClient(config.REDIS_QUEUE_DB, 'queue');

export async function connectRedis(): Promise<void> {
  const connectIfNeeded = async (client: Redis, name: string): Promise<void> => {
    if (client.status === 'ready') {
      logger.info(`[Redis:${name}] Already connected`);
      return;
    }
    try {
      await client.connect();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('already')) {
        logger.info(`[Redis:${name}] Already connected`);
        return;
      }
      throw error;
    }
  };

  await Promise.all([
    connectIfNeeded(cacheClient, 'cache'),
    connectIfNeeded(queueClient, 'queue'),
  ]);
  logger.info('Redis connections established');
}

export async function disconnectRedis(): Promise<void> {
  await Promise.all([cacheClient.quit(), queueClient.quit()]);
  logger.info('Redis connections closed');
}
