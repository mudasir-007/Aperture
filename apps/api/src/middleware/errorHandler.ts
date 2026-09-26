import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

const STATUS_MAP: Record<string, number> = {
  EMAIL_ALREADY_EXISTS: 409,
  INVALID_CREDENTIALS: 401,
  USER_NOT_FOUND: 404,
  DOCUMENT_NOT_FOUND: 404,
  CONVERSATION_NOT_FOUND: 404,
  FORBIDDEN: 403,
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.errors });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = STATUS_MAP[message] ?? 500;

  if (status === 500) {
    // Log the full error server-side but don't leak internals to the client.
    console.error('[error]', err);
  }

  res.status(status).json({ error: message });
}