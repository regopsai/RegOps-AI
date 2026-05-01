# Deployment — RegOps AI

## Local Development
- Node.js >= 20
- pnpm >= 9
- PostgreSQL (local or Docker)
- Local filesystem storage (default) or S3-compatible object storage

## Setup
1. Copy `.env.example` to `.env` and fill in values.
2. Run `pnpm install`.
3. Start local Postgres:
   ```bash
   docker compose up -d postgres
   ```
4. Run database setup:
   ```bash
   pnpm db:generate
   pnpm db:migrate
   pnpm db:seed
   ```
5. Setup test databases (required before running tests):
   ```bash
   pnpm test:setup
   ```
6. Run `pnpm dev` to start the development server.

## Environment Variables

### Required
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — Random secret for session signing (generate with `openssl rand -base64 32`)
- `AUTH_TRUST_HOST` — Set to `true` for local development

### Storage
- `STORAGE_DRIVER` — `"local"` (default) or `"s3"`
- `LOCAL_STORAGE_ROOT` — Path for local dev storage. Default: `.regops-storage` in repo root
- `S3_ENDPOINT` — S3-compatible endpoint URL
- `S3_ACCESS_KEY_ID` — S3 access key
- `S3_SECRET_ACCESS_KEY` — S3 secret key
- `S3_BUCKET` — S3 bucket name
- `S3_REGION` — S3 region
- `S3_FORCE_PATH_STYLE` — `"true"` for MinIO and other path-style S3 APIs

### Upload Limits
- `MAX_DOCUMENT_UPLOAD_BYTES` — Maximum upload size in bytes. Default: `10485760` (10MB)

### AI Provider
- `AI_PROVIDER` — `"openai-compatible"` or `"mock"`
  - `"mock"` is for local development and tests only.
  - Production MUST use `"openai-compatible"` with a real API key and model.
  - Missing `AI_PROVIDER` in production causes a fail-closed configuration error.
- `AI_API_KEY` — Required when `AI_PROVIDER=openai-compatible`
- `AI_BASE_URL` — Optional base URL override (e.g., for Azure OpenAI or custom endpoints)
- `AI_MODEL` — Required when `AI_PROVIDER=openai-compatible`
- `AI_REQUEST_TIMEOUT_MS` — Request timeout in milliseconds. Default: `30000`
- `AI_MAX_CONTEXT_CHARS` — Max context size sent to the AI. Default: `30000`
- `REGOPS_ALLOW_MOCK_AI_IN_PRODUCTION` — Set to `"true"` only if you explicitly intend to use mock output in production. Mock output is deterministic fake data and must never be used for real compliance work.

### Optional
- `REGOPS_SEED_PASSWORD` — Password for seed demo users. Defaults to `RegOpsDev123!` for local dev. **Never use the default in production.**

## Storage Configuration

### Local Development
- Files are stored in `.regops-storage/` by default (gitignored)
- Organization-scoped subdirectories
- Path traversal is blocked
- Suitable for Codespaces and local dev

### Production (S3)
- Set `STORAGE_DRIVER=s3`
- All S3 env vars must be present; missing vars cause a clear config error at startup
- No silent fallback to local storage in production
- Uses AWS SDK v3 with presigned download URLs

## Document Upload
- Supported formats: PDF, PNG, JPEG, CSV, TXT
- Server-side validation: extension, MIME type, magic bytes, size limit, SHA-256 checksum
- Text extraction for PDF (text-based), TXT, and CSV
- Images are accepted but not OCR'd in this phase
- Malware scanning is **not yet integrated** — production deployments must add AV scanning before accepting untrusted uploads

## Transaction Import
- CSV format with required columns: externalReference, direction, amount, currency, counterpartyName, counterpartyAccount, counterpartyCountry, paymentRail, transactionType, description, occurredAt
- Optional link columns: customerExternalReference, businessExternalReference, complianceCaseId
- Import modes: SKIP_DUPLICATES (default), FAIL_ON_DUPLICATES
- Deduplication via unique constraint on (organizationId, externalReference)
- Cross-organization linking is rejected at import time

## Deterministic AML Risk Signals
- 7 rule-based checks: HIGH_VALUE_TRANSACTION, STRUCTURING_PATTERN, HIGH_RISK_COUNTRY, RAPID_IN_OUT_FLOW, MANY_COUNTERPARTIES, MISSING_PROFILE_DATA, MISSING_REQUIRED_DOCUMENTS
- Idempotent via evidenceHash (SHA-256 of rule-specific evidence)
- **Not legal advice** — all signals require human compliance officer review
- No sanctions/PEP list integration yet
- No live bank feed integration yet
- No blockchain analytics integration yet

## AI Risk Memo Generation
- Requires `AI_PROVIDER` and `AI_API_KEY` + `AI_MODEL` (if using openai-compatible)
- Mock provider is used only when `AI_PROVIDER=mock`. It is NOT a silent fallback.
- Production fails closed if `AI_PROVIDER` is missing, unknown, or `mock` without override.
- Context is built from case evidence and truncated to `AI_MAX_CONTEXT_CHARS`
- All AI outputs are validated against a strict Zod schema before storage
- AI is advisory only; human acceptance is required before a memo influences case decisions
- Do not send raw secrets or API keys to logs

## Database Commands
- `pnpm db:generate` — Generate Prisma client
- `pnpm db:validate` — Validate schema
- `pnpm db:migrate` — Run migrations
- `pnpm db:seed` — Seed demo data
- `pnpm db:studio` — Open Prisma Studio
- `pnpm db:reset` — Reset database
- `pnpm test:setup` — Create test databases and apply migrations
- `pnpm db:test:reset` — Reset test databases

## Test Database Isolation
Tests use dedicated databases to ensure deterministic, CI-safe execution:

| Package | Test Database | Env Var |
|---|---|---|
| `apps/web` | `regops_ai_web_test` | `WEB_TEST_DATABASE_URL` |
| `packages/database` | `regops_ai_database_test` | `DATABASE_TEST_DATABASE_URL` |

### Why Isolation Matters
- Development data (seeded users, cases, transactions) does not interfere with test assertions.
- Multiple packages can run tests in parallel without table-locking or data collision.
- Test failures are reproducible because each test suite starts from a known empty state.

### Guardrails
- The setup script refuses to create databases whose names do not contain `test` or `_test`.
- The setup script refuses to run against production-looking URLs (e.g., containing `amazonaws.com`, `neon.tech`, `prod`, `live`).
- `db:test:reset` is configured to only operate on test databases.

## Auth Notes
- Auth.js v5 uses JWT sessions with the Credentials provider.
- Passwords are hashed with bcryptjs.
- The in-memory rate limiter is for development only. Production should use Redis or a cloud rate limiter.

## Evidence Export
- Requires `pdfkit` (installed automatically via pnpm)
- PDF generation is server-side only using `pdfkit`
- No additional runtime dependencies or browser plugins required
- Exports are generated on-demand via API route and streamed as attachments

## Future Deployment Target
- Dockerized container deployment
- PostgreSQL for primary data
- S3-compatible storage for documents
- Next.js application server
- Environment variables managed via deployment platform secrets
