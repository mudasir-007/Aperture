import { findDocumentById, updateDocumentStatus } from '../repositories/document.repository';
import { insertChunks } from '../repositories/documentChunk.repository';
import { getEmbeddingProvider } from '../providers/embeddings';
import { chunkText } from './chunker';
import { parseDocumentToText, UnsupportedFileTypeError } from './parser.service';

/**
 * Runs the full ingestion pipeline for a single document:
 *   parse -> structure-lite chunk -> embed (batched) -> persist chunks -> mark ready
 *
 * Matches the stage order in docs/architecture.md Section 13, but runs
 * synchronously and in-process rather than via a queue+worker pool. That
 * async/queue layer (with retries and a dead-letter queue) is documented as
 * a Production-V1 concern in the roadmap (Phase 5) -- deliberately deferred
 * here so the MVP has no external queue/broker dependency. The document's
 * `status` field is the seam: a future queue-backed worker calls exactly
 * this function as its job handler.
 */
export async function ingestDocument(documentId: string, fileBuffer: Buffer): Promise<void> {
  const document = findDocumentById(documentId);
  if (!document) {
    throw new Error(`Cannot ingest unknown document ${documentId}`);
  }

  try {
    const text = parseDocumentToText(fileBuffer, document.mime_type);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      updateDocumentStatus(documentId, 'failed', 'Document contained no extractable text.');
      return;
    }

    const embeddingProvider = getEmbeddingProvider();
    const embeddings = await embeddingProvider.embed(chunks);

    insertChunks(
      documentId,
      chunks.map((content, index) => ({ content, chunkIndex: index, embedding: embeddings[index] }))
    );

    updateDocumentStatus(documentId, 'ready', null);
  } catch (error) {
    const message = error instanceof UnsupportedFileTypeError ? error.message : 'Ingestion failed unexpectedly.';
    updateDocumentStatus(documentId, 'failed', message);
    if (!(error instanceof UnsupportedFileTypeError)) {
      // eslint-disable-next-line no-console
      console.error(`Ingestion failed for document ${documentId}:`, error);
    }
  }
}
