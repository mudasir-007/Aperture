import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { initDb, closeDb } from '../src/db/database';
import { retrieveRelevantChunks } from '../src/services/retrieval.service';
import { getLLMProvider } from '../src/providers/llm';
import { env } from '../src/config/env';
import {
  computeFirstHitRank,
  aggregate,
  formatMetrics,
  QuestionResult,
} from './metrics';
import { judgeFaithfulness } from './judge';

interface GoldenQuestion {
  id: string;
  question: string;
  expectedDocumentFilenames: string[];
}

interface GoldenSet {
  organizationId: string;
  topK: number;
  candidatePool: number;
  questions: GoldenQuestion[];
  skipGeneration?: boolean;
}

const GENERATION_SYSTEM_PROMPT = `You are a helpful assistant answering questions using ONLY the provided context excerpts from the user's own documents.
Rules:
- If the context does not contain enough information to answer, say so explicitly. Do not guess or use outside knowledge.
- Cite sources inline using [1], [2], etc. matching the numbered context items.
- Be concise and direct.`;

async function runQuestion(
  q: GoldenQuestion,
  orgId: string,
  topK: number,
  skipGeneration: boolean
): Promise<QuestionResult> {
  const start = Date.now();
  const retrieved = await retrieveRelevantChunks(orgId, q.question, topK);
  const latencyMs = Date.now() - start;

  const firstHitRank = computeFirstHitRank(retrieved, q.expectedDocumentFilenames);

  let answer: string | undefined;
  let faithfulness: number | undefined;

  if (!skipGeneration && retrieved.length > 0) {
    const contextBlock = retrieved
      .map((c, i) => `[${i + 1}] (source: ${c.documentFilename})\n${c.content}`)
      .join('\n\n');

    try {
      const llm = getLLMProvider();
      const result = await llm.generateAnswer({
        question: q.question,
        context: retrieved.map((c) => ({
          chunkId: c.chunkId,
          content: c.content,
          documentFilename: c.documentFilename,
        })),
        conversationHistory: [],
      });
      answer = result.answer;
      faithfulness = await judgeFaithfulness({
        question: q.question,
        answer: result.answer,
        context: retrieved,
      });
    } catch (err) {
      console.warn(`[eval] generation failed for ${q.id}:`, err);
    }
  }

  return {
    id: q.id,
    question: q.question,
    retrievedFilenames: retrieved.map((c) => c.documentFilename),
    retrievedChunkIds: retrieved.map((c) => c.chunkId),
    expectedDocumentFilenames: q.expectedDocumentFilenames,
    firstHitRank,
    latencyMs,
    answer,
    faithfulness,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const skipGeneration = args.includes('--skip-generation');

  const goldenPath = path.join(__dirname, 'golden-questions.json');
  if (!fs.existsSync(goldenPath)) {
    console.error(
      `\nMissing ${goldenPath}\n\n` +
        `Copy golden-questions.example.json to golden-questions.json and fill it in.\n`
    );
    process.exit(1);
  }

  const golden: GoldenSet = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));

  if (!golden.organizationId || golden.organizationId.startsWith('REPLACE')) {
    console.error('Set organizationId in golden-questions.json');
    process.exit(1);
  }

  console.log(`\nAperture RAG Evaluation`);
  console.log(`─`.repeat(60));
  console.log(`Provider (LLM):       ${env.LLM_PROVIDER}`);
  console.log(`Provider (embed):     ${env.EMBEDDING_PROVIDER}`);
  console.log(`Provider (rerank):    ${env.RERANKER_PROVIDER}`);
  console.log(`Top-K:                ${golden.topK}`);
  console.log(`Candidate pool:       ${golden.candidatePool}`);
  console.log(`Questions:            ${golden.questions.length}`);
  console.log(`Skip generation:      ${skipGeneration}`);
  console.log(`─`.repeat(60));

  await initDb();

  const results: QuestionResult[] = [];
  const failures: QuestionResult[] = [];

  for (const q of golden.questions) {
    process.stdout.write(`  [${q.id}] `);
    try {
      const r = await runQuestion(
        q,
        golden.organizationId,
        golden.topK,
        skipGeneration
      );
      results.push(r);
      if (r.firstHitRank === 0) failures.push(r);
      console.log(
        `rank=${r.firstHitRank || 'miss'}  latency=${r.latencyMs}ms  ` +
          `faith=${r.faithfulness !== undefined ? r.faithfulness.toFixed(2) : '-'}`
      );
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }
  }

  const metrics = aggregate(results);

  console.log(`\n${formatMetrics('Aggregate', metrics)}`);

  if (failures.length > 0) {
    console.log(`\n=== Misses (${failures.length}) ===`);
    for (const f of failures) {
      console.log(`  [${f.id}] "${f.question}"`);
      console.log(`         expected: ${f.expectedDocumentFilenames.join(', ')}`);
      console.log(`         got:      ${f.retrievedFilenames.join(', ') || '(none)'}`);
    }
  }

  // Write report.
  const reportsDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `eval-${stamp}.json`);

  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        config: {
          llmProvider: env.LLM_PROVIDER,
          embeddingProvider: env.EMBEDDING_PROVIDER,
          rerankerProvider: env.RERANKER_PROVIDER,
          topK: golden.topK,
          candidatePool: golden.candidatePool,
        },
        metrics,
        results,
      },
      null,
      2
    )
  );

  console.log(`\nReport written to ${reportPath}\n`);

  await closeDb();
}

main().catch(async (err) => {
  console.error('Eval failed:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});