import { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface SqliteError extends Error {
  code?: string;
}

function isSqliteConstraintError(err: unknown): err is SqliteError {
  return err instanceof Error && typeof (err as SqliteError).code === 'string' && (err as SqliteError).code!.startsWith('SQLITE_CONSTRAINT');
}

/**
 * Central error handler: logs full detail server-side, returns a
 * consistent, non-leaky error envelope to clients (docs/architecture.md
 * Section 12).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message } });
    return;
  }

  if (isSqliteConstraintError(err)) {
    // eslint-disable-next-line no-console
    console.error('Database constraint error:', err.code, err.message);
    res.status(409).json({ error: { message: 'A data consistency error occurred.' } });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { message: 'An unexpected error occurred.' } });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.path}` } });
}
