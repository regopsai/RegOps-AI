import type { PrismaClient } from "@prisma/client";

const SEED_ORG_SLUG = "acme-remittance-eu";
const SEED_USER_EMAILS = [
  "owner@acme-remittance.test",
  "manager@acme-remittance.test",
  "analyst@acme-remittance.test",
  "auditor@acme-remittance.test",
];

export function isProductionEnvironment(
  databaseUrl: string | undefined,
  nodeEnv: string | undefined
): boolean {
  if (nodeEnv === "production") return true;
  const url = databaseUrl ?? "";
  const productionIndicators = ["amazonaws.com", "neon.tech", "prod", "live", "production"];
  return productionIndicators.some((indicator) =>
    url.toLowerCase().includes(indicator)
  );
}

export async function cleanupSeedData(prisma: PrismaClient): Promise<void> {
  const existingOrg = await prisma.organization.findUnique({
    where: { slug: SEED_ORG_SLUG },
  });

  if (!existingOrg) {
    return;
  }

  await prisma.transaction.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.transactionImportBatch.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.approvalDecision.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.riskMemo.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.agentRun.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.riskSignal.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.caseNote.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.complianceCase.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.document.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.policyChunk.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.policyDocument.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.businessProfile.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.customerProfile.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.auditEvent.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.organizationMember.deleteMany({
    where: { organizationId: existingOrg.id },
  });
  await prisma.passwordCredential.deleteMany({
    where: {
      user: {
        email: { in: SEED_USER_EMAILS },
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      email: { in: SEED_USER_EMAILS },
    },
  });
  await prisma.organization.delete({
    where: { id: existingOrg.id },
  });
}
