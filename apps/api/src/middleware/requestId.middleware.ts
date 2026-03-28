import { randomUUID } from 'crypto';
import { type Request, type Response, type NextFunction } from 'express';
import { requestContext } from '../utils/logger.js';

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
