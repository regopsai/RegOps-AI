import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { uploadDocumentService } from "@/lib/documents/document-service";
import type { DocumentType } from "@regops-ai/database";

export async function POST(request: NextRequest) {
  const context = await requirePermission("documents:upload");

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as DocumentType | null;
    const complianceCaseId = (formData.get("complianceCaseId") as string) || undefined;
    const customerProfileId = (formData.get("customerProfileId") as string) || undefined;
    const businessProfileId = (formData.get("businessProfileId") as string) || undefined;

    if (!file || !type) {
      return NextResponse.json(
        { error: "File and document type are required" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const doc = await uploadDocumentService(
      {
        userId: context.user.id,
        organizationId: context.organization.id,
        role: context.membership.role,
      },
      {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileBuffer: buffer,
        type,
        complianceCaseId,
        customerProfileId,
        businessProfileId,
      }
    );

    return NextResponse.json({
      id: doc.id,
      originalFileName: doc.originalFileName,
      type: doc.type,
      status: doc.status,
      sizeBytes: doc.sizeBytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
