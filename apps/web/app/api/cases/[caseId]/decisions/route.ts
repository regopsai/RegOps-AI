import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { makeFinalDecisionService } from "@/lib/cases/decision-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const context = await requirePermission("cases:final_decision");
    const body = await request.json();

    const result = await makeFinalDecisionService(
      {
        userId: context.user.id,
        organizationId: context.organization.id,
        role: context.membership.role,
      },
      {
        caseId,
        decision: body.decision,
        reason: body.reason,
        createCaseNote: body.createCaseNote,
        reviewerComment: body.reviewerComment,
      }
    );

    return NextResponse.json({ success: true, decision: result.approvalDecision, caseNoteId: result.createdCaseNoteId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message.includes("Case not found")) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    if (message.includes("Cannot make final decision")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (
      message.includes("Reason is required") ||
      message.includes("Invalid input") ||
      message.includes("Invalid option") ||
      message.includes("Too big")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
