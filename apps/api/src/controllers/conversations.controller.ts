import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../middleware/errorHandler';
import { camelizeKeys } from '../utils/serialization';
import {
  createConversation,
  findConversationByIdForUser,
  listConversationsForUser
} from '../repositories/conversation.repository';
import { listMessagesForConversation, listCitationsForMessages } from '../repositories/message.repository';
import { runChatTurn } from '../services/generation.service';

export async function createConversationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.auth!;
    const conversation = createConversation(userId, req.body.title ?? null);
    res.status(201).json({ conversation: camelizeKeys(conversation) });
  } catch (error) {
    next(error);
  }
}

export async function listConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.auth!;
    const conversations = listConversationsForUser(userId);
    res.status(200).json({ conversations: camelizeKeys(conversations) });
  } catch (error) {
    next(error);
  }
}

export async function getConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.auth!;
    const conversation = findConversationByIdForUser(req.params.conversationId, userId); // ownership scoping
    if (!conversation) {
      next(new HttpError(404, 'Conversation not found.'));
      return;
    }

    const messages = listMessagesForConversation(conversation.id);
    const citationsByMessage = listCitationsForMessages(messages.map((m) => m.id));

    res.status(200).json({
      conversation: camelizeKeys({
        ...conversation,
        messages: messages.map((m) => ({ ...m, citations: citationsByMessage.get(m.id) ?? [] }))
      })
    });
  } catch (error) {
    next(error);
  }
}

export async function postMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, organizationId } = req.auth!;
    const conversation = findConversationByIdForUser(req.params.conversationId, userId);
    if (!conversation) {
      next(new HttpError(404, 'Conversation not found.'));
      return;
    }

    const result = await runChatTurn(conversation.id, organizationId, req.body.content);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
