import { getLLMProvider } from '../providers/llm';
import { retrieveRelevantChunks } from './retrieval.service';
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

export interface ChatResult {
  conversationId: string;
  answer: string;
  citations: Array<{
    chunkId: string;
    documentId: string;
    documentFilename: string;
    content: string;
    score: number;
  }>;
  /** The query actually used for retrieval (may differ from the user's text). */
  rewrittenQuery: string;
}

export async function chat(input: {
  userId: string;
  organizationId: string;
  query: string;
  conversationId?: string;
}): Promise<ChatResult> {
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

  // 3. Build summarized context for the LLM (Batch 7).
  const { summary, recentMessages } = await buildConversationContext(
    conversation,
    priorMessages
  );

  // 4. Persist the user's actual message (unchanged).
  await createMessage({
    conversationId: conversation.id,
    role: 'user',
    content: input.query,
  });

  // 5. Rewrite the query for retrieval (Batch 8).
  //    Uses prior history, not the just-persisted user turn.
  const rewrittenQuery = await rewriteQuery({
    latestQuery: input.query,
    history: priorMessages,
  });

  // 6. Retrieve using the rewritten query.
  const chunks = await retrieveRelevantChunks(
    input.organizationId,
    rewrittenQuery
  );

  // 7. Assemble conversation history for the LLM.
  const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (summary) {
    conversationHistory.push({
      role: 'assistant',
      content: `[Summary of earlier conversation]\n${summary}`,
    });
  }
  for (const m of recentMessages) {
    conversationHistory.push({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    });
  }

  // 8. Generate using the ORIGINAL user query as the question.
  //    The LLM should answer what the user actually asked, not the
  //    rewritten search query.
  const llm = getLLMProvider();
  const generationResult = await llm.generateAnswer({
    question: input.query,
    context: chunks.map((c) => ({
      chunkId: c.chunkId,
      content: c.content,
      documentFilename: c.documentFilename,
    })),
    conversationHistory,
  });

  // 9. Persist assistant message.
  const assistantMessage = await createMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: generationResult.answer,
  });

  // 10. Persist citations for used chunks.
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