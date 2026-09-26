import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DB_FILE: z.string().min(1, 'DB_FILE is required'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  EMBEDDING_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  LLM_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  CHUNK_SIZE_CHARS: z.coerce.number().default(800),
  CHUNK_OVERLAP_CHARS: z.coerce.number().default(120),
  RETRIEVAL_TOP_K: z.coerce.number().default(5),
  WEB_ORIGIN: z.string().default('http://localhost:5173')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loudly rather than starting with an inconsistent config --
  // this is a deliberate "no silent misconfiguration" choice (see docs/architecture.md, Security).
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. See errors above.');
}

if (parsed.data.EMBEDDING_PROVIDER === 'openai' || parsed.data.LLM_PROVIDER === 'openai') {
  if (!parsed.data.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required when EMBEDDING_PROVIDER or LLM_PROVIDER is set to "openai".'
    );
  }
}

export const env = parsed.data;
