import { query } from '../db/database';

export interface CitationRow {
  id: string;
  message_id: string;
  document_chunk_id: string;
  snippet: string;
  score: number;
}

export async function createCitation(data: {
  messageId: string;
  documentChunkId: string;
  snippet: string;
  score: number;
}): Promise<CitationRow> {
  const result = await query<CitationRow>(
    `INSERT INTO citations (message_id, document_chunk_id, snippet, score)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.messageId, data.documentChunkId, data.snippet, data.score]
  );
  return result.rows[0];
}

export async function findCitationsByMessageId(messageId: string): Promise<CitationRow[]> {
  const result = await query<CitationRow>(
    'SELECT * FROM citations WHERE message_id = $1',
    [messageId]
  );
  return result.rows;
}