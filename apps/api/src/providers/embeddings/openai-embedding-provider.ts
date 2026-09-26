import { EmbeddingProvider } from './embedding-provider';

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

/**
 * Real OpenAI embeddings integration. Not exercised in this sandbox (no
 * network access to api.openai.com and no API key), but implemented in
 * full -- request construction, response parsing, timeout, and error
 * handling -- per docs/architecture.md Section 14 (External Integrations).
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions = 1536; // text-embedding-3-small default

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 15000
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI embeddings request failed (${response.status}): ${errorBody}`);
      }

      const json = (await response.json()) as OpenAIEmbeddingResponse;
      return json.data.map((item) => item.embedding);
    } finally {
      clearTimeout(timeout);
    }
  }
}
