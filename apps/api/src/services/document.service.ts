import {
  createDocument,
  findDocumentById,
  findDocumentsByOrg,
  deleteDocument,
  updateDocumentStatus,
  DocumentRow,
} from '../repositories/document.repository';
import { countChunksForDocument } from '../repositories/documentChunk.repository';

export async function uploadDocument(input: {
  organizationId: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}): Promise<DocumentRow> {
  const doc = await createDocument({
    organizationId: input.organizationId,
    ownerId: input.ownerId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
  return doc;
}

export async function listDocuments(organizationId: string): Promise<DocumentRow[]> {
  return findDocumentsByOrg(organizationId);
}

export async function getDocument(
  documentId: string,
  organizationId: string
): Promise<DocumentRow & { chunkCount: number }> {
  const doc = await findDocumentById(documentId);
  if (!doc) throw new Error('DOCUMENT_NOT_FOUND');
  if (doc.organization_id !== organizationId) throw new Error('FORBIDDEN');

  const chunkCount = await countChunksForDocument(doc.id);
  return { ...doc, chunkCount };
}

export async function removeDocument(
  documentId: string,
  organizationId: string
): Promise<void> {
  const doc = await findDocumentById(documentId);
  if (!doc) throw new Error('DOCUMENT_NOT_FOUND');
  if (doc.organization_id !== organizationId) throw new Error('FORBIDDEN');
  await deleteDocument(documentId);
}

export async function markDocumentReady(documentId: string): Promise<void> {
  await updateDocumentStatus(documentId, 'ready');
}

export async function markDocumentFailed(
  documentId: string,
  errorMessage: string
): Promise<void> {
  await updateDocumentStatus(documentId, 'failed', errorMessage);
}