import { type Response } from 'express';

export interface ApiResponseBody<T = null> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    requestId?: string;
    timestamp: string;
    version: string;
  };
}

export interface PaginatedApiResponseBody<T> extends ApiResponseBody<T[]> {
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
): Response => {
  const response: ApiResponseBody<T> = {
    success: true,
    data,
    message,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
  return res.status(statusCode).json(response);
};

export const sendCreated = <T>(res: Response, data: T, message?: string): Response =>
  sendSuccess(res, data, message, 201);

export const sendNoContent = (res: Response): Response => {
  return res.status(204).send();
};

export const sendPaginated = <T>(
  res: Response,
  data: T[],
  pagination: PaginatedApiResponseBody<T>['pagination'],
  message?: string,
): Response => {
  const response: PaginatedApiResponseBody<T> = {
    success: true,
    data,
    pagination,
    message,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
  return res.status(200).json(response);
};
