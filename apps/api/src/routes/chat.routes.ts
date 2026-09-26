import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { chat, chatStream } from '../services/chat.service';
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

// ─── Buffered chat ─────────────────────────────────────────────────────────

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

// ─── Streaming chat (SSE) ──────────────────────────────────────────────────

router.post('/stream', async (req: AuthedRequest, res, next) => {
  try {
    const input = chatSchema.parse(req.body);

    // SSE headers.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx)
    res.flushHeaders?.();

    // If the client disconnects, we stop consuming the generator.
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
    });

    const generator = chatStream({
      userId: req.user!.userId,
      organizationId: req.user!.organizationId,
      query: input.query,
      conversationId: input.conversationId,
    });

    try {
      for await (const event of generator) {
        if (clientClosed) break;
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (streamErr) {
      // Mid-stream failure: report it as an SSE error event.
      // The connection is already opened so we can't fall back to next().
      const message =
        streamErr instanceof Error ? streamErr.message : 'Stream failed';
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    } finally {
      res.end();
    }
  } catch (err) {
    // Pre-stream validation/auth errors go through the normal handler.
    next(err);
  }
});

// ─── Conversations ─────────────────────────────────────────────────────────

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