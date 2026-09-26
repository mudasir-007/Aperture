import { touchConversation } from '../repositories/conversation.repository';
import { createCitations, createMessage, listMessagesForConversation } from '../repositories/message.repository';
import { getLLMProvider } from '../providers/llm';
import { retrieveRelevantChunks } from './retrieval.service';

export interface ChatTurnResult {
  assistantMessageId: string;
  answer: string;
  citations: Array<{ documentId: string; documentFilename: string; snippet: string; score: number }>;
}

/**
 * Full chat-turn flow, matching docs/architecture.md Section 21
 * ("Chat turn" end-to-end workflow):
 *   user message persisted -> retrieval -> prompt/context assembly ->
 *   LLM generation -> citations attached -> assistant message persisted.
 */
export async function runChatTurn(
  conversationId: string,
  organizationId: string,
  userContent: string
): Promise<ChatTurnResult> {
  createMessage(conversationId, 'user', userContent);

  // Simple recency window as the conversation-history strategy; summarizing
  // older turns once a conversation exceeds the model's context budget is a
  // documented Phase-5+ concern (docs/architecture.md Section 8).
  const history = listMessagesForConversation(conversationId, 20);

  const retrievedChunks = await retrieveRelevantChunks(organizationId, userContent);

  const llmProvider = getLLMProvider();
  const { answer, usedChunkIds } = await llmProvider.generateAnswer({
    question: userContent,
    context: retrievedChunks.map((c) => ({
      chunkId: c.chunkId,
      content: c.content,
      documentFilename: c.documentFilename
    })),
    conversationHistory: history
      .slice(0, -1) // exclude the user message we just added; it's passed separately as `question`
      .map((m) => ({ role: m.role, content: m.content }))
  });

  const usedChunks = retrievedChunks.filter((c) => usedChunkIds.includes(c.chunkId));

  const assistantMessage = createMessage(conversationId, 'assistant', answer);

  createCitations(
    assistantMessage.id,
    usedChunks.map((chunk) => ({
      documentChunkId: chunk.chunkId,
      snippet: chunk.content.slice(0, 400),
      score: chunk.score
    }))
  );

  touchConversation(conversationId);

  return {
    assistantMessageId: assistantMessage.id,
    answer,
    citations: usedChunks.map((chunk) => ({
      documentId: chunk.documentId,
      documentFilename: chunk.documentFilename,
      snippet: chunk.content.slice(0, 400),
      score: chunk.score
    }))
  };
}
