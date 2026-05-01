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

## Database Commands
- `pnpm db:generate` — Generate Prisma client from schema
- `pnpm db:validate` — Validate Prisma schema
- `pnpm db:migrate` — Run Prisma migrations in dev mode
- `pnpm db:seed` — Seed the database with demo data
- `pnpm db:studio` — Open Prisma Studio
- `pnpm db:reset` — Reset database and re-run migrations

## Future Deployment Target
- Dockerized container deployment
- PostgreSQL for primary data
- S3-compatible storage for documents
- Next.js application server
- Environment variables managed via deployment platform secrets
