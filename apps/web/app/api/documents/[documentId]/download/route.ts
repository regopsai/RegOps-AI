import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { getDocumentDownloadService } from "@/lib/documents/document-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  const context = await requirePermission("documents:read");

  try {
    const result = await getDocumentDownloadService(
      {
        userId: context.user.id,
        organizationId: context.organization.id,
        role: context.membership.role,
      },
      documentId
    );

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(result.fileName)}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
