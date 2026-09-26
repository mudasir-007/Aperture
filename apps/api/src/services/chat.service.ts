import { getLLMProvider } from '../providers/llm';
import { retrieveRelevantChunks } from './retrieval.service';
import {
  createConversation,
  findConversationByIdForUser,
  touchConversation,
} from '../repositories/conversation.repository';
import {
  createMessage,
  listMessagesForConversation,
} from '../repositories/message.repository';
import { createCitations } from '../repositories/message.repository';

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
  // 1. Resolve or create conversation
  let conversationId = input.conversationId;
  if (conversationId) {
    const conv = await findConversationByIdForUser(conversationId, input.userId);
    if (!conv) throw new Error('CONVERSATION_NOT_FOUND');
  } else {
    const conv = await createConversation(input.userId, input.query.slice(0, 60));
    conversationId = conv.id;
  }

  // 2. Load conversation history (before persisting this user turn)
  const priorMessages = await listMessagesForConversation(conversationId);
  const conversationHistory = priorMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // 3. Persist user message
  await createMessage({
    conversationId,
    role: 'user',
    content: input.query,
  });

  // 4. Retrieve context
  const chunks = await retrieveRelevantChunks(input.organizationId, input.query);

  // 5. Call the LLM through its real interface
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

  // 6. Persist assistant message
  const assistantMessage = await createMessage({
    conversationId,
    role: 'assistant',
    content: generationResult.answer,
  });

  // 7. Persist citations for the retrieved chunks that were used
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

  await touchConversation(conversationId);

  return {
    conversationId,
    answer: generationResult.answer,
    citations: usedChunks,
  };
}