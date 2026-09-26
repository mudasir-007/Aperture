import {
  createConversation,
  findConversationById,
  findConversationsByUser,
  deleteConversation,
  ConversationRow,
} from '../repositories/conversation.repository';
import { findMessagesByConversationId, MessageRow } from '../repositories/message.repository';

export async function listConversations(userId: string): Promise<ConversationRow[]> {
  return findConversationsByUser(userId);
}

export async function getConversationWithMessages(
  conversationId: string,
  userId: string
): Promise<{ conversation: ConversationRow; messages: MessageRow[] }> {
  const conversation = await findConversationById(conversationId);
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');
  if (conversation.user_id !== userId) throw new Error('FORBIDDEN');

  const messages = await findMessagesByConversationId(conversationId);
  return { conversation, messages };
}

export async function removeConversation(
  conversationId: string,
  userId: string
): Promise<void> {
  const conversation = await findConversationById(conversationId);
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');
  if (conversation.user_id !== userId) throw new Error('FORBIDDEN');
  await deleteConversation(conversationId);
}