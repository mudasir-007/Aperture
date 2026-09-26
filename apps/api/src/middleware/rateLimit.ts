import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Simple express-rate-limit wrappers. When RATE_LIMIT_ENABLED=false (the
 * default in local dev / test) every limiter is replaced with a no-op
 * passthrough so tests and local runs are never throttled.
 *
 * In production (RATE_LIMIT_ENABLED=true) the limiters are active.
 *
 * All three limiters use the in-memory store (the default). For
 * multi-instance deployments swap to a Redis store via rate-limit-flexible
 * or the ioredis store adapter — that change stays in this file only.
 */

const ENABLED = env.RATE_LIMIT_ENABLED;

/** 10 auth attempts per 15 minutes per IP. */
export const rateLimitAuth = ENABLED
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many auth attempts. Please try again later.' },
    })
  : (_req: any, _res: any, next: any) => next();

/** 30 upload requests per hour per IP. */
export const rateLimitUpload = ENABLED
  ? rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Upload rate limit exceeded. Please try again later.' },
    })
  : (_req: any, _res: any, next: any) => next();

/** 60 chat requests per minute per IP. */
export const rateLimitChat = ENABLED
  ? rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Chat rate limit exceeded. Please slow down.' },
    })
  : (_req: any, _res: any, next: any) => next();
