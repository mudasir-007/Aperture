import { env } from '../config/env';
import { findChunksForOrg } from '../repositories/documentChunk.repository';
import { getEmbeddingProvider } from '../providers/embeddings';
import { cosineSimilarity } from '../utils/similarity';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentFilename: string;
  content: string;
  score: number;
}

/**
 * Retrieval funnel (docs/architecture.md Section 4.7 / Section 7), MVP scope:
 *
 *   1. Permission filter -- findChunksForOrg scopes to `organizationId`
 *      (and `status = 'ready'`) at the SQL level, BEFORE any similarity
 *      computation runs, so retrieval is structurally incapable of
 *      returning another organization's chunks. This is the most
 *      important property carried over from the architecture review.
 *   2. Similarity search -- brute-force cosine similarity over the
 *      permitted set (see utils/similarity.ts for the scaling note).
 *   3. Top-K selection.
 *
 * Deliberately deferred to later phases (see docs/architecture.md Section 21):
 *   - A real sparse/BM25 keyword signal fused with the dense score
 *     (Reciprocal Rank Fusion) -- full hybrid search.
 *   - A separate cross-encoder re-ranking stage.
 * The function signature/return shape is written so both can be inserted
 * between steps 2 and 3 without changing any caller.
 */
export async function retrieveRelevantChunks(
  organizationId: string,
  query: string,
  topK: number = env.RETRIEVAL_TOP_K
): Promise<RetrievedChunk[]> {
  const chunks = findChunksForOrg(organizationId); // permission filter -- applied before retrieval, not after

  if (chunks.length === 0) {
    return [];
  }

  const embeddingProvider = getEmbeddingProvider();
  const [queryEmbedding] = await embeddingProvider.embed([query]);

  const scored: RetrievedChunk[] = chunks.map((chunk) => {
    const chunkEmbedding = JSON.parse(chunk.embedding) as number[];
    return {
      chunkId: chunk.id,
      documentId: chunk.document_id,
      documentFilename: chunk.document_filename,
      content: chunk.content,
      score: cosineSimilarity(queryEmbedding, chunkEmbedding)
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).filter((item) => item.score > 0);
}
