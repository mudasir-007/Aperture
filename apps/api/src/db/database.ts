import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { env } from '../config/env';

let dbInstance: Database.Database | null = null;

function resolveDbFile(): string {
  // ":memory:" is honored for potential future fast unit-test use; the
  // integration test suite uses a real file (see package.json "pretest"/
  // "test" scripts) so state is inspectable across the run.
  if (env.DB_FILE === ':memory:') {
    return env.DB_FILE;
  }
  const resolved = path.isAbsolute(env.DB_FILE) ? env.DB_FILE : path.join(process.cwd(), env.DB_FILE);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = new Database(resolveDbFile());
  dbInstance.pragma('foreign_keys = ON'); // required per-connection for ON DELETE CASCADE to take effect
  dbInstance.pragma('journal_mode = WAL');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  dbInstance.exec(schema);

  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/** Deterministic-enough, dependency-free id generator: "<prefix>_<uuid>". */
export function generateId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}
