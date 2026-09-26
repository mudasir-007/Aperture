import { query, withTransaction } from '../db/database';

export interface DocumentChunkRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  embedding: number[];
  created_at: Date;
}

export interface DocumentChunkWithDocument extends DocumentChunkRow {
  document_filename: string;
}

export async function insertChunks(
  documentId: string,
  chunks: Array<{ content: string; chunkIndex: number; embedding: number[] }>
): Promise<void> {
  if (chunks.length === 0) return;
  await withTransaction(async (client) => {
    for (const row of chunks) {
      await client.query(
        `INSERT INTO document_chunks (document_id, content, chunk_index, embedding)
         VALUES ($1, $2, $3, $4)`,
        [documentId, row.content, row.chunkIndex, JSON.stringify(row.embedding)]
      );
    }
  });
}

export async function countChunksForDocument(documentId: string): Promise<number> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*)::int AS count FROM document_chunks WHERE document_id = $1',
    [documentId]
  );
  return result.rows[0]?.count ?? 0;
}

/**
 * Permission-scoped retrieval candidate set: only chunks belonging to
 * `ready` documents in the caller's organization are ever returned.
 */
export async function findChunksForOrg(
  organizationId: string
): Promise<DocumentChunkWithDocument[]> {
  const result = await query<any>(
    `SELECT c.*, d.filename AS document_filename
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.organization_id = $1 AND d.status = 'ready'`,
    [organizationId]
  );
  return result.rows;
}

/**
 * pgvector-native similarity search: filter by org, order by cosine distance,
 * return top-K. This replaces the JS brute-force loop in retrieval.service.ts.
 */
export async function findChunksForOrgByVector(
  organizationId: string,
  queryEmbedding: number[],
  topK: number
): Promise<Array<DocumentChunkRow & { document_filename: string; score: number }>> {
  const vectorLiteral = JSON.stringify(queryEmbedding);
  const result = await query<any>(
    `SELECT c.id, c.document_id, c.content, c.chunk_index, c.created_at,
            d.filename AS document_filename,
            1 - (c.embedding <=> $1::vector) AS score
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.organization_id = $2 AND d.status = 'ready'
       AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral, organizationId, topK]
  );
  return result.rows;
}

export async function findChunkById(id: string): Promise<DocumentChunkRow | undefined> {
  const result = await query<DocumentChunkRow>(
    'SELECT * FROM document_chunks WHERE id = $1',
    [id]
  );
  return result.rows[0];
}