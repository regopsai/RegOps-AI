"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import type { CaseStatus, RiskLevel } from "@regops-ai/database";
import {
  listCasesService,
  getCaseService,
  createCaseService,
  updateCaseService,
  assignCaseService,
  changeCaseStatusService,
  addCaseNoteService,
  listCustomersService,
  getCustomerService,
  listBusinessesService,
  getBusinessService,
  getCaseAuditEventsService,
} from "./case-service";
import {
  makeFinalDecisionService,
  listApprovalDecisionsService,
} from "./decision-service";
import { generateRiskSignalsForCaseService } from "@/lib/risk/risk-service";

function toContext(context: Awaited<ReturnType<typeof requirePermission>>) {
  return {
    userId: context.user.id,
    organizationId: context.organization.id,
    role: context.membership.role,
  };
}

export async function listCases(filters?: {
  status?: CaseStatus;
  riskLevel?: RiskLevel;
  assignedToUserId?: string;
  subjectType?: "individual" | "business" | "all";
  search?: string;
}) {
  const ctx = toContext(await requirePermission("cases:read"));
  return listCasesService(ctx, filters);
}

export async function getCase(caseId: string) {
  const ctx = toContext(await requirePermission("cases:read"));
  return getCaseService(ctx, caseId);
}

export async function createCase(formData: FormData) {
  const ctx = toContext(await requirePermission("cases:create"));
  const newCase = await createCaseService(ctx, formData);
  revalidatePath("/cases");
  redirect(`/cases/${newCase.id}`);
}

export async function updateCase(caseId: string, formData: FormData) {
  const ctx = toContext(await requirePermission("cases:update"));
  await updateCaseService(ctx, caseId, formData);
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
}

export async function assignCase(caseId: string, userId: string | null) {
  const ctx = toContext(await requirePermission("cases:assign"));
  await assignCaseService(ctx, caseId, userId);
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
}

export async function changeCaseStatus(caseId: string, status: CaseStatus) {
  const ctx = toContext(await requirePermission("cases:update"));
  await changeCaseStatusService(ctx, caseId, status);
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
}

export async function addCaseNote(caseId: string, formData: FormData) {
  const ctx = toContext(await requirePermission("cases:update"));
  await addCaseNoteService(ctx, caseId, formData);
  revalidatePath(`/cases/${caseId}`);
}

export async function listCustomers(search?: string) {
  const ctx = toContext(await requirePermission("cases:read"));
  return listCustomersService(ctx, search);
}

export async function getCustomer(customerId: string) {
  const ctx = toContext(await requirePermission("cases:read"));
  return getCustomerService(ctx, customerId);
}

export async function listBusinesses(search?: string) {
  const ctx = toContext(await requirePermission("cases:read"));
  return listBusinessesService(ctx, search);
}

export async function getBusiness(businessId: string) {
  const ctx = toContext(await requirePermission("cases:read"));
  return getBusinessService(ctx, businessId);
}

export async function getCaseAuditEvents(caseId: string) {
  const ctx = toContext(await requirePermission("cases:read"));
  return getCaseAuditEventsService(ctx, caseId);
}

export async function runCaseRiskChecks(caseId: string) {
  const ctx = toContext(await requirePermission("cases:update"));
  const result = await generateRiskSignalsForCaseService(ctx, caseId);
  return result;
}

export async function makeFinalDecision(caseId: string, formData: FormData) {
  const ctx = toContext(await requirePermission("cases:final_decision"));
  const decision = formData.get("decision") as string;
  const reason = formData.get("reason") as string;
  await makeFinalDecisionService(ctx, { caseId, decision, reason } as {
    caseId: string;
    decision: "APPROVE" | "REJECT" | "ESCALATE" | "REQUEST_MORE_INFORMATION" | "CLOSE_NO_ACTION";
    reason: string;
  });
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
}

export async function getApprovalDecisions(caseId: string) {
  const ctx = toContext(await requirePermission("cases:read"));
  return listApprovalDecisionsService(ctx, caseId);
}
