# Deployment — RegOps AI

## Local Development
- Node.js >= 20
- pnpm >= 9
- PostgreSQL (local or Docker)
- S3-compatible object storage (optional for local dev)

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

### Optional
- `REGOPS_SEED_PASSWORD` — Password for seed demo users. Defaults to `RegOpsDev123!` for local dev. **Never use the default in production.**

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
