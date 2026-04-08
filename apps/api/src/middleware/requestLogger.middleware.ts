import morgan from 'morgan';
import { morganStream } from '../utils/logger.js';

morgan.token('request-id', (req) => ((req as unknown as Express.Request).requestId) ?? '-');
morgan.token('body-size', (req) => req.headers['content-length'] ?? '0');

export const requestLoggerMiddleware = morgan(
  ':method :url :status :res[content-length] bytes - :response-time ms [:request-id]',
  {
    stream: morganStream,
    skip: (req) => req.url === '/api/v1/health/live',
  },
);
