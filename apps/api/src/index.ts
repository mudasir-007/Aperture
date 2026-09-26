import { createApp } from './app';
import { env } from './config/env';
import { initDb, closeDb } from './db/database';
import { startIngestionWorker } from './queue/ingestion.queue';
import { ensureBucket } from './storage/s3.client';

async function main() {
  // 1. Database schema (idempotent — safe on every boot).
  await initDb();
  console.log('[db] schema ready');

  // 2. Object storage bucket (creates if missing).
  await ensureBucket();
  console.log('[s3] bucket ready');

  // 3. Background worker for document ingestion.
  const worker = startIngestionWorker();
  console.log('[ingestion] worker started');

  // 4. HTTP server.
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });

  // 5. Graceful shutdown.
  const shutdown = async () => {
    console.log('Shutting down...');
    server.close();
    await worker.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});