import { getLLMProvider } from '../providers/llm';
import { retrieveRelevantChunks, RetrievedChunk } from './retrieval.service';
import {
  createConversation,
  findConversationById,
} from '../repositories/conversation.repository';
import { createMessage, findMessagesByConversationId } from '../repositories/message.repository';
import { createCitation } from '../repositories/citation.repository';

const SYSTEM_PROMPT = `You are a helpful AI assistant.
Answer the user's question ONLY using the provided context.
If the context does not contain the answer, say "I cannot find the answer in the provided documents."
Always cite your sources inline using [filename].`;

export interface ChatResult {
  conversationId: string;
  answer: string;
  citations: RetrievedChunk[];
}

export async function chat(input: {
  userId: string;
  organizationId: string;
  query: string;
  conversationId?: string;
}): Promise<ChatResult> {
  // 1. Resolve conversation (create if new).
  let conversationId = input.conversationId;
  if (conversationId) {
    const conv = await findConversationById(conversationId);
    if (!conv) throw new Error('CONVERSATION_NOT_FOUND');
    if (conv.user_id !== input.userId) throw new Error('FORBIDDEN');
  } else {
    const conv = await createConversation(input.userId, input.query.slice(0, 60));
    conversationId = conv.id;
  }

  // 2. Persist the user message.
  await createMessage({
    conversationId,
    role: 'user',
    content: input.query,
  });

  // 3. Retrieve context.
  const chunks = await retrieveRelevantChunks(input.organizationId, input.query);

  // 4. Build prompt.
  const context = chunks
    .map((c) => `[${c.documentFilename}]\n${c.content}`)
    .join('\n\n---\n\n');

  const prompt = `Context:\n${context}\n\nQuestion: ${input.query}`;

  // 5. Generate.
  const llm = getLLMProvider();
  const answer = await llm.generate(prompt, SYSTEM_PROMPT);

  // 6. Persist assistant message + citations.
  const assistantMessage = await createMessage({
    conversationId,
    role: 'assistant',
    content: answer,
  });

  for (const chunk of chunks) {
    await createCitation({
      messageId: assistantMessage.id,
      documentChunkId: chunk.chunkId,
      snippet: chunk.content.slice(0, 240),
      score: chunk.score,
    });
  }

  return { conversationId, answer, citations: chunks };
}