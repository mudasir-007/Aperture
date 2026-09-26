import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { requestContext, exposeRequestId } from './middleware/requestContext';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/documents.routes';
import chatRoutes from './routes/chat.routes';
import conversationRoutes from './routes/conversations.routes';
import healthRoutes from './routes/health.routes';

export function createApp() {
  const app = express();

  // Security headers first.
  app.use(helmet());

  // CORS — adjust origin list for production.
  app.use(cors({ origin: true, exposedHeaders: ['X-Request-Id'] }));

  // Request ID + structured logging. Must come before body parsing so
  // even malformed-body requests get a request ID.
  app.use(requestContext);
  app.use(exposeRequestId);

  // Body parsing.
  app.use(express.json({ limit: '1mb' }));

  // Routes.
  app.use('/health', healthRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/documents', documentRoutes);
  app.use('/api/v1/chat', chatRoutes);
  app.use('/api/v1/conversations', conversationRoutes);

  // Global error handler — must be last.
  app.use(errorHandler);

  return app;
}