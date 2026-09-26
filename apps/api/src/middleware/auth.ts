import { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../utils/jwt';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Missing or malformed Authorization header.' } });
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    req.auth = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json({ error: { message: 'Invalid or expired token.' } });
  }
}
