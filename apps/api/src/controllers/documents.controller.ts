import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../middleware/errorHandler';
import { camelizeKeys } from '../utils/serialization';
import {
  createDocument,
  deleteDocument,
  findDocumentByIdForOrg,
  listDocumentsForOrg
} from '../repositories/document.repository';
import { ingestDocument } from '../services/ingestion.service';

export async function uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      next(new HttpError(400, 'No file was uploaded. Send it as multipart/form-data under field "file".'));
      return;
    }
    const { userId, organizationId } = req.auth!;

    const document = createDocument({
      organizationId,
      ownerId: userId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size
    });

    // Synchronous MVP ingestion (see ingestion.service.ts header note on the
    // queue/worker seam). Errors during ingestion are captured onto the
    // document's status/errorMessage rather than failing this request,
    // since the upload itself succeeded.
    await ingestDocument(document.id, req.file.buffer);

    const refreshed = findDocumentByIdForOrg(document.id, organizationId);
    res.status(201).json({ document: camelizeKeys(refreshed) });
  } catch (error) {
    next(error);
  }
}

export async function listDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { organizationId } = req.auth!;
    const documents = listDocumentsForOrg(organizationId);
    res.status(200).json({ documents: camelizeKeys(documents) });
  } catch (error) {
    next(error);
  }
}

export async function getDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { organizationId } = req.auth!;
    const document = findDocumentByIdForOrg(req.params.documentId, organizationId); // permission scoping, not just id lookup
    if (!document) {
      next(new HttpError(404, 'Document not found.'));
      return;
    }
    res.status(200).json({ document: camelizeKeys(document) });
  } catch (error) {
    next(error);
  }
}

export async function removeDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { organizationId, role, userId } = req.auth!;
    const document = findDocumentByIdForOrg(req.params.documentId, organizationId);
    if (!document) {
      next(new HttpError(404, 'Document not found.'));
      return;
    }
    if (document.owner_id !== userId && role !== 'admin') {
      next(new HttpError(403, 'Only the document owner or an organization admin can delete this document.'));
      return;
    }

    // Cascades to document_chunks -> citations via ON DELETE CASCADE
    // (foreign_keys pragma enabled in db/database.ts), matching the
    // deletion-cascade requirement in docs/architecture.md Section 12.
    deleteDocument(document.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
