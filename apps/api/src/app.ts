import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import documentsRoutes from './routes/documents.routes';
import conversationsRoutes from './routes/conversations.routes';
import healthRoutes from './routes/health.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // Global rate limit -- a coarse, request-count-based guard (docs/architecture.md
  // Section 12). Per-tenant/per-endpoint limits are a documented Production-V1
  // refinement (Section 21).
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: env.NODE_ENV === 'test' ? 10000 : 120,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/conversations', conversationsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
