import { getDb, generateId } from '../db/database';

export interface DocumentRow {
  id: string;
  organization_id: string;
  owner_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentInput {
  organizationId: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export function createDocument(input: CreateDocumentInput): DocumentRow {
  const id = generateId('doc');
  getDb()
    .prepare(
      `INSERT INTO documents (id, organization_id, owner_id, filename, mime_type, size_bytes, status)
       VALUES (@id, @organizationId, @ownerId, @filename, @mimeType, @sizeBytes, 'processing')`
    )
    .run({ id, ...input });
  return findDocumentById(id)!;
}

export function findDocumentById(id: string): DocumentRow | undefined {
  return getDb().prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow | undefined;
}

/** Permission-scoped lookup -- always call this (not findDocumentById) from request handlers. */
export function findDocumentByIdForOrg(id: string, organizationId: string): DocumentRow | undefined {
  return getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND organization_id = ?')
    .get(id, organizationId) as DocumentRow | undefined;
}

export function listDocumentsForOrg(organizationId: string): Array<DocumentRow & { chunk_count: number }> {
  return getDb()
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM document_chunks c WHERE c.document_id = d.id) AS chunk_count
       FROM documents d
       WHERE d.organization_id = ?
       ORDER BY d.created_at DESC`
    )
    .all(organizationId) as Array<DocumentRow & { chunk_count: number }>;
}

export function updateDocumentStatus(id: string, status: string, errorMessage: string | null): void {
  getDb()
    .prepare(
      `UPDATE documents
       SET status = ?, error_message = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
    .run(status, errorMessage, id);
}

export function deleteDocument(id: string): void {
  // ON DELETE CASCADE (foreign_keys pragma enabled in database.ts) removes
  // dependent document_chunks and their citations.
  getDb().prepare('DELETE FROM documents WHERE id = ?').run(id);
}
