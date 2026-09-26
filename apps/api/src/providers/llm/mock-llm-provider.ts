import { GenerateAnswerInput, GenerateAnswerResult, LLMProvider } from './llm-provider';

/**
 * Deterministic, dependency-free "generation" provider: it does real
 * extractive synthesis over the retrieved context (not a canned string),
 * so ingestion + retrieval + chat is a genuinely working end-to-end path
 * with zero external API keys or network access. It is honest about its
 * own limits: if no context was retrieved, it says so rather than
 * hallucinating, matching the hallucination-mitigation approach documented
 * in docs/architecture.md Section 7.
 *
 * Set LLM_PROVIDER=openai in .env for real generative answers in a
 * deployed environment.
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
        usedChunkIds: []
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
      usedChunkIds: context.map((item) => item.chunkId)
    };
  }

  private firstSentence(text: string): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    const match = trimmed.match(/^[^.!?]*[.!?]/);
    const sentence = match ? match[0] : trimmed;
    return sentence.length > 240 ? `${sentence.slice(0, 237)}...` : sentence;
  }
}
