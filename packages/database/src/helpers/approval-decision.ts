import { prisma } from "../client";
import type { ApprovalDecisionType } from "@prisma/client";

export interface CreateApprovalDecisionInput {
  organizationId: string;
  complianceCaseId: string;
  decision: ApprovalDecisionType;
  reason: string;
  evidenceSnapshotJson?: string;
  reviewerUserId: string;
}

export async function createApprovalDecision(input: CreateApprovalDecisionInput) {
  return prisma.approvalDecision.create({
    data: {
      organizationId: input.organizationId,
      complianceCaseId: input.complianceCaseId,
      decision: input.decision,
      reason: input.reason,
      evidenceSnapshotJson: input.evidenceSnapshotJson,
      reviewerUserId: input.reviewerUserId,
    },
  });
}
