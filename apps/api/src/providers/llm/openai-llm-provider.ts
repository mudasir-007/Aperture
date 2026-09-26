import { GenerateAnswerInput, GenerateAnswerResult, LLMProvider } from './llm-provider';

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
}

const SYSTEM_PROMPT = `You are a helpful assistant answering questions using ONLY the provided context excerpts from the user's own documents.
Rules:
- If the context does not contain enough information to answer, say so explicitly. Do not guess or use outside knowledge.
- Cite sources inline using [1], [2], etc. matching the numbered context items.
- Be concise and direct.`;

/**
 * Real OpenAI chat-completions integration. Not exercised in this sandbox
 * (no network access to api.openai.com and no API key), but implemented in
 * full -- prompt construction, timeout, and error handling -- per
 * docs/architecture.md Section 14 (External Integrations).
 */
export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 30000
  ) {}

  async generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerResult> {
    const contextBlock = input.context
      .map((item, index) => `[${index + 1}] (source: ${item.documentFilename})\n${item.content}`)
      .join('\n\n');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...input.conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: `Context:\n${contextBlock || '(no relevant context was found)'}\n\nQuestion: ${input.question}`
      }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ model: this.model, messages, temperature: 0.2 }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI chat completion failed (${response.status}): ${errorBody}`);
      }

      const json = (await response.json()) as OpenAIChatResponse;
      const answer = json.choices[0]?.message?.content ?? '';

      return {
        answer,
        usedChunkIds: input.context.map((c) => c.chunkId)
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
