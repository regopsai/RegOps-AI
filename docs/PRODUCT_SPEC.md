# Product Specification — RegOps AI

## Product Goal
RegOps AI is a compliance-native AI back office for regulated fintech operations. It helps fintechs, remittance companies, stablecoin businesses, crypto platforms, payment companies, and money-transfer operators manage KYB/KYC review, AML casework, policy checks, risk memos, human approval, evidence exports, and audit trails.

## MVP Scope
1. **Case Management**: Create, view, and manage compliance cases (KYB/KYC/AML).
   - Case list with filters (status, risk level, subject type, assignee) and search
   - Case workspace with notes, risk signals, transactions, documents, audit timeline
   - Case status updates (OPEN, IN_REVIEW, ESCALATED, CLOSED)
   - Assignment to organization members
2. **Customer & Business Profiles**: Read-only profile views with related cases, transactions, documents, and risk signals.
3. **Document & Evidence Management**: Secure upload, storage, download, and archive of compliance documents. Server-side file validation (magic bytes, MIME, extension, size, SHA-256). Text extraction for PDF, TXT, CSV. Images accepted without OCR.
3. **AI Assistance**: AI-generated risk summaries and policy checks with clear citations. AI is strictly advisory.
4. **Human Oversight**: Every approval, rejection, or escalation requires a human reviewer.
5. **Audit Trail**: Immutable event log for every case action and decision.
6. **Evidence Management**: Attach and export documents and evidence tied to cases.
7. **Tenant Isolation**: Multi-tenant architecture ensuring strict data separation.
8. **RBAC**: Role-based access control with 5 roles and 21 permissions.

## Non-Goals (for MVP)
- Real-time transaction monitoring
- Regulatory filing automation
- Public API for external integrators
- Mobile-native applications
- Approval decisions (APPROVED/REJECTED) — reserved for later phase

## Target Users
- Compliance officers
- Risk analysts
- Operations managers
- Internal auditors

## Domain Model Summary

### Core Entities
- **Organization**: The top-level tenant. All business data is scoped by organization.
- **User**: Global user identity. Memberships link users to organizations with roles.
- **OrganizationMember**: Join table with role and status.
- **PasswordCredential**: Separately stored hashed password for each user.

### Profiles
- **CustomerProfile**: Individual customers (KYC).
- **BusinessProfile**: Corporate customers (KYB).

### Operations
- **Transaction**: Financial transactions linked to profiles or cases. Uses `Decimal` for amounts.
- **Document**: Uploaded evidence with extraction metadata.
- **ComplianceCase**: The central compliance review unit.
- **CaseNote**: Human-written notes on cases.

### Risk & Decisions
- **RiskSignal**: Automated or manual risk flags.
- **RiskAssessment**: Structured risk evaluation.
- **RiskMemo**: AI-generated advisory memo (separate from human decisions).
- **ApprovalDecision**: Immutable human decision on a case.

### Governance
- **PolicyDocument**: Organization policies, versioned.
- **PolicyChunk**: Searchable segments of policies.
- **AuditEvent**: Append-only log of all significant actions.
- **AgentRun**: Record of AI invocations (input, output, tokens, status).

## Roles and Permissions

| Permission | OWNER | ADMIN | COMPLIANCE_MANAGER | COMPLIANCE_ANALYST | READ_ONLY_AUDITOR |
|---|---|---|---|---|---|
| organization:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| organization:update | ✓ | ✓ | — | — | — |
| members:read | ✓ | ✓ | ✓ | — | — |
| members:invite | ✓ | ✓ | ✓ | — | — |
| members:update_role | ✓ | ✓ | — | — | — |
| members:disable | ✓ | ✓ | — | — | — |
| cases:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| cases:create | ✓ | ✓ | ✓ | ✓ | — |
| cases:update | ✓ | ✓ | ✓ | ✓ | — |
| cases:assign | ✓ | ✓ | ✓ | — | — |
| cases:final_decision | ✓ | ✓ | ✓ | — | — |
| documents:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| documents:upload | ✓ | ✓ | ✓ | ✓ | — |
| documents:archive | ✓ | ✓ | ✓ | — | — |
| transactions:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| transactions:import | ✓ | ✓ | ✓ | ✓ | — |
| policies:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| policies:write | ✓ | ✓ | ✓ | — | — |
| audit_logs:read | ✓ | ✓ | ✓ | — | ✓ |
| evidence:export | ✓ | ✓ | ✓ | — | ✓ |
| ai:risk_memo | ✓ | ✓ | ✓ | ✓ | — |
