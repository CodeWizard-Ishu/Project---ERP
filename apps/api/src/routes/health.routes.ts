import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HealthController } from '../modules/health/health.controller.js';
import { HealthService } from '../modules/health/health.service.js';

const router = Router();

const healthService = new HealthService();
const healthController = new HealthController(healthService);

router.get('/health', asyncHandler(healthController.getHealth));
router.get('/health/live', healthController.getLiveness);
router.get('/health/ready', asyncHandler(healthController.getReadiness));

export default router;
