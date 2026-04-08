import { AppError } from './AppError.js';
import { ErrorCode } from './errorCodes.js';
import type { ZodError } from 'zod';

export class ValidationError extends AppError {
  public readonly fieldErrors: Record<string, string[]>;

  constructor(zodError: ZodError) {
    const flattened = zodError.flatten();
    const fieldErrors: Record<string, string[]> = {};

    for (const [key, value] of Object.entries(flattened.fieldErrors)) {
      if (Array.isArray(value)) {
        fieldErrors[key] = value;
      }
    }

    super('Validation failed', ErrorCode.VALIDATION_ERROR, 422, true, { fieldErrors });
    this.fieldErrors = fieldErrors;
  }
}
