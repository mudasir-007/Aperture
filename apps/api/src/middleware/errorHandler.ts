import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as any).id as string | undefined;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.errors,
      requestId,
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      requestId,
    });
    return;
  }

  // Unknown error — log with full stack, respond with sanitized message.
  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error(
    {
      requestId,
      err,
      path: req.path,
      method: req.method,
    },
    'Unhandled error in request handler'
  );

  res.status(500).json({
    error: 'Internal server error',
    requestId,
  });
}