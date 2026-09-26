import {
  GenerateAnswerInput,
  GenerateAnswerResult,
  GenerateAnswerStream,
  LLMProvider,
} from './llm-provider';

/**
 * Deterministic, dependency-free provider. Real extractive synthesis over
 * retrieved context, no external calls. Streaming yields the buffered
 * answer one word at a time so the SSE path can be exercised end-to-end
 * without an API key.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';

  async generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerResult> {
    const { question, context } = input;

    if (context.length === 0) {
      return {
        answer:
          "I don't have any relevant information in the connected documents to answer that question. " +
          'Try uploading a document that covers this topic, or rephrase your question.',
        usedChunkIds: [],
      };
    }

    const summarizedPieces = context.map((item, index) => {
      const firstSentence = this.firstSentence(item.content);
      return `[${index + 1}] ${firstSentence} (source: ${item.documentFilename})`;
    });

    const answer =
      `Based on the connected documents, here is what I found relevant to "${question.trim()}":\n\n` +
      summarizedPieces.join('\n') +
      '\n\n(This is a deterministic mock answer assembled from retrieved excerpts. ' +
      'Configure LLM_PROVIDER=openai for a fully generated, synthesized answer.)';

    return {
      answer,
      usedChunkIds: context.map((item) => item.chunkId),
    };
  }

  async *generateAnswerStream(
    input: GenerateAnswerInput
  ): GenerateAnswerStream {
    const result = await this.generateAnswer(input);

    // Yield the answer word-by-word. Include trailing whitespace on each
    // word so concatenation reconstructs the exact original string.
    const tokens = result.answer.match(/\S+\s*/g) ?? [];
    for (const token of tokens) {
      // Small delay so streaming is observable in local dev.
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield token;
    }

    return result;
  }

  async complete(prompt: string, _systemPrompt: string): Promise<string> {
    const cleaned = prompt.replace(/\s+/g, ' ').trim();
    const truncated = cleaned.length > 400 ? `${cleaned.slice(0, 397)}...` : cleaned;
    return `[Mock summary] ${truncated}`;
  }

  private firstSentence(text: string): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    const match = trimmed.match(/^[^.!?]*[.!?]/);
    const sentence = match ? match[0] : trimmed;
    return sentence.length > 240 ? `${sentence.slice(0, 237)}...` : sentence;
  }
}