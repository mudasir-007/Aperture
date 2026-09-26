import { query } from '../db/database';

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: Date;
}

export async function createMessage(data: {
  conversationId: string;
  role: string;
  content: string;
}): Promise<MessageRow> {
  const result = await query<MessageRow>(
    `INSERT INTO messages (conversation_id, role, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [data.conversationId, data.role, data.content]
  );
  return result.rows[0];
}

export async function findMessagesByConversationId(
  conversationId: string
): Promise<MessageRow[]> {
  const result = await query<MessageRow>(
    'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
  return result.rows;
}