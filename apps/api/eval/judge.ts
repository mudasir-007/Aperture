import { getLLMProvider } from '../src/providers/llm';
import { RetrievedChunk } from '../src/services/retrieval.service';

const JUDGE_SYSTEM_PROMPT = `You are a strict evaluator of RAG answers.

Given a question, retrieved context, and a generated answer, score how well the answer is FAITHFUL to the context:
- 1.0 = every claim in the answer is directly supported by the context
- 0.7 = most claims are supported; minor extrapolation
- 0.4 = some claims are supported but others are fabricated or from outside knowledge
- 0.0 = answer is unrelated or entirely fabricated

Do NOT score whether the answer is correct in an absolute sense — only whether it is grounded in the provided context.

Respond with a single JSON object and nothing else:
{"score": <number between 0 and 1>, "reason": "<one sentence>"}`;

export interface JudgeInput {
  question: string;
  answer: string;
  context: RetrievedChunk[];
}

export async function judgeFaithfulness(input: JudgeInput): Promise<number> {
  const { question, answer, context } = input;

  if (!answer || answer.trim().length === 0) return 0;

  const contextBlock =
    context.length > 0
      ? context
          .map((c, i) => `[${i + 1}] ${c.documentFilename}\n${c.content}`)
          .join('\n\n')
      : '(no context retrieved)';

  const prompt = `Question:\n${question}\n\nContext:\n${contextBlock}\n\nAnswer:\n${answer}`;

  try {
    const llm = getLLMProvider();
    const raw = await llm.complete(prompt, JUDGE_SYSTEM_PROMPT);
    const parsed = parseJudgeResponse(raw);
    return parsed;
  } catch (err) {
    console.warn('[judge] scoring failed:', err);
    return 0;
  }
}

/**
 * Extracts a numeric score from the judge's response. Handles both clean
 * JSON and the common case where an LLM wraps it in prose.
 */
function parseJudgeResponse(raw: string): number {
  // Try strict JSON first.
  try {
    const json = JSON.parse(raw);
    if (typeof json?.score === 'number') return clamp01(json.score);
  } catch {
    // fall through
  }

  // Fall back to extracting the first number we see.
  const match = raw.match(/score["':\s]+([0-9]*\.?[0-9]+)/i);
  if (match) return clamp01(parseFloat(match[1]));

  // Last resort: find any standalone decimal in [0,1].
  const anyNum = raw.match(/\b(0?\.\d+|1\.0+|0|1)\b/);
  if (anyNum) return clamp01(parseFloat(anyNum[1]));

  return 0;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}