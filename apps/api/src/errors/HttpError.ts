import { AppError } from './AppError.js';
import { ErrorCode } from './errorCodes.js';

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', context?: Record<string, unknown>) {
    super(message, ErrorCode.NOT_FOUND, 404, true, context);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', context?: Record<string, unknown>) {
    super(message, ErrorCode.UNAUTHORIZED, 401, true, context);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', context?: Record<string, unknown>) {
    super(message, ErrorCode.FORBIDDEN, 403, true, context);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', context?: Record<string, unknown>) {
    super(message, ErrorCode.BAD_REQUEST, 400, true, context);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', context?: Record<string, unknown>) {
    super(message, ErrorCode.CONFLICT, 409, true, context);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'Validation failed', context?: Record<string, unknown>) {
    super(message, ErrorCode.VALIDATION_ERROR, 422, true, context);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', context?: Record<string, unknown>) {
    super(message, ErrorCode.SERVICE_UNAVAILABLE, 503, true, context);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', context?: Record<string, unknown>) {
    super(message, ErrorCode.INTERNAL_SERVER_ERROR, 500, false, context);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', context?: Record<string, unknown>) {
    super(message, ErrorCode.RATE_LIMIT_EXCEEDED, 429, true, context);
  }
}
