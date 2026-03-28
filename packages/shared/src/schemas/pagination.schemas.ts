import { z } from 'zod';
import { APP_CONSTANTS } from '../constants/app.constants.js';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(APP_CONSTANTS.MAX_PAGE_SIZE)
    .default(APP_CONSTANTS.DEFAULT_PAGE_SIZE),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default(APP_CONSTANTS.DEFAULT_SORT_ORDER),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const cursorPaginationQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(APP_CONSTANTS.MAX_PAGE_SIZE)
    .default(APP_CONSTANTS.DEFAULT_PAGE_SIZE),
  direction: z.enum(['forward', 'backward']).default('forward'),
});

export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;
