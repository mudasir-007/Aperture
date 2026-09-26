import { Router } from 'express';
import * as conversationsController from '../controllers/conversations.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createConversationSchema, createMessageSchema } from '../utils/validation';

const router = Router();

router.use(requireAuth);

router.post('/', validate(createConversationSchema), conversationsController.createConversationHandler);
router.get('/', conversationsController.listConversations);
router.get('/:conversationId', conversationsController.getConversation);
router.post('/:conversationId/messages', validate(createMessageSchema), conversationsController.postMessage);

export default router;
