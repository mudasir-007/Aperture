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
  return Number(result.rows[0]?.count ?? 0);
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

/**
 * Hybrid retrieval: dense (pgvector) + sparse (PostgreSQL full-text),
 * fused with Reciprocal Rank Fusion (RRF).
 *
 * RRF formula: score(d) = 1/(k + rank_dense(d)) + 1/(k + rank_sparse(d))
 * with k = 60 (standard value from Cormack et al., 2009).
 *
 * Both ranked lists are capped at `candidatePool` before fusion so the
 * cost stays predictable regardless of index size. The function returns
 * up to `candidatePool` fused results; the caller is expected to slice
 * to its own top-K after reranking.
 */
export async function hybridSearch(
  organizationId: string,
  queryEmbedding: number[],
  queryText: string,
  candidatePool: number
): Promise<Array<DocumentChunkRow & { document_filename: string; score: number }>> {
  const vectorLiteral = JSON.stringify(queryEmbedding);
  const rrfK = 60;

  const result = await query<any>(
    `
    WITH dense AS (
      SELECT c.id,
             ROW_NUMBER() OVER (ORDER BY c.embedding <=> $1::vector) AS rank
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE d.organization_id = $2
        AND d.status = 'ready'
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
    ),
    sparse AS (
      SELECT c.id,
             ROW_NUMBER() OVER (
               ORDER BY ts_rank_cd(
                 to_tsvector('english', c.content),
                 plainto_tsquery('english', $4)
               ) DESC
             ) AS rank
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE d.organization_id = $2
        AND d.status = 'ready'
        AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $4)
      ORDER BY ts_rank_cd(
        to_tsvector('english', c.content),
        plainto_tsquery('english', $4)
      ) DESC
      LIMIT $3
    ),
    fused AS (
      SELECT
        COALESCE(d.id, s.id) AS id,
        COALESCE(1.0 / ($5 + d.rank), 0.0)
          + COALESCE(1.0 / ($5 + s.rank), 0.0) AS rrf_score
      FROM dense d
      FULL OUTER JOIN sparse s ON d.id = s.id
    )
    SELECT c.id,
           c.document_id,
           c.content,
           c.chunk_index,
           c.created_at,
           doc.filename AS document_filename,
           f.rrf_score AS score
    FROM fused f
    JOIN document_chunks c ON c.id = f.id
    JOIN documents doc ON doc.id = c.document_id
    ORDER BY f.rrf_score DESC
    LIMIT $6
    `,
    [vectorLiteral, organizationId, candidatePool, queryText, rrfK, candidatePool]
  );

  return result.rows;
}