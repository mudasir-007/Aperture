export interface RerankDocument {
  id: string;
  text: string;
}

export interface RerankInput {
  query: string;
  documents: RerankDocument[];
}

export interface RerankResult {
  id: string;
  score: number;
}

/**
 * Provider interface for the reranking step (docs/architecture.md,
 * Section 24). Implementations receive the query and candidate chunks
 * and must return them ordered by descending relevance.
 *
 * Implementations must:
 *  - Return exactly the documents they received (no fabrication)
 *  - Sort results by descending score
 *  - Be safe to call concurrently
 */
export interface RerankerProvider {
  readonly name: string;
  rerank(input: RerankInput): Promise<RerankResult[]>;
}