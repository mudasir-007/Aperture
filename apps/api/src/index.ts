import { createApp } from './app';
import { env } from './config/env';
import { initDb, closeDb } from './db/database';
import { startIngestionWorker } from './queue/ingestion.queue';
import { ensureBucket } from './storage/s3.client';
import { logger } from './logger';

async function main() {
  logger.info({ nodeEnv: env.NODE_ENV }, 'starting api');

  await initDb();
  logger.info('db schema ready');

  try {
    await ensureBucket();
    logger.info({ bucket: env.S3_BUCKET }, 's3 bucket ready');
  } catch (err) {
    logger.warn({ err }, 's3 bucket init failed — document upload will be unavailable until S3 is reachable');
  }


  const worker = startIngestionWorker();
  logger.info('ingestion worker started');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'api listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await worker.close();
    await closeDb();
    logger.info('shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start api');
  process.exit(1);
});