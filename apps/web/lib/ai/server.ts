"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/server";
import { generateRiskMemoService } from "./risk-memo-service";
import { acceptRiskMemoService } from "./accept-service";

function toContext(context: Awaited<ReturnType<typeof requirePermission>>) {
  return {
    userId: context.user.id,
    organizationId: context.organization.id,
    role: context.membership.role,
  };
}

export async function generateRiskMemo(caseId: string) {
  const ctx = toContext(await requirePermission("ai:risk_memo"));
  const memo = await generateRiskMemoService(ctx, { complianceCaseId: caseId });
  revalidatePath(`/cases/${caseId}`);
  return memo;
}

export async function acceptRiskMemo(riskMemoId: string, createCaseNoteFromMemo: boolean = false) {
  const ctx = toContext(await requirePermission("cases:update"));
  const result = await acceptRiskMemoService(ctx, {
    riskMemoId,
    createCaseNoteFromMemo,
  });
  revalidatePath(`/cases/${result.riskMemo.complianceCaseId}`);
  return result;
}
