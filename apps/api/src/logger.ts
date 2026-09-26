import pino from 'pino';
import { env } from './config/env';

/**
 * Root logger. Pretty output in development, JSON in production.
 *
 * Note: we deliberately do NOT use pino-pretty in production — its
 * formatting is expensive and single-threaded. In production, ship raw
 * JSON to your log aggregator (Loki, Datadog, CloudWatch) and let it
 * format for humans on the read side.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'aperture-api',
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // Never log these fields, even accidentally.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'password',
      'passwordHash',
      'password_hash',
      'token',
      'apiKey',
      'api_key',
    ],
    remove: true,
  },
});

/**
 * Returns a child logger bound to the given request ID. Use this inside
 * route handlers and services so every log line for a request shares the
 * same correlation ID.
 */
export function loggerFor(requestId: string) {
  return logger.child({ requestId });
}