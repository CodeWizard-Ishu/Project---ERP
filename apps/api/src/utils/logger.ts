import { AsyncLocalStorage } from 'async_hooks';
import winston from 'winston';
import { config } from '../config/env.js';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const requestContextFormat = winston.format((info) => {
  const context = requestContext.getStore();
  if (context) {
    info['requestId'] = context.requestId;
    if (context.tenantId) {
      info['tenantId'] = context.tenantId;
    }
    if (context.userId) {
      info['userId'] = context.userId;
    }
  }
  return info;
});

const developmentFormat = combine(
  requestContextFormat(),
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, requestId, stack, ...meta }) => {
    const rid = requestId ? ` [${String(requestId as string)}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';
    const stackStr = stack ? `\n${String(stack as string)}` : '';
    return `${String(ts)}${rid} [${level}]: ${String(message)}${stackStr}${metaStr}`;
  }),
);

const productionFormat = combine(
  requestContextFormat(),
  timestamp(),
  errors({ stack: true }),
  json(),
);

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'cyan',
  },
};

winston.addColors(customLevels.colors);

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  levels: customLevels.levels,
  format: config.LOG_PRETTY ? developmentFormat : productionFormat,
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

export const morganStream = {
  write: (message: string): void => {
    logger.log('http', message.trimEnd());
  },
};
