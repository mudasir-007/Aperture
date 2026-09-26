export interface RetrievedContextItem {
  chunkId: string;
  content: string;
  documentFilename: string;
}

export interface GenerateAnswerInput {
  question: string;
  context: RetrievedContextItem[];
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface GenerateAnswerResult {
  answer: string;
  usedChunkIds: string[];
}

/**
 * Streamed variant of GenerateAnswerResult. The generator yields text
 * deltas as they arrive. When the stream ends, the generator's return
 * value carries the final metadata (full answer, used chunk ids).
 *
 * If the underlying LLM has no native streaming (mock), the impl
 * synthesizes deltas from the buffered response.
 */
export type GenerateAnswerStream = AsyncGenerator<string, GenerateAnswerResult, void>;

export interface LLMProvider {
  readonly name: string;
  generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerResult>;
  generateAnswerStream(input: GenerateAnswerInput): GenerateAnswerStream;
  /**
   * Generic text completion. Used for auxiliary tasks like conversation
   * summarization and query rewriting.
   */
  complete(prompt: string, systemPrompt: string): Promise<string>;
}