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

export async function listMessagesForConversation(
  conversationId: string
): Promise<MessageRow[]> {
  return findMessagesByConversationId(conversationId);
}

export async function listCitationsForMessages(
  messageIds: string[]
): Promise<Map<string, any[]>> {
  if (messageIds.length === 0) return new Map();
  const result = await query<any>(
    'SELECT * FROM citations WHERE message_id = ANY($1::uuid[])',
    [messageIds]
  );
  const map = new Map<string, any[]>();
  for (const row of result.rows) {
    if (!map.has(row.message_id)) map.set(row.message_id, []);
    map.get(row.message_id)!.push(row);
  }
  return map;
}

export async function createMessageCompat(
  conversationId: string,
  role: string,
  content: string
): Promise<MessageRow> {
  return createMessage({ conversationId, role, content });
}

export async function createCitations(
  messageId: string,
  citations: Array<{ documentChunkId: string; snippet: string; score: number }>
): Promise<void> {
  if (citations.length === 0) return;
  for (const c of citations) {
    await query(
      `INSERT INTO citations (message_id, document_chunk_id, snippet, score)
       VALUES ($1, $2, $3, $4)`,
      [messageId, c.documentChunkId, c.snippet, c.score]
    );
  }
}