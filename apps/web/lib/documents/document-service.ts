import { z } from "zod";
import {
  prisma,
  createDocumentForOrganization,
  getDocumentForOrganization,
  listDocumentsForCase,
  listDocumentsForCustomer,
  listDocumentsForBusiness,
  archiveDocumentForOrganization,
  updateDocumentExtractionForOrganization,
  createAuditEvent,
} from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import { getStorageProvider } from "@/lib/storage";
import { validateUpload } from "./validation";
import { extractDocumentText } from "./extraction";
import type { DocumentType } from "@regops-ai/database";

export interface ActorContext {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
}

function assertPermission(ctx: ActorContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
}

function generateStorageKey(organizationId: string, originalFileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  const safeName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 100);
  return `${organizationId}/${timestamp}-${random}-${safeName}`;
}

const uploadDocumentSchema = z.object({
  type: z.enum([
    "ID_DOCUMENT",
    "PROOF_OF_ADDRESS",
    "COMPANY_REGISTRATION",
    "BENEFICIAL_OWNERSHIP",
    "BANK_STATEMENT",
    "TRANSACTION_CSV",
    "COMPLIANCE_POLICY",
    "OTHER",
  ]),
  customerProfileId: z.string().optional(),
  businessProfileId: z.string().optional(),
  complianceCaseId: z.string().optional(),
});

export async function uploadDocumentService(
  ctx: ActorContext,
  input: {
    fileName: string;
    mimeType: string;
    fileBuffer: Buffer;
    type: DocumentType;
    customerProfileId?: string;
    businessProfileId?: string;
    complianceCaseId?: string;
  }
) {
  assertPermission(ctx, "documents:upload");

  // Validate at least one owner is provided
  if (!input.customerProfileId && !input.businessProfileId && !input.complianceCaseId) {
    throw new Error("Document must be linked to at least one case, customer, or business");
  }

  // Validate linked entities belong to the same organization
  if (input.complianceCaseId) {
    const caseRecord = await prisma.complianceCase.findFirst({
      where: { id: input.complianceCaseId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!caseRecord) {
      throw new Error("Case not found in organization");
    }
  }
  if (input.customerProfileId) {
    const profile = await prisma.customerProfile.findFirst({
      where: { id: input.customerProfileId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!profile) {
      throw new Error("Customer not found in organization");
    }
  }
  if (input.businessProfileId) {
    const profile = await prisma.businessProfile.findFirst({
      where: { id: input.businessProfileId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!profile) {
      throw new Error("Business not found in organization");
    }
  }

  // File validation
  const validation = validateUpload(input.fileName, input.mimeType, input.fileBuffer);
  if (!validation.valid) {
    throw new Error(validation.error ?? "File validation failed");
  }

  // Store file
  const storageKey = generateStorageKey(ctx.organizationId, input.fileName);
  const storage = getStorageProvider();
  await storage.putObject({
    key: storageKey,
    body: input.fileBuffer,
    contentType: input.mimeType,
  });

  // Create DB record
  const doc = await createDocumentForOrganization({
    organizationId: ctx.organizationId,
    customerProfileId: input.customerProfileId,
    businessProfileId: input.businessProfileId,
    complianceCaseId: input.complianceCaseId,
    type: input.type,
    originalFileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.fileBuffer.length,
    storageKey,
    checksumSha256: validation.checksumSha256 ?? undefined,
    uploadedByUserId: ctx.userId,
  });

  // Audit event
  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "DOCUMENT_UPLOADED",
    entityType: "Document",
    entityId: doc.id,
    metadataJson: JSON.stringify({
      documentType: input.type,
      originalFileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.fileBuffer.length,
      complianceCaseId: input.complianceCaseId,
      customerProfileId: input.customerProfileId,
      businessProfileId: input.businessProfileId,
    }),
  });

  // Text extraction (async fire-and-forget for now, but we await for simplicity)
  try {
    const extraction = await extractDocumentText(input.mimeType, input.fileBuffer);
    await updateDocumentExtractionForOrganization(ctx.organizationId, doc.id, {
      extractedText: extraction.extractedText ?? undefined,
      extractionMetadataJson: extraction.metadataJson,
      status: extraction.status === "EXTRACTED" ? "EXTRACTED" : extraction.status === "FAILED" ? "FAILED" : "UPLOADED",
    });

    await createAuditEvent({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: extraction.status === "EXTRACTED" ? "DOCUMENT_EXTRACTION_COMPLETED" : "DOCUMENT_EXTRACTION_FAILED",
      entityType: "Document",
      entityId: doc.id,
      metadataJson: extraction.metadataJson,
    });
  } catch {
    // Extraction failure should not fail the upload
    await updateDocumentExtractionForOrganization(ctx.organizationId, doc.id, {
      status: "UPLOADED",
      extractionMetadataJson: JSON.stringify({ reason: "Extraction process failed unexpectedly" }),
    });
  }

  return doc;
}

export async function archiveDocumentService(ctx: ActorContext, documentId: string) {
  assertPermission(ctx, "documents:upload");

  const doc = await getDocumentForOrganization(ctx.organizationId, documentId);
  if (!doc) {
    throw new Error("Document not found");
  }

  await archiveDocumentForOrganization(ctx.organizationId, documentId);

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "DOCUMENT_ARCHIVED",
    entityType: "Document",
    entityId: documentId,
    metadataJson: JSON.stringify({
      documentType: doc.type,
      originalFileName: doc.originalFileName,
      mimeType: doc.mimeType,
    }),
  });
}

export async function getDocumentDownloadService(ctx: ActorContext, documentId: string) {
  assertPermission(ctx, "documents:read");

  const doc = await getDocumentForOrganization(ctx.organizationId, documentId);
  if (!doc) {
    throw new Error("Document not found");
  }

  const storage = getStorageProvider();
  const object = await storage.getObject({ key: doc.storageKey });

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "DOCUMENT_DOWNLOADED",
    entityType: "Document",
    entityId: documentId,
    metadataJson: JSON.stringify({
      documentType: doc.type,
      originalFileName: doc.originalFileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
    }),
  });

  return {
    fileName: doc.originalFileName,
    mimeType: doc.mimeType,
    buffer: object.body,
  };
}

export async function listDocumentsForCaseService(ctx: ActorContext, caseId: string) {
  assertPermission(ctx, "documents:read");
  return listDocumentsForCase(ctx.organizationId, caseId);
}

export async function listDocumentsForCustomerService(
  ctx: ActorContext,
  customerProfileId: string
) {
  assertPermission(ctx, "documents:read");
  return listDocumentsForCustomer(ctx.organizationId, customerProfileId);
}

export async function listDocumentsForBusinessService(
  ctx: ActorContext,
  businessProfileId: string
) {
  assertPermission(ctx, "documents:read");
  return listDocumentsForBusiness(ctx.organizationId, businessProfileId);
}

export async function getDocumentService(ctx: ActorContext, documentId: string) {
  assertPermission(ctx, "documents:read");
  return getDocumentForOrganization(ctx.organizationId, documentId);
}
