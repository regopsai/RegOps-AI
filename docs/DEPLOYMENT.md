# Deployment — RegOps AI

## Local Development
- Node.js >= 20
- pnpm >= 9
- PostgreSQL (local or Docker)
- S3-compatible object storage (optional for local dev)

## Setup
1. Copy `.env.example` to `.env` and fill in values.
2. Run `pnpm install`.
3. Run `pnpm dev` to start the development server.

## Future Deployment Target
- Dockerized container deployment
- PostgreSQL for primary data
- S3-compatible storage for documents
- Next.js application server
- Environment variables managed via deployment platform secrets
