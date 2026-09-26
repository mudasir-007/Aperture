import { Router } from 'express';
import multer from 'multer';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  removeDocument,
} from '../services/document.service';
import { enqueueIngestion } from '../queue/ingestion.queue';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const router = Router();
router.use(requireAuth);

router.post('/upload', upload.single('file'), async (req: AuthedRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const doc = await uploadDocument({
      organizationId: req.user!.organizationId,
      ownerId: req.user!.userId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      buffer: req.file.buffer,
    });

    const rawText = req.file.buffer.toString('utf-8');

    // Enqueue instead of awaiting — returns immediately with status 'processing'.
    const jobId = await enqueueIngestion({
      documentId: doc.id,
      organizationId: req.user!.organizationId,
      rawText,
    });

    res.status(202).json({
      document: doc,
      jobId,
      status: 'processing',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const docs = await listDocuments(req.user!.organizationId);
    res.json({ documents: docs });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const doc = await getDocument(req.params.id, req.user!.organizationId);
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    await removeDocument(req.params.id, req.user!.organizationId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;