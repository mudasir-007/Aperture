import { createApp } from './app';
import { env } from './config/env';
import { initDb, closeDb } from './db/database';
import { startIngestionWorker } from './queue/ingestion.queue';

async function main() {
  await initDb();

  const worker = startIngestionWorker();
  console.log('[ingestion] worker started');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });

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