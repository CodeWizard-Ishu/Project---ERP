import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { config } from '../config/env.js';
import { cacheClient } from '../config/redis.js';
import { ErrorCode } from '../errors/errorCodes.js';

export const globalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      cacheClient.call(args[0]!, ...args.slice(1)) as never,
  }),
  keyGenerator: (req) => {
    const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? 'global';
    return `rl:${req.ip ?? 'unknown'}:${tenantId}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests. Please try again later.',
      },
    });
  },
  skip: (req) => {
    return req.path === '/api/v1/health' || req.path === '/api/v1/health/live';
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      cacheClient.call(args[0]!, ...args.slice(1)) as never,
  }),
  keyGenerator: (req) => `rl:auth:${req.ip ?? 'unknown'}`,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many authentication attempts. Please try again in 15 minutes.',
      },
    });
  },
});
