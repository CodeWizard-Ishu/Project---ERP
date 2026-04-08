import { Router, type IRouter } from 'express';
import healthRoutes from './health.routes.js';

const router: IRouter = Router();

router.use(healthRoutes);

export default router;
