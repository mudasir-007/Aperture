import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { chat } from '../services/chat.service';
import {
  listConversations,
  getConversationWithMessages,
  removeConversation,
} from '../services/conversation.service';

const router = Router();
router.use(requireAuth);

const chatSchema = z.object({
  query: z.string().min(1),
  conversationId: z.string().uuid().optional(),
});

router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const input = chatSchema.parse(req.body);
    const result = await chat({
      userId: req.user!.userId,
      organizationId: req.user!.organizationId,
      query: input.query,
      conversationId: input.conversationId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/conversations', async (req: AuthedRequest, res, next) => {
  try {
    const conversations = await listConversations(req.user!.userId);
    res.json({ conversations });
  } catch (err) {
    next(err);
  }
});

router.get('/conversations/:id', async (req: AuthedRequest, res, next) => {
  try {
    const result = await getConversationWithMessages(
      req.params.id,
      req.user!.userId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/conversations/:id', async (req: AuthedRequest, res, next) => {
  try {
    await removeConversation(req.params.id, req.user!.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;