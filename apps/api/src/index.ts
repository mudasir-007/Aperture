import { createApp } from './app';
import { env } from './config/env';
import { initDb, closeDb } from './db/database';

async function main() {
  await initDb();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });

  const shutdown = async () => {
    server.close();
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