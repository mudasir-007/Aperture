import { logger } from '../../logger';import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env as hfEnv,
} from '@huggingface/transformers';
import { RerankerProvider, RerankInput, RerankResult } from './reranker-provider';
import { env } from '../../config/env';

// Prevent transformers.js from trying to load local files by default.
hfEnv.allowLocalModels = false;

// Cap the input length to the model's max. bge-reranker-base uses 512
// tokens; anything longer is truncated (this is standard for rerankers).
const MAX_LENGTH = 512;

type LoadedModel = {
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>>;
};

let cached: LoadedModel | null = null;
let loading: Promise<LoadedModel> | null = null;

/**
 * Loads the model once and caches it. Concurrent first calls share the
 * same underlying load promise so we never download twice.
 */
async function getModel(): Promise<LoadedModel> {
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    console.log(`[reranker] loading model ${env.RERANKER_MODEL} (first run downloads ~280MB)...`);
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(env.RERANKER_MODEL),
      AutoModelForSequenceClassification.from_pretrained(env.RERANKER_MODEL, {
        dtype: 'fp32',
      }),
    ]);
    console.log('[reranker] model loaded');
    cached = { tokenizer, model };
    return cached;
  })();

  return loading;
}

/**
 * Local cross-encoder reranker using transformers.js (ONNX Runtime, CPU).
 * Runs entirely in-process; no external API calls; zero per-query cost.
 */
export class LocalRerankerProvider implements RerankerProvider {
  readonly name = 'local';

  async rerank(input: RerankInput): Promise<RerankResult[]> {
    if (input.documents.length === 0) return [];

    const { tokenizer, model } = await getModel();

    // Build one (query, doc) pair per candidate.
    const queries = input.documents.map(() => input.query);
    const passages = input.documents.map((d) => d.text);

    const encoded = await tokenizer(queries, {
      text_pair: passages,
      padding: true,
      truncation: true,
      max_length: MAX_LENGTH,
    });

    const output = await model(encoded);
    // Sequence classification logits — shape [batch, 1] for bge-reranker.
    const logits = output.logits;
    const data = logits.data as Float32Array | number[];
    const batch = input.documents.length;

    const scored = input.documents.map((doc, i) => ({
      id: doc.id,
      score: Number(data[i * 1]) || 0,
    }));

    // Sanity: ensure we produced one score per document.
    if (scored.length !== batch) {
      throw new Error(
        `Reranker score count mismatch: expected ${batch}, got ${scored.length}`
      );
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }
}