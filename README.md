# RegOps AI

Compliance-native AI back office for regulated fintech operations.

## Overview

RegOps AI helps fintechs, remittance companies, stablecoin businesses, crypto platforms, payment companies, and money-transfer operators manage KYB/KYC review, AML casework, policy checks, risk memos, human approval, evidence exports, and audit trails.

## Monorepo Structure

- `apps/web` — Next.js App Router application
- `packages/database` — Prisma database client (schema TBD)
- `packages/ai` — AI provider interfaces (implementation TBD)
- `packages/compliance-core` — Shared compliance domain types
- `packages/config` — Shared TypeScript and tooling configuration
- `packages/ui` — Shared UI utilities and components

## Getting Started

### Requirements
- Node.js >= 20
- pnpm >= 9

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Lint and Typecheck

```bash
pnpm lint
pnpm typecheck
```

## Tech Stack

- pnpm workspace + Turborepo
- Next.js App Router + TypeScript (strict)
- Tailwind CSS
- ESLint + Prettier
- Prisma (prepared, schema pending)

## License

Proprietary — All rights reserved.
