import { env } from '../config/env';
import { logger } from '../logger';
import { getLLMProvider } from '../providers/llm';
import { MessageRow } from '../repositories/message.repository';

const REWRITE_SYSTEM_PROMPT = `You are a query rewriter for a document-Q&A system.
Given a user's latest message and the recent conversation, rewrite the latest message into a standalone search query that:
- Resolves pronouns ("it", "that", "those") to their referents
- Restores any implicit context from the conversation
- Keeps domain-specific terms, names, and numbers verbatim
- Does NOT answer the question — only reformulate it
- Does NOT add topics the user didn't mention
- Outputs the rewritten query ONLY, with no preamble, no quotes, no explanation

If the latest message is already a standalone query, output it unchanged.`;

export interface RewriteInput {
  latestQuery: string;
  history: MessageRow[];
}

/**
 * Returns a query optimized for hybrid search.
 * Falls back to the original query if:
 *  - rewriting is disabled
 *  - history is too short to be useful
 *  - the LLM call fails
 *  - the LLM returns empty / obviously bad output
 *
 * Never throws. The chat path must always proceed.
 */
export async function rewriteQuery(input: RewriteInput): Promise<string> {
  const { latestQuery, history } = input;

  if (!env.QUERY_REWRITE_ENABLED) return latestQuery;
  if (history.length < env.QUERY_REWRITE_MIN_HISTORY) return latestQuery;

  // Only pass the last few turns to keep the rewrite prompt cheap.
  const recentHistory = history.slice(-6);
  const historyText = recentHistory
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const prompt = `Recent conversation:\n${historyText}\n\nLatest user message:\n${latestQuery}\n\nRewritten standalone query:`;

  try {
    const llm = getLLMProvider();
    const raw = await llm.complete(prompt, REWRITE_SYSTEM_PROMPT);
    const rewritten = sanitize(raw, latestQuery);
    return rewritten;
  } catch (err) {
    console.warn('[query-rewrite] failed, using original:', err);
    return latestQuery;
  }
}

/**
 * Guards against LLM misbehavior: preamble, quotes, runaway length.
 * If anything looks wrong, return the original query.
 */
function sanitize(raw: string, original: string): string {
  if (!raw) return original;

  let text = raw.trim();

  // Strip surrounding quotes if the LLM wrapped its answer.
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }

  // Strip common prefixes the LLM likes to add despite instructions.
  const prefixes = ['Rewritten query:', 'Query:', 'Standalone query:', 'Answer:'];
  for (const prefix of prefixes) {
    if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
      text = text.slice(prefix.length).trim();
    }
  }

  // If the rewrite is suspiciously long or empty, prefer the original.
  if (text.length === 0) return original;
  if (text.length > original.length * 4) return original;

  return text;
}