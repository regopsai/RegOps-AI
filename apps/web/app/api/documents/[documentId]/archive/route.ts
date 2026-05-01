import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { archiveDocumentService } from "@/lib/documents/document-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  const context = await requirePermission("documents:upload");

  try {
    await archiveDocumentService(
      {
        userId: context.user.id,
        organizationId: context.organization.id,
        role: context.membership.role,
      },
      documentId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Archive failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
