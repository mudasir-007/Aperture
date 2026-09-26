import { getEmbeddingProvider } from '../providers/embeddings';
import { insertChunks } from '../repositories/documentChunk.repository';
import {
  markDocumentFailed,
  markDocumentReady,
} from './document.service';

const CHUNK_SIZE = 800;    // characters
const CHUNK_OVERLAP = 120; // characters

export interface ParsedChunk {
  content: string;
  chunkIndex: number;
}

/**
 * Naive character-based chunking with overlap.
 * Replace with structure-aware / token-aware chunking in a later phase.
 */
export function chunkText(text: string): ParsedChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: ParsedChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    const slice = normalized.slice(start, end).trim();
    if (slice.length > 0) {
      chunks.push({ content: slice, chunkIndex: index++ });
    }
    if (end === normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

export async function ingestDocument(
  documentId: string,
  rawText: string
): Promise<{ chunkCount: number }> {
  try {
    const chunks = chunkText(rawText);
    if (chunks.length === 0) {
      throw new Error('No extractable content in document');
    }

    const embedder = getEmbeddingProvider();
    // Batch embeddings to avoid huge single requests.
    const BATCH = 64;
    const enriched: Array<{ content: string; chunkIndex: number; embedding: number[] }> = [];

    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const embeddings = await embedder.embed(batch.map((c) => c.content));
      for (let j = 0; j < batch.length; j++) {
        enriched.push({
          content: batch[j].content,
          chunkIndex: batch[j].chunkIndex,
          embedding: embeddings[j],
        });
      }
    }

    await insertChunks(documentId, enriched);
    await markDocumentReady(documentId);
    return { chunkCount: enriched.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown ingestion error';
    await markDocumentFailed(documentId, message);
    throw err;
  }
}