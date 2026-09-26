// apps/api/src/app.ts
import express from 'express';
import { errorHandler } from './middleware/errorHandler'; // NOT error.middleware
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import chatRoutes from './routes/chat.routes';

const app = express();

app.use(express.json());

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/chat', chatRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler (MUST be last)
app.use(errorHandler);

export default app;