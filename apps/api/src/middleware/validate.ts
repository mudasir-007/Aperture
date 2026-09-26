import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodTypeAny } from 'zod';

/**
 * Zod validation middleware. Validates req.body against the provided schema.
 * On success, req.body is replaced with the parsed/coerced output.
 * On failure, returns 400 with field-level errors.
 */
export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const zodError = result.error as ZodError;
      res.status(400).json({
        error: {
          message: 'Validation failed.',
          details: zodError.flatten().fieldErrors,
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
