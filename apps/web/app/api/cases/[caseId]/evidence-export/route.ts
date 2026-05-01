import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { generateEvidenceExportService } from "@/lib/exports/evidence-export-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const context = await requirePermission("evidence:export");

    const { searchParams } = new URL(request.url);
    const formatParam = searchParams.get("format");

    if (formatParam !== "json" && formatParam !== "pdf") {
      return NextResponse.json({ error: "Invalid format. Use 'json' or 'pdf'." }, { status: 400 });
    }

    const { buffer, contentType, filename } = await generateEvidenceExportService(
      {
        userId: context.user.id,
        organizationId: context.organization.id,
        role: context.membership.role,
      },
      {
        complianceCaseId: caseId,
        format: formatParam,
      }
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("Forbidden")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("Case not found") || message.includes("Organization not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("Invalid export format")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
