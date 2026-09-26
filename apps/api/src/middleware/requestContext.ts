import { randomUUID } from 'crypto';
import pinoHttp from 'pino-http';
import { Request } from 'express';
import { logger } from '../logger';

/**
 * Express middleware that:
 *  1. Assigns a request ID (from the incoming X-Request-Id header or a fresh UUID).
 *  2. Attaches it to req.id so downstream handlers can read it.
 *  3. Logs one line per incoming request and one per outgoing response.
 *  4. Adds the request ID to the response headers (X-Request-Id), so the
 *     client can correlate their request with server logs.
 *
 * We deliberately log request bodies at 'debug' only, and rely on the
 * logger's redact config to strip sensitive fields. Bodies are NOT logged
 * at 'info' level because document uploads would flood the logs.
 */
export const requestContext = pinoHttp({
  logger,
  genReqId: (req: Request): string => {
    const header = req.headers['x-request-id'];
    if (typeof header === 'string' && header.length > 0 && header.length <= 128) {
      return header;
    }
    return randomUUID();
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} → ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} → ${res.statusCode} (${err.message})`;
  },
  customProps: (req) => ({
    // Attach these to every log line for the request.
    userId: (req as any).user?.userId,
    organizationId: (req as any).user?.organizationId,
  }),
  // Serialize requests minimally — avoid dumping headers/body by default.
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
    err(err) {
      return {
        type: err.type,
        message: err.message,
        stack: err.stack,
      };
    },
  },
  // We control the header name and ID ourselves via genReqId.
  // Send X-Request-Id on the response so clients can quote it in bug reports.
  // (pino-http sets req.id; we mirror it into the response here.)
  wrapSerializers: false,
});

/**
 * After pino-http sets req.id, mirror it into the X-Request-Id response
 * header. Kept as a separate tiny middleware so the ordering is explicit.
 */
export function exposeRequestId(req: Request, res: any, next: any): void {
  const id = (req as any).id;
  if (id) res.setHeader('X-Request-Id', id);
  next();
}