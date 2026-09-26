Aperture

A production-grade, multi-tenant RAG (Retrieval-Augmented Generation) chat application. Ingests arbitrary documents, performs hybrid retrieval with cross-encoder reranking, and generates cited answers grounded in your organization's own data.

Overview
Aperture is a full-stack TypeScript monorepo that implements a complete RAG pipeline:

Document ingestion — Upload PDF, DOCX, CSV, XLSX, PPTX, HTML, Markdown, and plain text. Files are stored in S3-compatible object storage, parsed by Apache Tika, chunked, embedded, and indexed.

Hybrid retrieval — Dense vector search (pgvector + HNSW) is fused with PostgreSQL full-text search via Reciprocal Rank Fusion. This means exact-match queries (error codes, SKUs, acronyms) work just as well as semantic queries.

Cross-encoder reranking — The top candidates from hybrid search are scored by a cross-encoder (local ONNX or Cohere). Only the top 5 chunks reach the LLM.

Multi-tenant authorization — Every retrieval query is scoped to the caller's organization at the SQL level. Chunks from another tenant can never be returned.

Async ingestion — Uploads return immediately (HTTP 202). BullMQ workers handle parsing and embedding in the background with retry and dead-letter handling.

Architecture
text
┌────────────────────────────────────────────────────────────────┐
│  Client (Web / API consumer)                                   │
└─────────────────────────┬──────────────────────────────────────┘
                          │ HTTPS
                          ▼
┌────────────────────────────────────────────────────────────────┐
│  API Layer (Express + TypeScript)                              │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Auth    │  │Documents │  │ Retrieval│  │   Chat       │  │
│  │  Routes  │  │  Routes  │  │  Service │  │   Service    │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │             │             │               │          │
└───────┼─────────────┼─────────────┼───────────────┼──────────┘
        │             │             │               │
        ▼             ▼             ▼               ▼
   ┌────────┐   ┌──────────┐  ┌──────────┐   ┌──────────┐
   │Postgres│   │  MinIO   │  │ Retrieval│   │  OpenAI  │
   │pgvector│   │   (S3)   │  │  Funnel  │   │  /LLM    │
   └────────┘   └──────────┘  └────┬─────┘   └──────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
            ┌──────────────┐              ┌──────────────┐
            │   Hybrid     │              │  Cross-Enc.  │
            │   Search     │              │  Reranker    │
            │ (Dense+BM25) │              │  (ONNX)      │
            └──────────────┘              └──────────────┘

        ┌────────────────────────────────────────────┐
        │  Async Ingestion (BullMQ + Redis)          │
        │                                            │
        │  Upload → S3 → Queue → Worker              │
        │    └─> Tika → Chunk → Embed → pgvector    │
        └────────────────────────────────────────────┘
Retrieval funnel
text
10M documents
      │
      ▼  SQL: WHERE organization_id = $org AND status = 'ready'
Permitted subset (~thousands)
      │
      ▼  Hybrid search (dense + sparse, RRF fusion, top 100)
100 candidates
      │
      ▼  Cross-encoder rerank
Top 5 chunks
      │
      ▼  Prompt construction
LLM answer with citations
Technology Stack
Domain	Technology	Purpose
Runtime	Node.js 20+, TypeScript 5.3+	Backend, workers
API framework	Express 4	HTTP layer
Database	PostgreSQL 16 + pgvector	Relational data + vector embeddings
Vector index	HNSW (vector_cosine_ops)	Sub-millisecond ANN search
Full-text index	GIN on to_tsvector('english', content)	BM25-equivalent sparse retrieval
Job queue	BullMQ + Redis 7	Async document ingestion
Object storage	MinIO (dev) / Cloudflare R2 (prod)	Raw file storage, S3-compatible
Document parsing	Apache Tika (Docker)	PDF, DOCX, CSV, XLSX, PPTX, HTML
Embeddings	OpenAI text-embedding-3-small (1536 dims)	Query + chunk vectors
Reranker	Xenova/bge-reranker-base via ONNX Runtime	Cross-encoder scoring (local, no API cost)
LLM	OpenAI GPT-4o-mini / Claude / Mock	Answer generation
Auth	JWT (HS256) + bcrypt	Sessions and password hashing
Everything in dev runs on free, self-hosted Docker services. No paid infrastructure is required to develop or test.

Repository Structure
text
Aperture/
├── apps/
│   └── api/                          # Express + TypeScript backend
│       └── src/
│           ├── config/
│           │   └── env.ts            # Zod-validated environment
│           ├── db/
│           │   ├── database.ts       # pg.Pool, query, withTransaction, initDb
│           │   └── schema.sql        # Full schema with pgvector + FTS
│           ├── middleware/
│           │   ├── auth.ts           # JWT verification
│           │   ├── errorHandler.ts   # HttpError + global handler
│           │   └── validate.ts       # Zod request validation
│           ├── parsing/
│           │   └── tika.client.ts    # Tika HTTP client
│           ├── providers/
│           │   ├── embeddings/       # Embedding provider interface + OpenAI
│           │   ├── llm/              # LLM provider interface + Mock + OpenAI
│           │   └── reranker/         # Reranker interface + Mock + Local
│           ├── queue/
│           │   └── ingestion.queue.ts # BullMQ Queue + Worker
│           ├── repositories/         # All DB access, async, org-scoped
│           ├── routes/
│           │   ├── auth.routes.ts
│           │   ├── chat.routes.ts
│           │   ├── conversations.routes.ts
│           │   ├── documents.routes.ts
│           │   └── health.routes.ts
│           ├── services/
│           │   ├── auth.service.ts
│           │   ├── chat.service.ts
│           │   ├── document.service.ts
│           │   ├── ingestion.service.ts
│           │   └── retrieval.service.ts
│           ├── storage/
│           │   └── s3.client.ts      # S3/MinIO client
│           ├── app.ts                # createApp() factory
│           └── index.ts              # Entry point
├── docker-compose.yml                # Postgres, Redis, MinIO, Tika
├── package.json
└── README.md
Requirements
Node.js 20 or newer

pnpm (or npm/yarn)

Docker and Docker Compose

Optional: an OpenAI API key for real embeddings and generation

Quick Start
1. Clone and install
bash
git clone https://github.com/mudasir-007/Aperture.git
cd Aperture
npm install
2. Configure environment
bash
cp .env.example .env
Edit .env and set at minimum:

env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rag_chat
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-a-long-random-string-min-16-chars
To use real LLMs and embeddings instead of the mock providers:

env
LLM_PROVIDER=openai
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
To enable the local cross-encoder reranker (downloads ~280MB on first run):

env
RERANKER_PROVIDER=local
3. Start infrastructure
bash
docker compose up -d
This starts four services:

Service	Port	Purpose
PostgreSQL + pgvector	5432	Relational + vector data
Redis	6379	BullMQ job queue
MinIO (S3)	9000 (API), 9001 (console)	Object storage
Apache Tika	9998	Document parsing
Wait ~30 seconds for Tika's JVM to boot. Check status with docker compose ps.

4. Run the API
bash
npm run dev --workspace apps/api
On boot you should see:

text
[db] schema ready
[s3] bucket ready
[ingestion] worker started
API listening on port 4000
The database schema is applied automatically on every start (idempotent).

5. Test the flow
Register a user:

bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123","name":"You","organizationName":"Acme"}'
Copy the returned token, then upload a document:

bash
curl -X POST http://localhost:4000/api/v1/documents/upload \
  -H "Authorization: Bearer PASTE_TOKEN_HERE" \
  -F "file=@some-document.pdf"
The upload returns immediately with status: "processing". The worker parses, chunks, embeds, and indexes it in the background. Check status:

bash
curl http://localhost:4000/api/v1/documents/PASTE_DOCUMENT_ID \
  -H "Authorization: Bearer PASTE_TOKEN_HERE"
When status becomes "ready", ask a question:

bash
curl -X POST http://localhost:4000/api/v1/chat \
  -H "Authorization: Bearer PASTE_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"query":"What does this document say about pricing?"}'
Environment Variables
Required
Variable	Example	Purpose
DATABASE_URL	postgresql://postgres:postgres@localhost:5432/rag_chat	PostgreSQL connection
JWT_SECRET	16+ character string	Token signing key
REDIS_URL	redis://localhost:6379	BullMQ queue
Optional (with defaults)
Variable	Default	Purpose
NODE_ENV	development	Runtime mode
PORT	4000	HTTP port
JWT_EXPIRES_IN	7d	JWT lifetime
LLM_PROVIDER	mock	mock or openai
EMBEDDING_PROVIDER	mock	mock or openai
RERANKER_PROVIDER	mock	mock, local, or cohere
OPENAI_API_KEY	—	Required when *_PROVIDER=openai
OPENAI_CHAT_MODEL	gpt-4o-mini	Chat completion model
OPENAI_EMBEDDING_MODEL	text-embedding-3-small	Embedding model
RERANKER_MODEL	Xenova/bge-reranker-base	Local reranker model ID
RERANK_TOP_K	5	Final chunks after reranking
HYBRID_CANDIDATE_POOL	100	Candidates per hybrid search stage
RETRIEVAL_TOP_K	5	Fallback top-K if reranking disabled
CHUNK_SIZE_CHARS	800	Chunk size
CHUNK_OVERLAP_CHARS	120	Chunk overlap
S3_ENDPOINT	http://localhost:9000	S3/MinIO endpoint
S3_REGION	us-east-1	S3 region
S3_ACCESS_KEY	minioadmin	S3 access key
S3_SECRET_KEY	minioadmin	S3 secret key
S3_BUCKET	aperture-documents	Bucket name
TIKA_URL	http://localhost:9998	Tika server URL
API Reference
All endpoints are under /api/v1. Authenticated endpoints require Authorization: Bearer <token>.

Auth
Method	Path	Purpose
POST	/auth/register	Create organization + first admin user
POST	/auth/login	Obtain JWT
GET	/auth/me	Current user info
Documents
Method	Path	Purpose
POST	/documents/upload	Upload file (multipart, field name file)
GET	/documents	List all documents for the caller's org
GET	/documents/:id	Get document + chunk count
DELETE	/documents/:id	Delete document and cascade to chunks
Upload returns 202 Accepted with { document, jobId, status: "processing" }.

Chat
Method	Path	Purpose
POST	/chat	Send a query, receive an answer with citations
GET	/conversations	List caller's conversations
GET	/conversations/:id	Get conversation + messages + citations
DELETE	/conversations/:id	Delete conversation
Health
Method	Path	Purpose
GET	/health	Liveness check including DB connectivity
Database Schema
Table	Purpose
organizations	Tenant root
users	Members of an organization
documents	Uploaded files (metadata + S3 key + ingestion status)
document_chunks	Chunk content, vector(1536) embedding, chunk_index
conversations	Chat sessions per user
messages	Individual user/assistant turns
citations	Maps assistant messages to source chunks
Key indexes:

idx_chunks_embedding_hnsw — HNSW on embedding vector_cosine_ops for dense search

idx_chunks_search_vector — GIN on to_tsvector('english', content) for sparse search

idx_documents_org_status — (organization_id, status) for permission-filtered listing

Cascade deletes ensure that removing a document removes its chunks and citations; removing an organization removes everything beneath it.

How Retrieval Works
A single query goes through five stages:

Query embedding — The query is embedded via the configured provider (text-embedding-3-small by default).

Hybrid search — Two parallel SQL CTEs run:

Dense: ORDER BY embedding <=> $query LIMIT 100

Sparse: ORDER BY ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $query)) LIMIT 100

RRF fusion — Both ranked lists are joined with FULL OUTER JOIN and fused using 1/(60 + rank). This ranks chunks high only if they appear in both lists or very high in one.

Cross-encoder reranking — The top candidates are scored jointly by a cross-encoder. This is more accurate than RRF because it reads query and document together.

Prompt construction — The final top-K chunks are formatted with source attributions and passed to the LLM with a system prompt that requires answering only from the provided context.

Citations from used chunks are persisted to the citations table alongside the assistant message.

Multi-Tenancy and Authorization
Authorization is enforced at retrieval time, not as a post-filter. Every SQL query in the retrieval pipeline includes WHERE d.organization_id = $orgId. There is no code path that retrieves cross-tenant content, even transiently.

Chunks inherit their parent document's organization_id. Documents are owned by a user but scoped to the organization. JWT payloads carry organizationId, which flows into every service call.

Development Workflow
bash
# Start infrastructure
docker compose up -d

# Start API with hot reload
npm run dev --workspace apps/api

# Type-check and build
npm run build --workspace apps/api

# Inspect infrastructure logs
docker compose logs -f tika
docker compose logs -f postgres
Adding a database column
Edit apps/api/src/db/schema.sql — add the column to the CREATE TABLE block and an idempotent ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... at the bottom.

Restart the API. initDb() runs on every boot and applies both.

Update the corresponding *Row interface and repository functions.

Switching reranker providers
Edit .env:

env
# Zero-download passthrough (default)
RERANKER_PROVIDER=mock

# Local cross-encoder (~280MB download, runs on CPU)
RERANKER_PROVIDER=local
The provider is resolved on first use and cached for the process lifetime.

Docker Services
Service	Image	Port	Notes
postgres	pgvector/pgvector:pg16	5432	Includes the vector extension
redis	redis:7-alpine	6379	Queue backend
minio	minio/minio:latest	9000, 9001	S3 API + web console
tika	apache/tika:latest	9998	JVM — first boot takes ~20s
MinIO console credentials: minioadmin / minioadmin at http://localhost:9001.

Free vs Paid Resources
Component	Development	Production
PostgreSQL + pgvector	Docker (free)	Neon / Supabase / self-hosted (free tiers available)
Redis	Docker (free)	Upstash (free tier)
Object storage	MinIO (free)	Cloudflare R2 (10GB free, $0 egress)
Tika	Docker (free)	Same Docker image, any host
Embeddings	Mock provider (free)	OpenAI (~$0.02 / 1M tokens)
Reranker	Local ONNX (free)	Same, or Cohere (paid)
LLM	Mock provider (free)	OpenAI / Anthropic (usage-based)
Aperture is fully functional in development with zero paid API calls — mock providers synthesize extractive answers from retrieved chunks.

