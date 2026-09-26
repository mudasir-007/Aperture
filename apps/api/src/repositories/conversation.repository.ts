import { getDb, generateId } from '../db/database';

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export function createConversation(userId: string, title: string | null): ConversationRow {
  const id = generateId('conv');
  getDb()
    .prepare('INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)')
    .run(id, userId, title);
  return findConversationByIdForUser(id, userId)!;
}

export function listConversationsForUser(userId: string): ConversationRow[] {
  return getDb()
    .prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as ConversationRow[];
}

/** Ownership-scoped lookup -- always call this from request handlers, never a bare id lookup. */
export function findConversationByIdForUser(id: string, userId: string): ConversationRow | undefined {
  return getDb()
    .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .get(id, userId) as ConversationRow | undefined;
}

export function touchConversation(id: string): void {
  getDb()
    .prepare(`UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
    .run(id);
}
