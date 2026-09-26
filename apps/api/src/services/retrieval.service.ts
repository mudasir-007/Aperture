import { env } from '../config/env';
import { hybridSearch } from '../repositories/documentChunk.repository';
import { getEmbeddingProvider } from '../providers/embeddings';

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
  const embeddingProvider = getEmbeddingProvider();
  const [queryEmbedding] = await embeddingProvider.embed([query]);

  const rows = await hybridSearch(
    organizationId,
    queryEmbedding,
    query,
    topK,
    env.HYBRID_CANDIDATE_POOL
  );

  return rows.map((row) => ({
    chunkId: row.id,
    documentId: row.document_id,
    documentFilename: row.document_filename,
    content: row.content,
    score: row.score,
  }));
}