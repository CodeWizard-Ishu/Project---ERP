import { Router, type IRouter } from 'express';
import { HealthController } from '../modules/health/health.controller.js';
import { HealthService } from '../modules/health/health.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router: IRouter = Router();

const healthService = new HealthService();
const healthController = new HealthController(healthService);

router.get('/health', asyncHandler(healthController.getHealth));
router.get('/health/live', healthController.getLiveness);
router.get('/health/ready', asyncHandler(healthController.getReadiness));

export default router;
