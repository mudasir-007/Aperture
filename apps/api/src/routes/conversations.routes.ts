import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import {
  listConversationsForUser,
  findConversationByIdForUser,
} from '../repositories/conversation.repository';
import {
  listMessagesForConversation,
  listCitationsForMessages,
} from '../repositories/message.repository';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const conversations = await listConversationsForUser(req.user!.userId);
    res.json({ conversations });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const conversation = await findConversationByIdForUser(
      req.params.id,
      req.user!.userId
    );
    if (!conversation) return res.status(404).json({ error: 'Not found' });

    const messages = await listMessagesForConversation(conversation.id);
    const citationsByMessage = await listCitationsForMessages(
      messages.map((m) => m.id)
    );

    res.json({
      conversation,
      messages: messages.map((m) => ({
        ...m,
        citations: citationsByMessage.get(m.id) ?? [],
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;