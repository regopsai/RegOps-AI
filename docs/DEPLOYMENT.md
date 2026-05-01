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
5. Run `pnpm dev` to start the development server.

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

## Database Commands
- `pnpm db:generate` — Generate Prisma client
- `pnpm db:validate` — Validate schema
- `pnpm db:migrate` — Run migrations
- `pnpm db:seed` — Seed demo data
- `pnpm db:studio` — Open Prisma Studio
- `pnpm db:reset` — Reset database

## Auth Notes
- Auth.js v5 uses JWT sessions with the Credentials provider.
- Passwords are hashed with bcryptjs.
- The in-memory rate limiter is for development only. Production should use Redis or a cloud rate limiter.

## Future Deployment Target
- Dockerized container deployment
- PostgreSQL for primary data
- S3-compatible storage for documents
- Next.js application server
- Environment variables managed via deployment platform secrets
