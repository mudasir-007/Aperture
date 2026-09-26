/**
 * Provider interface so the rest of the app never depends on a specific
 * embedding vendor (docs/architecture.md, Section 24: "keep behind an
 * internal interface regardless of choice"). Swapping providers, or adding
 * a new one, means implementing this interface and registering it in
 * ./index.ts -- no other file changes.
 */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
