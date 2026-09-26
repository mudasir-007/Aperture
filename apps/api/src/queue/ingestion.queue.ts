import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { ingestDocument } from '../services/ingestion.service';

export const INGESTION_QUEUE_NAME = 'document-ingestion';

export interface IngestionJobData {
  documentId: string;
  organizationId: string;
  rawText: string;
}

// Shared Redis connection for the Queue and Worker.
// BullMQ requires maxRetriesPerRequest: null on the connection.
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const ingestionQueue = new Queue<IngestionJobData>(INGESTION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export async function enqueueIngestion(data: IngestionJobData): Promise<string> {
  const job = await ingestionQueue.add('ingest', data, {
    jobId: `doc-${data.documentId}`, // idempotency: same docId = same job
  });
  return job.id!;
}

/**
 * Starts the worker that processes ingestion jobs.
 * Runs in-process with the API for now; will be extracted to apps/worker
 * in a future batch without changing the queue interface.
 */
export function startIngestionWorker(): Worker<IngestionJobData> {
  const worker = new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
    async (job: Job<IngestionJobData>) => {
      const { documentId, rawText } = job.data;
      await job.updateProgress(10);
      const result = await ingestDocument(documentId, rawText);
      await job.updateProgress(100);
      return result;
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[ingestion] completed job ${job.id} (documentId=${job.data.documentId})`);
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[ingestion] failed job ${job?.id} (documentId=${job?.data.documentId}):`,
      err.message
    );
  });

  return worker;
}