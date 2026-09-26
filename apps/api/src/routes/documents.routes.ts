import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { rateLimitUpload } from '../middleware/rateLimit';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  removeDocument,
} from '../services/document.service';
import { enqueueIngestion } from '../queue/ingestion.queue';
import { uploadObject } from '../storage/s3.client';

const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();
router.use(requireAuth);

router.post(
  '/upload',
  rateLimitUpload,
  upload.single('file'),
  async (req: AuthedRequest, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(415).json({
          error: `Unsupported file type: ${req.file.mimetype}`,
          allowed: Array.from(ALLOWED_MIME_TYPES),
        });
      }

      const orgId = req.user!.organizationId;
      const userId = req.user!.userId;

      // Each document gets its own S3 prefix, so deletion can sweep the
      // whole directory (raw upload + any future derivatives) with one call.
      const docUuid = crypto.randomUUID();
      const ext = path.extname(req.file.originalname) || '.bin';
      const key = `orgs/${orgId}/documents/${docUuid}/original${ext}`;

      await uploadObject(key, req.file.buffer, req.file.mimetype);

      const doc = await uploadDocument({
        organizationId: orgId,
        ownerId: userId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        s3Key: key,
      });

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
  }
);

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