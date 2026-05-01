-- CreateEnum
CREATE TYPE "TransactionImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionImportMode" AS ENUM ('SKIP_DUPLICATES', 'FAIL_ON_DUPLICATES');

-- AlterTable
ALTER TABLE "RiskSignal" ADD COLUMN     "evidenceHash" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "transactionImportBatchId" TEXT;

-- CreateTable
CREATE TABLE "TransactionImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "fileName" TEXT NOT NULL,
    "status" "TransactionImportStatus" NOT NULL DEFAULT 'PENDING',
    "mode" "TransactionImportMode" NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errorSummaryJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionImportBatch_organizationId_idx" ON "TransactionImportBatch"("organizationId");

-- CreateIndex
CREATE INDEX "TransactionImportBatch_status_idx" ON "TransactionImportBatch"("status");

-- CreateIndex
CREATE INDEX "TransactionImportBatch_createdAt_idx" ON "TransactionImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "RiskSignal_evidenceHash_idx" ON "RiskSignal"("evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSignal_organizationId_ruleId_evidenceHash_key" ON "RiskSignal"("organizationId", "ruleId", "evidenceHash");

-- CreateIndex
CREATE INDEX "Transaction_transactionImportBatchId_idx" ON "Transaction"("transactionImportBatchId");

-- CreateIndex
CREATE INDEX "Transaction_counterpartyCountry_idx" ON "Transaction"("counterpartyCountry");

-- CreateIndex
CREATE INDEX "Transaction_amount_idx" ON "Transaction"("amount");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_organizationId_externalReference_key" ON "Transaction"("organizationId", "externalReference");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transactionImportBatchId_fkey" FOREIGN KEY ("transactionImportBatchId") REFERENCES "TransactionImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionImportBatch" ADD CONSTRAINT "TransactionImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionImportBatch" ADD CONSTRAINT "TransactionImportBatch_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
