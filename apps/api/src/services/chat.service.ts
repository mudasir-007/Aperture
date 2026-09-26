import { getLLMProvider } from '../providers/llm';
import { retrieveRelevantChunks } from './retrieval.service';
import { buildConversationContext } from './history.service';
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

  // 3. Build context (may trigger summarization of older messages).
  const { summary, recentMessages } = await buildConversationContext(
    conversation,
    priorMessages
  );

  // 4. Persist this user's new message.
  await createMessage({
    conversationId: conversation.id,
    role: 'user',
    content: input.query,
  });

  // 5. Retrieve context from the org's documents.
  const chunks = await retrieveRelevantChunks(input.organizationId, input.query);

  // 6. Assemble the conversation history passed to the LLM.
  //    Summary (if any) goes in as the first assistant turn with a marker.
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

  // 7. Generate the answer.
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

  // 8. Persist assistant message.
  const assistantMessage = await createMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: generationResult.answer,
  });

  // 9. Persist citations for the chunks the LLM actually used.
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
  };
}