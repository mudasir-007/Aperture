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
 * Provider interface for the generation step (docs/architecture.md,
 * Section 24: keep the LLM behind an internal interface). Implementations
 * must not fabricate context -- the system prompt built in
 * generation.service.ts instructs the model to answer only from the
 * provided context and to say so explicitly when it can't.
 */
export interface LLMProvider {
  readonly name: string;
  generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerResult>;
}
