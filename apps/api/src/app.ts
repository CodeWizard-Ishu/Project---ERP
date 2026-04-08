import compression from 'compression';
import express, { type Express } from 'express';
import { config } from './config/env.js';
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  helmetMiddleware,
  corsMiddleware,
  hppMiddleware,
  globalRateLimiter,
  notFoundMiddleware,
  errorHandlerMiddleware,
} from './middleware/index.js';
import router from './routes/index.js';

const app: Express = express();

// Trust proxy (for correct IP detection behind nginx/load balancer)
app.set('trust proxy', 1);

// Don't advertise Express
app.disable('x-powered-by');

// Pretty JSON in development
app.set('json spaces', config.NODE_ENV === 'development' ? 2 : 0);

// ─── Middleware Stack (ORDER MATTERS) ────────────────────────

// 1. Request ID — must be first
app.use(requestIdMiddleware);

// 2. HTTP request logging
app.use(requestLoggerMiddleware);

// 3. Security headers
app.use(helmetMiddleware);

// 4. CORS
app.use(corsMiddleware);

// 5. Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. HTTP Parameter Pollution protection
app.use(hppMiddleware);

// 7. Rate limiting
app.use(globalRateLimiter);

// 8. Response compression
app.use(compression());

// ─── Routes ──────────────────────────────────────────────────

app.use(`/api/${config.API_VERSION}`, router);

// ─── Error Handling ──────────────────────────────────────────

// 404 handler — catches unmatched routes
app.use(notFoundMiddleware);

// Global error handler — MUST be last with 4 params
app.use(errorHandlerMiddleware);

export default app;
