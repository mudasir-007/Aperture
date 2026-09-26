# RAG Chat Application (MVP)

A working, end-to-end Retrieval-Augmented Generation chat application: upload
documents, ask questions, get cited answers grounded in your own content.

This is the **MVP implementation** of the full architecture described in
[`docs/architecture.md`](docs/architecture.md) (Phases 1–4 of that document's
roadmap). It is genuinely runnable end-to-end with **zero external services
or API keys** — see [Known Limitations & Scope](#known-limitations--scope)
for exactly what that means and what's deliberately deferred.

## 1. Overview

- Register an organization + user account.
- Upload plain-text (`.txt`) or Markdown (`.md`) documents.
- Documents are chunked, embedded, and indexed automatically on upload.
- Ask questions in a chat interface; answers are grounded in retrieved
  document chunks and show their sources (citations), or honestly say when
  no relevant document was found.
- Retrieval is scoped to your organization only — a hard permission boundary
  enforced at the database query level, not a post-filter.

## 2. Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full system
design. In short, this MVP implements:

```
Browser (React SPA)
     │  fetch, JSON + multipart
     ▼
Express API (apps/api)
  ├── auth (register/login, JWT, bcrypt)
  ├── documents (upload → parse → chunk → embed → index, synchronous)
  ├── conversations (create/list/get)
  └── chat (retrieve → generate → cite, per message)
     │
     ▼
SQLite (better-sqlite3), file-based
  organizations, users, documents, document_chunks (embeddings as JSON),
  conversations, messages, citations
     │
     ▼
Pluggable AI providers (src/providers/{embeddings,llm})
  Mock (default, deterministic, no network) | OpenAI (real, needs API key)
```

## 3. Technologies

| Layer | Technology | Why |
|---|---|---|
| API | Node.js 22, TypeScript, Express | Simple, well-understood, easy to extend |
| Data | SQLite via `better-sqlite3` | Zero external infra for MVP; see [Known Limitations](#known-limitations--scope) for the Postgres+pgvector migration path |
| Auth | JWT + bcrypt | Standard, stateless |
| Validation | Zod | Type-safe request validation |
| Frontend | React 18 + Vite + TypeScript | Fast dev loop, small bundle |
| Testing | Jest + Supertest (API) | Real HTTP-level integration tests, not just mocks |
| Containerization | Docker, Docker Compose | Reproducible local/prod-like runs |

## 4. Requirements

- Node.js 22+ and npm 10+ (or Docker, see [Docker](#9-docker))
- No database server, no external API key required to run the full app —
  see the Mock providers below.

## 5. Installation

```bash
git clone <this-repo>
cd rag-chat-app
npm install
```

This installs both `apps/api` and `apps/web` via npm workspaces.

## 6. Environment configuration

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env   # optional for local dev; the Vite dev server proxies /api by default
```

Key variables (full list with comments in `apps/api/.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `DB_FILE` | `./data/dev.db` | SQLite file path |
| `JWT_SECRET` | *(dev placeholder)* | **Change this** for anything beyond local dev |
| `EMBEDDING_PROVIDER` | `mock` | Set to `openai` + provide `OPENAI_API_KEY` for real semantic embeddings |
| `LLM_PROVIDER` | `mock` | Set to `openai` + provide `OPENAI_API_KEY` for real generated answers |
| `RETRIEVAL_TOP_K` | `5` | How many chunks are retrieved per question |

The **Mock providers are the default and are what CI/tests use** — they make
ingestion, retrieval, and chat genuinely functional with no network access:
the mock embedding provider uses deterministic feature hashing (shared
vocabulary → higher similarity), and the mock LLM does real extractive
synthesis over retrieved chunks rather than returning a canned string.

## 7. Database setup

There is no separate migration step to run — `apps/api/src/db/database.ts`
applies `apps/api/src/db/schema.sql` (idempotent `CREATE TABLE IF NOT
EXISTS` statements) automatically the first time the app or test suite
touches the database. The SQLite file is created at `DB_FILE` if it doesn't
exist.

To seed a demo account (`demo@example.com` / `password123`):

```bash
npm run seed --workspace apps/api
```

## 8. Running locally

In two terminals:

```bash
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:5173, proxies /api to :4000
```

Open `http://localhost:5173`, register an account, upload a `.txt` or `.md`
file, and start chatting.

## 9. Docker

```bash
cp .env.example .env   # set a real JWT_SECRET
docker compose up --build
```

- API: `http://localhost:4000`
- Web: `http://localhost:8080` (nginx serves the built SPA and proxies
  `/api` to the API container)

The API's SQLite file lives on a named Docker volume (`api-data`) so data
survives container restarts.

## 10. Running tests

```bash
npm test --workspace apps/api
```

This runs 8 test suites / 35 tests: unit tests (chunker, cosine similarity,
JWT, the mock embedding provider, response serialization) and integration
tests that hit the real Express app over HTTP with Supertest against a real
(isolated) SQLite test database — including a full ingest → retrieve →
generate → cite flow and a cross-organization data-isolation check.

**Actually verified in this environment:** `npm run lint` (type-check),
`npm run build` (both workspaces), `npm test` (all 35 tests), and two manual
end-to-end HTTP smoke tests against the built server (register → upload →
ask → cited answer). All passed. `npm audit` reports 0 vulnerabilities
across the whole workspace as of the versions pinned in this repo.

## 11. Building

```bash
npm run build   # builds apps/api (tsc) and apps/web (tsc + vite build)
```

API build output: `apps/api/dist` (also copies `schema.sql`, which the
compiled `database.js` reads at runtime — don't skip this if you build the
API manually). Web build output: `apps/web/dist` (static assets).

## 12. Deployment

See `docker-compose.yml` and `infra/Dockerfile.{api,web}` for a working
containerized deployment. For a real deployment:

- Set a strong, unique `JWT_SECRET`.
- Set `EMBEDDING_PROVIDER=openai` and `LLM_PROVIDER=openai` with a real
  `OPENAI_API_KEY` for genuinely generated (not extractive-mock) answers.
- Mount `DB_FILE`'s directory on persistent storage (the Compose file
  already does this via a named volume).
- Set `VITE_API_BASE_URL` as a Docker build arg if the API is served from a
  different origin than the web app in your deployment.

## 13. API overview

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | – | Create an org + admin user, returns a JWT |
| POST | `/api/auth/login` | – | Returns a JWT |
| POST | `/api/documents` | Bearer | Upload a document (`multipart/form-data`, field `file`) |
| GET | `/api/documents` | Bearer | List your organization's documents |
| GET | `/api/documents/:id` | Bearer | Get one document |
| DELETE | `/api/documents/:id` | Bearer | Delete (owner or org admin only); cascades to chunks/citations |
| POST | `/api/conversations` | Bearer | Create a conversation |
| GET | `/api/conversations` | Bearer | List your conversations |
| GET | `/api/conversations/:id` | Bearer | Get a conversation with full message + citation history |
| POST | `/api/conversations/:id/messages` | Bearer | Send a message; runs retrieval + generation, returns the answer + citations |
| GET | `/api/health` | – | Liveness/readiness check |

All error responses share the shape `{ "error": { "message": "..." } }`
(validation errors also include a `details` field).

## 14. Project structure

```
rag-chat-app/
├── apps/
│   ├── api/                  # Express + TypeScript backend
│   │   ├── src/
│   │   │   ├── config/       # env loading + validation
│   │   │   ├── controllers/  # HTTP request handlers
│   │   │   ├── db/           # SQLite connection + schema.sql
│   │   │   ├── middleware/   # auth, validation, error handling
│   │   │   ├── providers/    # pluggable embeddings/ + llm/ (mock + OpenAI)
│   │   │   ├── repositories/ # raw-SQL data access, one file per entity
│   │   │   ├── routes/       # Express route definitions
│   │   │   ├── services/     # business logic (ingestion, retrieval, generation, auth)
│   │   │   ├── utils/        # jwt, cosine similarity, validation schemas, serialization
│   │   │   ├── app.ts        # Express app assembly
│   │   │   └── index.ts      # entry point
│   │   ├── scripts/seed.ts
│   │   └── tests/{unit,integration}/
│   └── web/                  # React + Vite frontend
│       └── src/
│           ├── api/client.ts      # typed fetch wrapper
│           ├── context/AuthContext.tsx
│           ├── components/RequireAuth.tsx
│           └── pages/{LoginPage,DocumentsPage,ChatPage}.tsx
├── docs/architecture.md      # full target architecture (see status note at its top)
├── infra/                    # Dockerfiles + nginx config
├── docker-compose.yml
├── .env.example
└── package.json              # npm workspaces root
```

## 15. Important configuration

- **`JWT_SECRET`** — must be changed from the dev default for any
  non-local use; the app fails fast at startup if it's missing or under 8
  characters, but does not enforce strength beyond that.
- **`EMBEDDING_PROVIDER` / `LLM_PROVIDER`** — switching either to `openai`
  requires `OPENAI_API_KEY`; the app fails fast at startup if that
  combination is misconfigured, rather than failing on the first request.
- **File types** — only `text/plain` and `text/markdown` are accepted by
  the ingestion pipeline today (see `src/services/parser.service.ts`); other
  types are rejected with a clear per-document error, not a crash.

## 16. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Invalid environment configuration` at startup | Check `apps/api/.env` against `.env.example`; a required var is missing or malformed |
| Document status stuck at `processing` | It shouldn't be — ingestion is synchronous in this MVP (see [Known Limitations](#known-limitations--scope)); check server logs for an ingestion error |
| Document status `failed` with an "Unsupported file type" message | Only `.txt`/`.md` are supported currently; see Section 15 |
| `401` on every API call from the frontend | Token expired (`JWT_EXPIRES_IN`) or not sent — check `Authorization: Bearer <token>` |
| Chat answers ignore an uploaded document | Confirm the document's `status` is `ready` (check `GET /api/documents`) |
| `npm run build` output runs but crashes on startup looking for `schema.sql` | You built with a partial command — use `npm run build` as defined in `apps/api/package.json`, which copies `schema.sql` into `dist/db/` |

## 17. Development workflow

1. Make a change in `apps/api/src` or `apps/web/src`.
2. `npm run dev:api` / `npm run dev:web` hot-reload automatically.
3. Before committing: `npm run lint --workspace apps/api`, `npm run
   lint --workspace apps/web`, and `npm test --workspace apps/api`.
4. New backend behavior should come with a test in `apps/api/tests/unit` or
   `apps/api/tests/integration` — the existing suite is the pattern to
   follow (real HTTP calls via Supertest, real SQLite, no mocked DB layer).

---

## Known Limitations & Scope

This is an honest account of what was deliberately deferred, and why — not
a comprehensive project audit disguised as a finished product.

**Environment-forced decisions:**
- **Prisma was replaced with `better-sqlite3` + a hand-written repository
  layer.** Prisma's query-engine binary must be downloaded from
  `binaries.prisma.sh` at `generate` time; that domain was unreachable in
  the sandbox this was built in. Rather than ship unverified Prisma code, the
  data layer was rewritten around a dependency confirmed to install and run
  natively in this environment, so every claim in this README about tests
  passing and builds succeeding is something that was actually executed, not
  assumed.
- **SQLite instead of Postgres+pgvector.** Same root cause — no reachable
  Postgres server in this sandbox to migrate against and verify. `docs/architecture.md`
  documents the intended migration; `src/services/retrieval.service.ts` and
  the repository layer are written as a seam for it (swap the query, not the
  callers).

**Deliberate MVP scope reductions** (all documented inline in source
comments at the point they apply, referencing the relevant
`docs/architecture.md` section):
- **Ingestion is synchronous, in-process**, not queue/worker-based. No
  retry/dead-letter-queue behavior. Fine for MVP document volumes; the
  `Document.status` field is the seam a future queue-backed worker would use.
- **Only `.txt`/`.md` ingestion** — no Tika/Docling/PDF/OCR. The parser has a
  single, documented seam (`parser.service.ts`) to add them.
- **Retrieval is dense-vector-only** (brute-force cosine similarity over a
  deterministic feature-hashed embedding by default, or real OpenAI
  embeddings if configured) — no BM25/hybrid fusion, no cross-encoder
  re-ranking stage yet.
- **No conditional router, multi-agent system, self-correction loop, or
  red-teaming automation.** These are real, higher-complexity features from
  the full architecture that are appropriately Phase 5/6 work, not MVP.
- **No conversation history summarization** — long conversations use a
  simple recency window (last 20 messages).
- **Rate limiting is global, not per-tenant/per-endpoint.**
- **The OpenAI provider implementations are complete but unverified** in
  this sandbox — no network access to `api.openai.com` here. They follow the
  same request/response/error/timeout handling pattern as the tested Mock
  providers; a live smoke test against a real API key is recommended before
  relying on them in production.
- **`docker-compose.yml` and the Dockerfiles are written but unverified** —
  no Docker daemon is available in this sandbox to build or run them. They
  follow standard multi-stage build patterns (see inline comments), but
  should be smoke-tested (`docker compose up --build`, then repeat the
  register → upload → chat flow) before relying on them.

**What was actually verified, precisely** (so nothing here is taken on
faith): `npm audit` (0 vulnerabilities, both workspaces), `tsc --noEmit`
(both workspaces), `npm run build` (both workspaces, including confirming
`schema.sql` is copied into `dist/`), the full Jest suite (8 suites / 35
tests, unit + integration, run twice across dependency-version changes),
and two manual end-to-end HTTP smoke tests against the compiled server
covering register → upload → create conversation → ask a question → receive
a correctly-cited answer, plus explicit verification that one organization's
documents are never retrievable by another organization's user.
