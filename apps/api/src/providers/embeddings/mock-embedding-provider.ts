import { EmbeddingProvider } from './embedding-provider';

const DIMENSIONS = 1536;  // Must match schema.sql: embedding vector(1536)

/**
 * Deterministic, dependency-free embedding via feature hashing (a real,
 * if crude, technique -- not a random stub). Each word in the input is
 * hashed into one of DIMENSIONS buckets and the resulting vector is
 * L2-normalized. Text sharing more vocabulary ends up with higher cosine
 * similarity, which is enough to demonstrate and test real retrieval
 * behavior without any network access or API key.
 *
 * Swap EMBEDDING_PROVIDER=openai in .env for real semantic embeddings in
 * a deployed environment.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly dimensions = DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vector = new Array(DIMENSIONS).fill(0);
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    for (const word of words) {
      const bucket = this.hashToBucket(word);
      vector[bucket] += 1;
    }

    return this.normalize(vector);
  }

  private hashToBucket(word: string): number {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
    }
    return hash % DIMENSIONS;
  }

  private normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) {
      return vector;
    }
    return vector.map((v) => v / norm);
  }
}
