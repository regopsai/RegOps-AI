import { prisma } from "../client";
import type { DocumentType, DocumentStatus } from "@prisma/client";

export interface CreateDocumentInput {
  organizationId: string;
  customerProfileId?: string;
  businessProfileId?: string;
  complianceCaseId?: string;
  type: DocumentType;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  checksumSha256?: string;
  uploadedByUserId: string;
}

export async function createDocumentForOrganization(input: CreateDocumentInput) {
  return prisma.document.create({
    data: {
      organizationId: input.organizationId,
      customerProfileId: input.customerProfileId,
      businessProfileId: input.businessProfileId,
      complianceCaseId: input.complianceCaseId,
      type: input.type,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
      checksumSha256: input.checksumSha256,
      uploadedByUserId: input.uploadedByUserId,
      status: "UPLOADED",
    },
  });
}

export async function getDocumentForOrganization(
  organizationId: string,
  documentId: string
) {
  return prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId,
      deletedAt: null,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      complianceCase: { select: { id: true, title: true } },
      customerProfile: { select: { id: true, firstName: true, lastName: true } },
      businessProfile: { select: { id: true, legalName: true } },
    },
  });
}

export async function listDocumentsForCase(
  organizationId: string,
  caseId: string
) {
  return prisma.document.findMany({
    where: {
      organizationId,
      complianceCaseId: caseId,
      deletedAt: null,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listDocumentsForCustomer(
  organizationId: string,
  customerProfileId: string
) {
  return prisma.document.findMany({
    where: {
      organizationId,
      customerProfileId,
      deletedAt: null,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listDocumentsForBusiness(
  organizationId: string,
  businessProfileId: string
) {
  return prisma.document.findMany({
    where: {
      organizationId,
      businessProfileId,
      deletedAt: null,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function archiveDocumentForOrganization(
  organizationId: string,
  documentId: string
) {
  return prisma.document.updateMany({
    where: {
      id: documentId,
      organizationId,
      deletedAt: null,
    },
    data: {
      status: "ARCHIVED",
    },
  });
}

export async function updateDocumentExtractionForOrganization(
  organizationId: string,
  documentId: string,
  data: {
    extractedText?: string;
    extractionMetadataJson?: string;
    status?: DocumentStatus;
  }
) {
  return prisma.document.updateMany({
    where: {
      id: documentId,
      organizationId,
      deletedAt: null,
    },
    data,
  });
}
