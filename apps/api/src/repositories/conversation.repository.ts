import { query } from '../db/database';

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createConversation(
  userId: string,
  title?: string
): Promise<ConversationRow> {
  const result = await query<ConversationRow>(
    `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *`,
    [userId, title ?? null]
  );
  return result.rows[0];
}

export async function findConversationById(id: string): Promise<ConversationRow | undefined> {
  const result = await query<ConversationRow>(
    'SELECT * FROM conversations WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

export async function findConversationsByUser(userId: string): Promise<ConversationRow[]> {
  const result = await query<ConversationRow>(
    'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId]
  );
  return result.rows;
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  await query(
    'UPDATE conversations SET title = $1, updated_at = now() WHERE id = $2',
    [title, id]
  );
}

export async function deleteConversation(id: string): Promise<void> {
  await query('DELETE FROM conversations WHERE id = $1', [id]);
}

export async function findConversationByIdForUser(
  id: string,
  userId: string
): Promise<ConversationRow | undefined> {
  const result = await query<ConversationRow>(
    'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows[0];
}

export async function listConversationsForUser(
  userId: string
): Promise<ConversationRow[]> {
  return findConversationsByUser(userId);
}

export async function touchConversation(id: string): Promise<void> {
  await query('UPDATE conversations SET updated_at = now() WHERE id = $1', [id]);
}