import { Router, type IRouter } from 'express';
import authRouter from '../modules/auth/auth.routes.js';
import healthRoutes from './health.routes.js';

const router: IRouter = Router();

router.use(healthRoutes);
router.use('/auth', authRouter);

export default router;
