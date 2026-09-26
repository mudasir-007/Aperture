import { getDb, generateId } from '../db/database';

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface CitationRow {
  id: string;
  message_id: string;
  document_chunk_id: string;
  snippet: string;
  score: number;
}

export interface CitationWithDocument extends CitationRow {
  document_id: string;
  document_filename: string;
}

export function createMessage(conversationId: string, role: 'user' | 'assistant', content: string): MessageRow {
  const id = generateId('msg');
  getDb()
    .prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
    .run(id, conversationId, role, content);
  return getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow;
}

export function listMessagesForConversation(conversationId: string, limit?: number): MessageRow[] {
  const query = limit
    ? `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`
    : `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`;
  const params = limit ? [conversationId, limit] : [conversationId];
  return getDb().prepare(query).all(...params) as MessageRow[];
}

export function createCitations(
  messageId: string,
  citations: Array<{ documentChunkId: string; snippet: string; score: number }>
): void {
  if (citations.length === 0) return;
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO citations (id, message_id, document_chunk_id, snippet, score)
     VALUES (@id, @messageId, @documentChunkId, @snippet, @score)`
  );
  const insertMany = db.transaction((rows: typeof citations) => {
    for (const row of rows) {
      insert.run({ id: generateId('cit'), messageId, ...row });
    }
  });
  insertMany(citations);
}

export function listCitationsForMessage(messageId: string): CitationWithDocument[] {
  return getDb()
    .prepare(
      `SELECT ci.*, d.id AS document_id, d.filename AS document_filename
       FROM citations ci
       JOIN document_chunks c ON c.id = ci.document_chunk_id
       JOIN documents d ON d.id = c.document_id
       WHERE ci.message_id = ?`
    )
    .all(messageId) as CitationWithDocument[];
}

export function listCitationsForMessages(messageIds: string[]): Map<string, CitationWithDocument[]> {
  const result = new Map<string, CitationWithDocument[]>();
  if (messageIds.length === 0) return result;

  const placeholders = messageIds.map(() => '?').join(', ');
  const rows = getDb()
    .prepare(
      `SELECT ci.*, d.id AS document_id, d.filename AS document_filename
       FROM citations ci
       JOIN document_chunks c ON c.id = ci.document_chunk_id
       JOIN documents d ON d.id = c.document_id
       WHERE ci.message_id IN (${placeholders})`
    )
    .all(...messageIds) as CitationWithDocument[];

  for (const row of rows) {
    const existing = result.get(row.message_id) ?? [];
    existing.push(row);
    result.set(row.message_id, existing);
  }
  return result;
}
