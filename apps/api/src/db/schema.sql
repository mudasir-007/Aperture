-- RAG Chat Application schema (MVP data layer, SQLite via better-sqlite3).
--
-- See docs/architecture.md for the full conceptual model (Section 20) and
-- the documented migration path to Postgres+pgvector at scale. This file
-- is applied idempotently (IF NOT EXISTS) by src/db/database.ts on every
-- startup -- a deliberately simple stand-in for a versioned migration tool
-- (e.g. node-pg-migrate/umzug), which is a documented Production-V1 item
-- (docs/architecture.md Section 21) once there's more than one schema
-- change to sequence.

CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  owner_id        TEXT NOT NULL REFERENCES users(id),
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'processing',
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- Composite index backing the permission-filter query in retrieval.service.ts
-- (docs/architecture.md Section 4.7 -- filter before search, indexed for it).
CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_org_status ON documents(organization_id, status);

CREATE TABLE IF NOT EXISTS document_chunks (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding   TEXT NOT NULL, -- JSON-encoded number[]
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  title      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS citations (
  id                TEXT PRIMARY KEY,
  message_id        TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  document_chunk_id TEXT NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  snippet           TEXT NOT NULL,
  score             REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_citations_message ON citations(message_id);
