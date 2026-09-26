import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/documents.routes';
import chatRoutes from './routes/chat.routes';
import healthRoutes from './routes/health.routes';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use('/health', healthRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/documents', documentRoutes);
  app.use('/api/v1/chat', chatRoutes);

  app.use(errorHandler);
  return app;
}