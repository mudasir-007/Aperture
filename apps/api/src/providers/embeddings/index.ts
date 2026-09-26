import { env } from '../../config/env';
import { EmbeddingProvider } from './embedding-provider';
import { MockEmbeddingProvider } from './mock-embedding-provider';
import { OpenAIEmbeddingProvider } from './openai-embedding-provider';

let cachedProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  if (env.EMBEDDING_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY must be set when EMBEDDING_PROVIDER=openai');
    }
    cachedProvider = new OpenAIEmbeddingProvider(env.OPENAI_API_KEY, env.OPENAI_EMBEDDING_MODEL);
  } else {
    cachedProvider = new MockEmbeddingProvider();
  }

  return cachedProvider;
}

export type { EmbeddingProvider } from './embedding-provider';
