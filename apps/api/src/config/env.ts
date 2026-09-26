import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  EMBEDDING_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  LLM_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  RETRIEVAL_TOP_K: z.coerce.number().default(5),
  CHUNK_SIZE_CHARS: z.coerce.number().default(800),
  CHUNK_OVERLAP_CHARS: z.coerce.number().default(120),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('aperture-documents'),
  TIKA_URL: z.string().default('http://localhost:9998'),
  HYBRID_CANDIDATE_POOL: z.coerce.number().default(100),
});

export const env = envSchema.parse(process.env);