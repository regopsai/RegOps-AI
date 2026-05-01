# Product Specification — RegOps AI

## Product Goal
RegOps AI is a compliance-native AI back office for regulated fintech operations. It helps fintechs, remittance companies, stablecoin businesses, crypto platforms, payment companies, and money-transfer operators manage KYB/KYC review, AML casework, policy checks, risk memos, human approval, evidence exports, and audit trails.

## MVP Scope
1. **Case Management**: Create, view, and manage compliance cases (KYB/KYC/AML).
2. **AI Assistance**: AI-generated risk summaries and policy checks with clear citations. AI is strictly advisory.
3. **Human Oversight**: Every approval, rejection, or escalation requires a human reviewer.
4. **Audit Trail**: Immutable event log for every case action and decision.
5. **Evidence Management**: Attach and export documents and evidence tied to cases.
6. **Tenant Isolation**: Multi-tenant architecture ensuring strict data separation.

## Non-Goals (for MVP)
- Real-time transaction monitoring
- Regulatory filing automation
- Public API for external integrators
- Mobile-native applications

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
