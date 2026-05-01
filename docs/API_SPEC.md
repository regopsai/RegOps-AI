# API Specification — RegOps AI

## Design Principles
1. **RESTful JSON**: Standard HTTP methods and status codes.
2. **Tenant-Scoped**: Every endpoint implicitly or explicitly scopes data to the authenticated user's tenant.
3. **Versioned**: API versions are prefixed in the URL (`/api/v1/...`).
4. **Idempotency**: Mutation endpoints accept idempotency keys where appropriate.
5. **Error Standardization**: Errors return a consistent shape with `code`, `message`, and optional `details`.

## Authentication
Authentication strategy will be determined in a later phase. All endpoints will require a valid session or API key.

## Endpoints (TBD)
No endpoints are defined yet. The first endpoints to be specified will cover:
- Case CRUD operations
- Audit trail retrieval
- Evidence upload and download
- AI summary generation (advisory)
