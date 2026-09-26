import { env } from '../../config/env';
import { LLMProvider } from './llm-provider';
import { MockLLMProvider } from './mock-llm-provider';
import { OpenAILLMProvider } from './openai-llm-provider';

let cachedProvider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  if (env.LLM_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY must be set when LLM_PROVIDER=openai');
    }
    cachedProvider = new OpenAILLMProvider(env.OPENAI_API_KEY, env.OPENAI_CHAT_MODEL);
  } else {
    cachedProvider = new MockLLMProvider();
  }

  return cachedProvider;
}

export type { LLMProvider, GenerateAnswerInput, GenerateAnswerResult, RetrievedContextItem } from './llm-provider';
