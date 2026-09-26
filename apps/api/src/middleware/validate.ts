import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export function validate(schema: AnyZodObject) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!result.success) {
      const zodError = result.error as ZodError;
      res.status(400).json({
        error: {
          message: 'Validation failed.',
          details: zodError.flatten().fieldErrors
        }
      });
      return;
    }
    next();
  };
}
