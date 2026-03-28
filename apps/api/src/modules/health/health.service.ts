import { prisma } from '../../config/database.js';
import { cacheClient } from '../../config/redis.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

interface CheckResult {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

interface MemoryCheck {
  status: 'ok' | 'warning' | 'critical';
  heapUsedMB: number;
  heapTotalMB: number;
  rssMemoryMB: number;
  usagePercent: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    memory: MemoryCheck;
  };
}

export class HealthService {
  async checkHealth(): Promise<HealthCheckResponse> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const memory = this.checkMemory();

    let status: HealthCheckResponse['status'] = 'healthy';

    if (database.status === 'down' || redis.status === 'down') {
      status = 'unhealthy';
    } else if (memory.status === 'warning') {
      status = 'degraded';
    } else if (memory.status === 'critical') {
      status = 'unhealthy';
    }

    return {
      status,
      version: '0.1.0',
      environment: config.NODE_ENV,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database,
        redis,
        memory,
      },
    };
  }

  async checkReadiness(): Promise<{ ready: boolean; checks: { database: CheckResult; redis: CheckResult } }> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return {
      ready: database.status === 'up' && redis.status === 'up',
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database health check failed', { error: errorMessage });
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: errorMessage,
      };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await cacheClient.ping();
      return {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Redis health check failed', { error: errorMessage });
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: errorMessage,
      };
    }
  }

  private checkMemory(): MemoryCheck {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMemoryMB = Math.round(memUsage.rss / 1024 / 1024);
    const usagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

    let status: MemoryCheck['status'] = 'ok';
    if (usagePercent > 95) {
      status = 'critical';
    } else if (usagePercent > 80) {
      status = 'warning';
    }

    return {
      status,
      heapUsedMB,
      heapTotalMB,
      rssMemoryMB,
      usagePercent,
    };
  }
}
