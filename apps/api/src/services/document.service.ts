import {
  createDocument,
  findDocumentById,
  findDocumentsByOrg,
  deleteDocument,
  updateDocumentStatus,
  findDocumentS3Key,
  DocumentRow,
} from '../repositories/document.repository';
import { countChunksForDocument } from '../repositories/documentChunk.repository';
import { deletePrefix, deleteObject } from '../storage/s3.client';
import { logger } from '../logger';
import { HttpError } from '../middleware/errorHandler';

export async function uploadDocument(input: {
  organizationId: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
}): Promise<DocumentRow> {
  return createDocument({
    organizationId: input.organizationId,
    ownerId: input.ownerId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    s3Key: input.s3Key,
  });
}

export async function listDocuments(organizationId: string): Promise<DocumentRow[]> {
  return findDocumentsByOrg(organizationId);
}

export async function getDocument(
  documentId: string,
  organizationId: string
): Promise<DocumentRow & { chunkCount: number }> {
  const doc = await findDocumentById(documentId);
  if (!doc) throw new HttpError(404, 'Document not found.');
  if (doc.organization_id !== organizationId) throw new HttpError(403, 'Access denied.');

  const chunkCount = await countChunksForDocument(doc.id);
  return { ...doc, chunkCount };
}

export async function removeDocument(
  documentId: string,
  organizationId: string
): Promise<void> {
  const doc = await findDocumentById(documentId);
  if (!doc) throw new HttpError(404, 'Document not found.');
  if (doc.organization_id !== organizationId) throw new HttpError(403, 'Access denied.');

  const s3Key = await findDocumentS3Key(documentId, organizationId);

  if (s3Key) {
    // Derive the per-document prefix. New format:
    //   orgs/{orgId}/documents/{docUuid}/original.{ext}
    //   prefix = orgs/{orgId}/documents/{docUuid}/
    const lastSlash = s3Key.lastIndexOf('/');
    const prefix = lastSlash >= 0 ? s3Key.substring(0, lastSlash + 1) : s3Key;

    // Safety guard: refuse to delete a shared prefix. A valid per-document
    // prefix has at least 4 path segments (orgs, {orgId}, documents, {docUuid}).
    const segments = prefix.split('/').filter(Boolean);

    if (segments.length >= 4) {
      const deleted = await deletePrefix(prefix);
      logger.info(
        { documentId, prefix, objectsDeleted: deleted },
        's3 document artifacts deleted'
      );
    } else {
      // Old-style key from before Batch 15. Delete just the one object.
      logger.warn(
        { documentId, s3Key, reason: 'prefix-too-shallow' },
        'old-style s3 key detected, deleting single object'
      );
      await deleteObject(s3Key);
    }
  }

  // Delete the DB row. FK cascades remove chunks and citations.
  await deleteDocument(documentId);

  logger.info({ documentId, organizationId }, 'document deleted');
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