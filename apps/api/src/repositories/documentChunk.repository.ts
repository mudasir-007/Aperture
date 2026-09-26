import { getDb, generateId } from '../db/database';

export interface DocumentChunkRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  embedding: string;
  created_at: string;
}

export interface DocumentChunkWithDocument extends DocumentChunkRow {
  document_filename: string;
}

export function insertChunks(
  documentId: string,
  chunks: Array<{ content: string; chunkIndex: number; embedding: number[] }>
): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO document_chunks (id, document_id, content, chunk_index, embedding)
     VALUES (@id, @documentId, @content, @chunkIndex, @embedding)`
  );

  const insertMany = db.transaction((rows: typeof chunks) => {
    for (const row of rows) {
      insert.run({
        id: generateId('chk'),
        documentId,
        content: row.content,
        chunkIndex: row.chunkIndex,
        embedding: JSON.stringify(row.embedding)
      });
    }
  });

  insertMany(chunks);
}

export function countChunksForDocument(documentId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS count FROM document_chunks WHERE document_id = ?')
    .get(documentId) as { count: number };
  return row.count;
}

/**
 * Permission-scoped retrieval candidate set: only chunks belonging to
 * `ready` documents in the caller's organization are ever returned (see
 * docs/architecture.md Section 4.7 / retrieval.service.ts).
 */
export function findChunksForOrg(organizationId: string): DocumentChunkWithDocument[] {
  return getDb()
    .prepare(
      `SELECT c.*, d.filename AS document_filename
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE d.organization_id = ? AND d.status = 'ready'`
    )
    .all(organizationId) as DocumentChunkWithDocument[];
}

export function findChunkById(id: string): DocumentChunkRow | undefined {
  return getDb().prepare('SELECT * FROM document_chunks WHERE id = ?').get(id) as DocumentChunkRow | undefined;
}
