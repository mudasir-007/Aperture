import { Router } from 'express';
import multer from 'multer';
import * as documentsController from '../controllers/documents.controller';
import { requireAuth } from '../middleware/auth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB -- generous for MVP text/markdown docs
});

const router = Router();

router.use(requireAuth);

router.post('/', upload.single('file'), documentsController.uploadDocument);
router.get('/', documentsController.listDocuments);
router.get('/:documentId', documentsController.getDocument);
router.delete('/:documentId', documentsController.removeDocument);

export default router;
