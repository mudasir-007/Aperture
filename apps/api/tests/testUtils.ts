import { createApp } from '../src/app';
import { getDb } from '../src/db/database';

export const app = createApp();

/**
 * Deletes all rows between tests so each test starts from a clean slate.
 * Deletion order follows FK dependency order (children first) even though
 * ON DELETE CASCADE is enabled, to keep this explicit and independent of
 * pragma state.
 */
export function resetDatabase(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM citations;
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM document_chunks;
    DELETE FROM documents;
    DELETE FROM users;
    DELETE FROM organizations;
  `);
}
