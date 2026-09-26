import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
  });
  return pool;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  return getPool().query(text, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Apply schema.sql idempotently. */
export async function initDb(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await getPool().query(schema);
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function generateId(prefix: string): string {
  // PostgreSQL uses gen_random_uuid() by default; this is kept for
  // callers that want a prefixed ID string (e.g. "chk_<uuid>").
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}