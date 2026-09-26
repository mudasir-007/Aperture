import {
  createConversation,
  findConversationById,
  findConversationsByUser,
  deleteConversation,
  ConversationRow,
} from '../repositories/conversation.repository';
import { findMessagesByConversationId, MessageRow } from '../repositories/message.repository';
import { HttpError } from '../middleware/errorHandler';

export async function listConversations(userId: string): Promise<ConversationRow[]> {
  return findConversationsByUser(userId);
}

export async function getConversationWithMessages(
  conversationId: string,
  userId: string
): Promise<{ conversation: ConversationRow; messages: MessageRow[] }> {
  const conversation = await findConversationById(conversationId);
  if (!conversation) throw new HttpError(404, 'Conversation not found.');
  if (conversation.user_id !== userId) throw new HttpError(403, 'Access denied.');

  const messages = await findMessagesByConversationId(conversationId);
  return { conversation, messages };
}

export async function removeConversation(
  conversationId: string,
  userId: string
): Promise<void> {
  const conversation = await findConversationById(conversationId);
  if (!conversation) throw new HttpError(404, 'Conversation not found.');
  if (conversation.user_id !== userId) throw new HttpError(403, 'Access denied.');
  await deleteConversation(conversationId);
}