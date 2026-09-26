import { MockEmbeddingProvider } from '../../src/providers/embeddings/mock-embedding-provider';
import { cosineSimilarity } from '../../src/utils/similarity';

describe('MockEmbeddingProvider', () => {
  const provider = new MockEmbeddingProvider();

  it('produces deterministic output for the same input', async () => {
    const [a] = await provider.embed(['hello world']);
    const [b] = await provider.embed(['hello world']);
    expect(a).toEqual(b);
  });

  it('produces vectors of the declared dimensionality', async () => {
    const [vector] = await provider.embed(['some text']);
    expect(vector).toHaveLength(provider.dimensions);
  });

  it('gives higher similarity to texts sharing more vocabulary', async () => {
    const [query] = await provider.embed(['annual leave policy for employees']);
    const [relevant] = await provider.embed(['employees are entitled to annual leave each year']);
    const [irrelevant] = await provider.embed(['the quarterly server maintenance schedule']);

    const relevantScore = cosineSimilarity(query, relevant);
    const irrelevantScore = cosineSimilarity(query, irrelevant);

    expect(relevantScore).toBeGreaterThan(irrelevantScore);
  });
});
