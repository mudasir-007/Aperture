import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  removeDocument,
} from '../services/document.service';
import { enqueueIngestion } from '../queue/ingestion.queue';
import { uploadObject } from '../storage/s3.client';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();
router.use(requireAuth);

router.post('/upload', upload.single('file'), async (req: AuthedRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const orgId = req.user!.organizationId;
    const userId = req.user!.userId;

    // Build a deterministic-ish, collision-free S3 key.
    const ext = path.extname(req.file.originalname);
    const key = `orgs/${orgId}/documents/${crypto.randomUUID()}${ext}`;

    // 1. Upload bytes to object storage.
    await uploadObject(key, req.file.buffer, req.file.mimetype);

    // 2. Create the DB row with the S3 key and status 'processing'.
    const doc = await uploadDocument({
      organizationId: orgId,
      ownerId: userId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      s3Key: key,
    });

    // 3. Enqueue. Job payload contains only the reference, not the bytes.
    const jobId = await enqueueIngestion({
      documentId: doc.id,
      organizationId: orgId,
      s3Key: key,
      mimeType: req.file.mimetype,
    });

    res.status(202).json({ document: doc, jobId, status: 'processing' });
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