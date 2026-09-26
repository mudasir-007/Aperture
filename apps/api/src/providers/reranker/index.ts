import { env } from '../../config/env';
import { RerankerProvider } from './reranker-provider';
import { MockRerankerProvider } from './mock-reranker-provider';
import { LocalRerankerProvider } from './local-reranker-provider';

let cached: RerankerProvider | null = null;

export function getRerankerProvider(): RerankerProvider {
  if (cached) return cached;

  switch (env.RERANKER_PROVIDER) {
    case 'local':
      cached = new LocalRerankerProvider();
      break;
    case 'cohere':
      throw new Error('Cohere reranker provider not implemented yet');
    case 'mock':
    default:
      cached = new MockRerankerProvider();
      break;
  }

  return cached;
}

export type { RerankerProvider, RerankInput, RerankResult, RerankDocument } from './reranker-provider';