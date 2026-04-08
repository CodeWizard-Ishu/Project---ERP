import type { HealthService } from './health.service.js';
import type { Request, Response } from 'express';

export class HealthController {
  private readonly healthService: HealthService;

  constructor(healthService: HealthService) {
    this.healthService = healthService;
  }

  getHealth = async (_req: Request, res: Response): Promise<void> => {
    const health = await this.healthService.checkHealth();
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(health);
  };

  getLiveness = (_req: Request, res: Response): void => {
    res.status(200).json({
      status: 'live',
      timestamp: new Date().toISOString(),
    });
  };

  getReadiness = async (_req: Request, res: Response): Promise<void> => {
    const readiness = await this.healthService.checkReadiness();
    const statusCode = readiness.ready ? 200 : 503;
    res.status(statusCode).json(readiness);
  };
}
