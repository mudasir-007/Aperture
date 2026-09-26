import { Router } from 'express';
import multer from 'multer';
import { requireAuth, AuthedRequest } from '../middleware/auth.middleware';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  removeDocument,
} from '../services/document.service';
import { ingestDocument } from '../services/ingestion.service';

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
    // Fire and await: ingestion is currently synchronous.
    // This will move to a queue in the next phase.
    try {
      await ingestDocument(doc.id, rawText);
    } catch (ingestErr) {
      // Document is already marked failed by ingestion.service.
      // Still return the created document so the client can see the status.
    }

    const fresh = await getDocument(doc.id, req.user!.organizationId);
    res.status(201).json(fresh);
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