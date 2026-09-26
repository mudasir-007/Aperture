import { getLLMProvider } from '../providers/llm';
import { retrieveRelevantChunks, RetrievedChunk } from './retrieval.service';
import { buildConversationContext } from './history.service';
import { rewriteQuery } from './query-rewrite.service';
import {
  createConversation,
  findConversationByIdForUser,
  touchConversation,
  ConversationRow,
} from '../repositories/conversation.repository';
import {
  createMessage,
  listMessagesForConversation,
  createCitations,
} from '../repositories/message.repository';

// ─── Shared types ────────────────────────────────────────────────────────────

export interface ChatCitation {
  chunkId: string;
  documentId: string;
  documentFilename: string;
  content: string;
  score: number;
}

export interface ChatResult {
  conversationId: string;
  answer: string;
  citations: ChatCitation[];
  rewrittenQuery: string;
}

/**
 * Events yielded by chatStream. The route serializes these as SSE.
 */
export type ChatStreamEvent =
  | { type: 'meta'; conversationId: string; rewrittenQuery: string }
  | { type: 'token'; text: string }
  | { type: 'citations'; citations: ChatCitation[] }
  | { type: 'done'; messageId: string };

// ─── Shared preparation ─────────────────────────────────────────────────────

interface Prepared {
  conversation: ConversationRow;
  summary: string | null;
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  rewrittenQuery: string;
  chunks: RetrievedChunk[];
}

/**
 * Steps 1–6 of the chat flow, shared between buffered and streaming paths.
 * Persists the user's message and returns everything the generation step
 * needs.
 */
async function prepare(input: {
  userId: string;
  organizationId: string;
  query: string;
  conversationId?: string;
}): Promise<Prepared> {
  // 1. Resolve or create conversation.
  let conversation: ConversationRow;
  if (input.conversationId) {
    const found = await findConversationByIdForUser(
      input.conversationId,
      input.userId
    );
    if (!found) throw new Error('CONVERSATION_NOT_FOUND');
    conversation = found;
  } else {
    conversation = await createConversation(input.userId, input.query.slice(0, 60));
  }

  // 2. Load prior messages.
  const priorMessages = await listMessagesForConversation(conversation.id);

  // 3. Rolling summary + recent window.
  const { summary, recentMessages: recentMessageRows } = await buildConversationContext(
    conversation,
    priorMessages
  );

  // 4. Persist the user's message.
  await createMessage({
    conversationId: conversation.id,
    role: 'user',
    content: input.query,
  });

  // 5. Rewrite query for retrieval.
  const rewrittenQuery = await rewriteQuery({
    latestQuery: input.query,
    history: priorMessages,
  });

  // 6. Retrieve.
  const chunks = await retrieveRelevantChunks(input.organizationId, rewrittenQuery);

  const recentMessages = recentMessageRows.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  return { conversation, summary, recentMessages, rewrittenQuery, chunks };
}

function buildHistoryForPrompt(
  summary: string | null,
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (summary) {
    history.push({
      role: 'assistant',
      content: `[Summary of earlier conversation]\n${summary}`,
    });
  }
  history.push(...recentMessages);
  return history;
}

// ─── Buffered chat ──────────────────────────────────────────────────────────

export async function chat(input: {
  userId: string;
  organizationId: string;
  query: string;
  conversationId?: string;
}): Promise<ChatResult> {
  const { conversation, summary, recentMessages, rewrittenQuery, chunks } =
    await prepare(input);

  const llm = getLLMProvider();
  const generationResult = await llm.generateAnswer({
    question: input.query,
    context: chunks.map((c) => ({
      chunkId: c.chunkId,
      content: c.content,
      documentFilename: c.documentFilename,
    })),
    conversationHistory: buildHistoryForPrompt(summary, recentMessages),
  });

  const assistantMessage = await createMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: generationResult.answer,
  });

  const usedChunks = chunks.filter((c) =>
    generationResult.usedChunkIds.includes(c.chunkId)
  );
  await createCitations(
    assistantMessage.id,
    usedChunks.map((c) => ({
      documentChunkId: c.chunkId,
      snippet: c.content.slice(0, 240),
      score: c.score,
    }))
  );

  await touchConversation(conversation.id);

  return {
    conversationId: conversation.id,
    answer: generationResult.answer,
    citations: usedChunks,
    rewrittenQuery,
  };
}

// ─── Streaming chat ─────────────────────────────────────────────────────────

/**
 * Streaming variant. Yields:
 *  1. { type: 'meta' } — conversationId + rewrittenQuery, sent first
 *  2. { type: 'token' } — repeated, one per text delta from the LLM
 *  3. { type: 'citations' } — sent once, at end of generation
 *  4. { type: 'done' } — final, with the persisted message id
 *
 * Persists the assistant message and citations AFTER the stream completes.
 * If the client disconnects mid-stream, the generator throws when the
 * next yield fails, and the assistant message is NOT persisted.
 */
export async function* chatStream(input: {
  userId: string;
  organizationId: string;
  query: string;
  conversationId?: string;
}): AsyncGenerator<ChatStreamEvent, void, void> {
  const { conversation, summary, recentMessages, rewrittenQuery, chunks } =
    await prepare(input);

  yield {
    type: 'meta',
    conversationId: conversation.id,
    rewrittenQuery,
  };

  const llm = getLLMProvider();
  const stream = llm.generateAnswerStream({
    question: input.query,
    context: chunks.map((c) => ({
      chunkId: c.chunkId,
      content: c.content,
      documentFilename: c.documentFilename,
    })),
    conversationHistory: buildHistoryForPrompt(summary, recentMessages),
  });

  let generationResult;
  while (true) {
    const next = await stream.next();
    if (next.done) {
      generationResult = next.value;
      break;
    }
    yield { type: 'token', text: next.value };
  }

  // Persist assistant message + citations.
  const assistantMessage = await createMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: generationResult.answer,
  });

  const usedChunks = chunks.filter((c) =>
    generationResult.usedChunkIds.includes(c.chunkId)
  );
  await createCitations(
    assistantMessage.id,
    usedChunks.map((c) => ({
      documentChunkId: c.chunkId,
      snippet: c.content.slice(0, 240),
      score: c.score,
    }))
  );

  await touchConversation(conversation.id);

  yield { type: 'citations', citations: usedChunks };
  yield { type: 'done', messageId: assistantMessage.id };
}