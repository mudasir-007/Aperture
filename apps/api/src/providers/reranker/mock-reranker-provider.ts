import { RerankerProvider, RerankInput, RerankResult } from './reranker-provider';

/**
 * Passthrough reranker: preserves the order of the input documents
 * (which is already the RRF-fused hybrid search order) and assigns a
 * decreasing score. This lets the retrieval pipeline run end-to-end
 * without downloading any model, and gives a clean A/B comparison
 * against `local` once that provider is enabled.
 */
export class MockRerankerProvider implements RerankerProvider {
  readonly name = 'mock';

  async rerank(input: RerankInput): Promise<RerankResult[]> {
    return input.documents.map((doc, index) => ({
      id: doc.id,
      // Higher score = more relevant; decreasing so the first stays first.
      score: 1 - index / Math.max(input.documents.length, 1),
    }));
  }
}