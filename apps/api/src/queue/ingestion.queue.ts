import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../logger';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { ingestDocument } from '../services/ingestion.service';
import { markDocumentFailed } from '../services/document.service';
import { downloadObject } from '../storage/s3.client';
import { extractText } from '../parsing/tika.client';

export const INGESTION_QUEUE_NAME = 'document-ingestion';

export interface IngestionJobData {
  documentId: string;
  organizationId: string;
  s3Key: string;
  mimeType: string;
}

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const ingestionQueue = new Queue<IngestionJobData>(INGESTION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export async function enqueueIngestion(data: IngestionJobData): Promise<string> {
  const job = await ingestionQueue.add('ingest', data, {
    jobId: `doc-${data.documentId}`,
  });
  return job.id!;
}

export function startIngestionWorker(): Worker<IngestionJobData> {
  const worker = new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
    async (job: Job<IngestionJobData>) => {
      const { documentId, s3Key, mimeType } = job.data;
      try {
        await job.updateProgress(10);

        // 1. Download raw bytes from S3.
        const buffer = await downloadObject(s3Key);
        await job.updateProgress(30);

        // 2. Extract text via Tika (handles PDF, DOCX, CSV, XLSX, etc.).
        const rawText = await extractText(buffer, mimeType);
        await job.updateProgress(50);

        // 3. Chunk + embed + index (markDocumentReady called inside).
        const result = await ingestDocument(documentId, rawText);
        await job.updateProgress(100);
        return result;
      } catch (err) {
        // Always persist failure to the DB so the document never gets stuck
        // at status='processing'. ingestDocument already calls markDocumentFailed
        // for its own errors, but S3/Tika errors above would bypass that.
        const message = err instanceof Error ? err.message : 'Unknown ingestion error';
        try {
          await markDocumentFailed(documentId, message);
        } catch (dbErr) {
          logger.error({ err: dbErr, documentId }, 'failed to mark document as failed');
        }
        throw err; // re-throw so BullMQ records the job as failed
      }
    },
    { connection, concurrency: 3 }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, documentId: job.data.documentId }, '[ingestion] job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, documentId: job?.data.documentId, err: err.message },
      '[ingestion] job failed'
    );
  });

  return worker;
}