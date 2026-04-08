import { randomUUID } from 'crypto';
import { requestContext } from '../utils/logger.js';
import type { Request, Response, NextFunction } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-ID';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId =
    (req.headers[REQUEST_ID_HEADER.toLowerCase()] as string | undefined) ?? randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  requestContext.run({ requestId }, () => {
    next();
  });
};
