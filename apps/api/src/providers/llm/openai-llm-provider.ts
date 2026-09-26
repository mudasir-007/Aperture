import {
  GenerateAnswerInput,
  GenerateAnswerResult,
  GenerateAnswerStream,
  LLMProvider,
} from './llm-provider';

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
}

interface OpenAIStreamChunk {
  choices: Array<{ delta: { content?: string }; finish_reason?: string | null }>;
}

const SYSTEM_PROMPT = `You are a helpful assistant answering questions using ONLY the provided context excerpts from the user's own documents.
Rules:
- If the context does not contain enough information to answer, say so explicitly. Do not guess or use outside knowledge.
- Cite sources inline using [1], [2], etc. matching the numbered context items.
- Be concise and direct.`;

export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 60000
  ) {}

  async generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerResult> {
    const messages = this.buildMessages(input);
    const answer = await this.chatCompletion(messages, 0.2);
    return {
      answer,
      usedChunkIds: input.context.map((c) => c.chunkId),
    };
  }

  async *generateAnswerStream(
    input: GenerateAnswerInput
  ): GenerateAnswerStream {
    const messages = this.buildMessages(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let fullAnswer = '';
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.2,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `OpenAI streaming failed (${response.status}): ${errorBody.slice(0, 200)}`
        );
      }

      if (!response.body) {
        throw new Error('OpenAI streaming returned no body');
      }

      // Response is SSE. We parse line-by-line: "data: {json}" chunks,
      // terminated by "data: [DONE]".
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double newlines (SSE event boundary).
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          for (const line of rawEvent.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            if (!payload) continue;

            try {
              const chunk = JSON.parse(payload) as OpenAIStreamChunk;
              const delta = chunk.choices[0]?.delta?.content;
              if (delta) {
                fullAnswer += delta;
                yield delta;
              }
            } catch {
              // Malformed SSE line — skip; the outer loop will keep reading.
            }
          }

          boundary = buffer.indexOf('\n\n');
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    return {
      answer: fullAnswer,
      usedChunkIds: input.context.map((c) => c.chunkId),
    };
  }

  async complete(prompt: string, systemPrompt: string): Promise<string> {
    return this.chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      0.3
    );
  }

  private buildMessages(
    input: GenerateAnswerInput
  ): Array<{ role: string; content: string }> {
    const contextBlock = input.context
      .map(
        (item, index) =>
          `[${index + 1}] (source: ${item.documentFilename})\n${item.content}`
      )
      .join('\n\n');

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      ...input.conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: `Context:\n${contextBlock || '(no relevant context was found)'}\n\nQuestion: ${input.question}`,
      },
    ];
  }

  private async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    temperature: number
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, messages, temperature }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI chat completion failed (${response.status}): ${errorBody}`);
      }

      const json = (await response.json()) as OpenAIChatResponse;
      return json.choices[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timeout);
    }
  }
}