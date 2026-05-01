import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { generateRiskMemoService } from "@/lib/ai/risk-memo-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const auth = await requirePermission("ai:risk_memo");

    const memo = await generateRiskMemoService(
      {
        userId: auth.user.id,
        organizationId: auth.organization.id,
        role: auth.membership.role,
      },
      { complianceCaseId: caseId }
    );

    return NextResponse.json({
      success: true,
      riskMemo: {
        id: memo.id,
        executiveSummary: memo.executiveSummary,
        recommendedAction: memo.recommendedAction,
        createdAt: memo.createdAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
