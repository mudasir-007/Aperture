import { env } from '../config/env';
import { hybridSearch } from '../repositories/documentChunk.repository';
import { getEmbeddingProvider } from '../providers/embeddings';
import { getRerankerProvider } from '../providers/reranker';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentFilename: string;
  content: string;
  score: number;
}

export async function retrieveRelevantChunks(
  organizationId: string,
  query: string,
  topK: number = env.RETRIEVAL_TOP_K
): Promise<RetrievedChunk[]> {
  // Stage 1 — Hybrid search: dense + sparse fused by RRF.
  // We pull the full candidate pool (e.g. 100) to feed the reranker.
  const embeddingProvider = getEmbeddingProvider();
  const [queryEmbedding] = await embeddingProvider.embed([query]);

  const candidates = await hybridSearch(
    organizationId,
    queryEmbedding,
    query,
    env.HYBRID_CANDIDATE_POOL
  );

  if (candidates.length === 0) return [];

  // Stage 2 — Cross-encoder rerank.
  const reranker = getRerankerProvider();
  const reranked = await reranker.rerank({
    query,
    documents: candidates.map((c) => ({ id: c.id, text: c.content })),
  });

  // Take the reranked top-K, preserving the reranker's score.
  const byId = new Map(candidates.map((c) => [c.id, c] as const));
  const top = reranked.slice(0, topK);

  return top
    .map((r) => {
      const c = byId.get(r.id);
      if (!c) return null;
      return {
        chunkId: c.id,
        documentId: c.document_id,
        documentFilename: c.document_filename,
        content: c.content,
        score: r.score,
      };
    })
    .filter((x): x is RetrievedChunk => x !== null);
}