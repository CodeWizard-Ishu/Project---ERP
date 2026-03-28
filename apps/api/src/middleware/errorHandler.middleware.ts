import { type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import { ValidationError } from '../errors/ValidationError.js';
import { ErrorCode } from '../errors/errorCodes.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    requestId?: string;
    stack?: string;
  };
}

export const errorHandlerMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let statusCode = 500;
  let errorCode: string = ErrorCode.INTERNAL_SERVER_ERROR;
  let message = 'An unexpected error occurred';
  let isOperational = false;
  let fieldErrors: Record<string, string[]> | undefined;
  let stack: string | undefined;

  // 1. ZodError → ValidationError (422)
  if (err instanceof ZodError) {
    const validationError = new ValidationError(err);
    statusCode = validationError.statusCode;
    errorCode = validationError.code;
    message = validationError.message;
    fieldErrors = validationError.fieldErrors;
    isOperational = true;
  }
  // 2. AppError (operational errors)
  else if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    isOperational = err.isOperational;
    if (err instanceof ValidationError) {
      fieldErrors = err.fieldErrors;
    }
    stack = err.stack;
  }
  // 3. Prisma errors
  else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    isOperational = true;
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        errorCode = ErrorCode.CONFLICT;
        message = 'A record with this value already exists';
        break;
      case 'P2025':
        statusCode = 404;
        errorCode = ErrorCode.NOT_FOUND;
        message = 'Record not found';
        break;
      case 'P2003':
        statusCode = 400;
        errorCode = ErrorCode.BAD_REQUEST;
        message = 'Invalid reference — related record not found';
        break;
      default:
        statusCode = 500;
        errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
        message = 'A database error occurred';
        isOperational = false;
        break;
    }
    stack = err.stack;
  }
  // 4. Prisma connection errors
  else if (err instanceof Prisma.PrismaClientInitializationError) {
    statusCode = 503;
    errorCode = ErrorCode.SERVICE_UNAVAILABLE;
    message = 'Database service unavailable';
    isOperational = true;
  }
  // 5. JWT errors
  else if (err instanceof Error && err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = ErrorCode.AUTH_TOKEN_INVALID;
    message = 'Invalid authentication token';
    isOperational = true;
    stack = err.stack;
  } else if (err instanceof Error && err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = ErrorCode.AUTH_TOKEN_EXPIRED;
    message = 'Authentication token has expired';
    isOperational = true;
    stack = err.stack;
  }
  // 6. Generic Error
  else if (err instanceof Error) {
    message = err.message;
    stack = err.stack;
  }

  // Logging
  if (!isOperational) {
    logger.error('Unhandled error', {
      error: message,
      code: errorCode,
      statusCode,
      stack: stack ?? (err instanceof Error ? err.stack : undefined),
      path: req.originalUrl,
      method: req.method,
      requestId: req.requestId,
    });
  } else {
    logger.warn('Operational error', {
      error: message,
      code: errorCode,
      statusCode,
      path: req.originalUrl,
      method: req.method,
      requestId: req.requestId,
    });
  }

  // Response
  const responseBody: ErrorResponseBody = {
    success: false,
    error: {
      code: errorCode,
      message:
        config.NODE_ENV === 'production' && !isOperational
          ? 'An unexpected error occurred'
          : message,
      requestId: req.requestId,
    },
  };

  if (fieldErrors) {
    responseBody.error.fields = fieldErrors;
  }

  if (config.NODE_ENV === 'development' && stack) {
    responseBody.error.stack = stack;
  }

  res.status(statusCode).json(responseBody);
};
