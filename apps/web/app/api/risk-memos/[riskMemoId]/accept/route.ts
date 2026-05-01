import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { acceptRiskMemoService } from "@/lib/ai/accept-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ riskMemoId: string }> }
) {
  try {
    const { riskMemoId } = await params;
    const auth = await requirePermission("cases:update");

    const body = await request.json().catch(() => ({}));
    const createCaseNoteFromMemo = body.createCaseNoteFromMemo === true;

    const result = await acceptRiskMemoService(
      {
        userId: auth.user.id,
        organizationId: auth.organization.id,
        role: auth.membership.role,
      },
      { riskMemoId, createCaseNoteFromMemo }
    );

    return NextResponse.json({
      success: true,
      riskMemo: {
        id: result.riskMemo.id,
        acceptedAt: result.riskMemo.acceptedAt,
        acceptedByUserId: result.riskMemo.acceptedByUserId,
      },
      caseNoteId: result.caseNoteId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
