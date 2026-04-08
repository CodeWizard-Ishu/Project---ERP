import { ErrorCode } from '../errors/errorCodes.js';
import type { Request, Response, NextFunction } from 'express';

export const notFoundMiddleware = (req: Request, res: Response, _next: NextFunction): void => {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `Route ${req.method} ${req.originalUrl} not found`,
      requestId: req.requestId,
    },
  });
};
