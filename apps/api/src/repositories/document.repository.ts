import { query } from '../db/database';

export interface DocumentRow {
  id: string;
  organization_id: string;
  owner_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  s3_key: string | null;
  status: string;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createDocument(data: {
  organizationId: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
}): Promise<DocumentRow> {
  const result = await query<DocumentRow>(
    `INSERT INTO documents
       (organization_id, owner_id, filename, mime_type, size_bytes, status, s3_key)
     VALUES ($1, $2, $3, $4, $5, 'processing', $6)
     RETURNING *`,
    [
      data.organizationId,
      data.ownerId,
      data.filename,
      data.mimeType,
      data.sizeBytes,
      data.s3Key,
    ]
  );
  return result.rows[0];
}

export async function updateDocumentStatus(
  id: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  await query(
    `UPDATE documents
     SET status = $1, error_message = $2, updated_at = now()
     WHERE id = $3`,
    [status, errorMessage ?? null, id]
  );
}

export async function findDocumentById(id: string): Promise<DocumentRow | undefined> {
  const result = await query<DocumentRow>(
    'SELECT * FROM documents WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

export async function findDocumentsByOrg(organizationId: string): Promise<DocumentRow[]> {
  const result = await query<DocumentRow>(
    'SELECT * FROM documents WHERE organization_id = $1 ORDER BY created_at DESC',
    [organizationId]
  );
  return result.rows;
}

export async function deleteDocument(id: string): Promise<void> {
  await query('DELETE FROM documents WHERE id = $1', [id]);
}

export async function findDocumentByIdForOrg(
  id: string,
  organizationId: string
): Promise<DocumentRow | undefined> {
  const result = await query<DocumentRow>(
    'SELECT * FROM documents WHERE id = $1 AND organization_id = $2',
    [id, organizationId]
  );
  return result.rows[0];
}

export async function listDocumentsForOrg(
  organizationId: string
): Promise<DocumentRow[]> {
  const result = await query<DocumentRow>(
    'SELECT * FROM documents WHERE organization_id = $1 ORDER BY created_at DESC',
    [organizationId]
  );
  return result.rows;
}