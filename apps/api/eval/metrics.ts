import { RetrievedChunk } from '../src/services/retrieval.service';

export interface QuestionResult {
  id: string;
  question: string;
  retrievedFilenames: string[];
  retrievedChunkIds: string[];
  expectedDocumentFilenames: string[];
  /** Rank (1-based) of the first chunk from an expected document. 0 if none. */
  firstHitRank: number;
  /** Retrieval latency in milliseconds. */
  latencyMs: number;
  /** Generated answer (may be empty if generation was skipped). */
  answer?: string;
  /** 0-1 faithfulness score from the LLM judge. */
  faithfulness?: number;
}

export interface AggregateMetrics {
  questionCount: number;
  hitRate: number;
  mrr: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  avgFaithfulness: number | null;
}

/**
 * Determines the rank (1-based) of the first retrieved chunk whose parent
 * document is in the expected list. Returns 0 if none matched.
 */
export function computeFirstHitRank(
  retrieved: RetrievedChunk[],
  expectedFilenames: string[]
): number {
  const expected = new Set(expectedFilenames);
  for (let i = 0; i < retrieved.length; i++) {
    if (expected.has(retrieved[i].documentFilename)) {
      return i + 1;
    }
  }
  return 0;
}

export function aggregate(results: QuestionResult[]): AggregateMetrics {
  const n = results.length;
  if (n === 0) {
    return {
      questionCount: 0,
      hitRate: 0,
      mrr: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      avgFaithfulness: null,
    };
  }

  const hits = results.filter((r) => r.firstHitRank > 0).length;
  const hitRate = hits / n;

  const mrr =
    results.reduce(
      (sum, r) => sum + (r.firstHitRank > 0 ? 1 / r.firstHitRank : 0),
      0
    ) / n;

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const avgLatencyMs = latencies.reduce((s, x) => s + x, 0) / n;
  const p50LatencyMs = latencies[Math.floor(n * 0.5)] ?? 0;
  const p95LatencyMs = latencies[Math.min(Math.floor(n * 0.95), n - 1)] ?? 0;

  const faithScores = results
    .map((r) => r.faithfulness)
    .filter((f): f is number => typeof f === 'number');
  const avgFaithfulness =
    faithScores.length > 0
      ? faithScores.reduce((s, x) => s + x, 0) / faithScores.length
      : null;

  return {
    questionCount: n,
    hitRate,
    mrr,
    avgLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    avgFaithfulness,
  };
}

export function formatMetrics(
  label: string,
  metrics: AggregateMetrics
): string {
  const f = (n: number) => n.toFixed(3);
  return [
    `=== ${label} ===`,
    `Questions:           ${metrics.questionCount}`,
    `Hit rate @K:         ${f(metrics.hitRate)}  (${(metrics.hitRate * 100).toFixed(1)}%)`,
    `MRR:                 ${f(metrics.mrr)}`,
    `Avg latency:         ${metrics.avgLatencyMs.toFixed(0)} ms`,
    `P50 latency:         ${metrics.p50LatencyMs.toFixed(0)} ms`,
    `P95 latency:         ${metrics.p95LatencyMs.toFixed(0)} ms`,
    metrics.avgFaithfulness !== null
      ? `Avg faithfulness:    ${f(metrics.avgFaithfulness)}`
      : `Avg faithfulness:    (skipped)`,
  ].join('\n');
}