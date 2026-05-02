-- CreateEnum
CREATE TYPE "BlockchainNetwork" AS ENUM ('SOLANA', 'ETHEREUM', 'BASE', 'TRON');

-- CreateEnum
CREATE TYPE "WalletAddressStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WalletScreeningStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OnChainTransactionDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'SELF_TRANSFER', 'UNKNOWN');

-- AlterTable
ALTER TABLE "RiskSignal" ADD COLUMN     "onChainTransactionId" TEXT,
ADD COLUMN     "walletAddressId" TEXT;

-- CreateTable
CREATE TABLE "WalletAddress" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerProfileId" TEXT,
    "businessProfileId" TEXT,
    "complianceCaseId" TEXT,
    "network" "BlockchainNetwork" NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "addressType" TEXT,
    "status" "WalletAddressStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WalletAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletScreeningRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "walletAddressId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRunId" TEXT,
    "status" "WalletScreeningStatus" NOT NULL DEFAULT 'PENDING',
    "riskScore" INTEGER,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'UNKNOWN',
    "categoriesJson" TEXT,
    "labelsJson" TEXT,
    "rawProviderRef" TEXT,
    "summary" TEXT,
    "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletScreeningRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnChainTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "walletAddressId" TEXT,
    "complianceCaseId" TEXT,
    "network" "BlockchainNetwork" NOT NULL,
    "txHash" TEXT NOT NULL,
    "direction" "OnChainTransactionDirection" NOT NULL,
    "assetSymbol" TEXT NOT NULL,
    "assetMintOrContract" TEXT,
    "amount" DECIMAL(19,8) NOT NULL,
    "usdValue" DECIMAL(19,4),
    "counterpartyAddress" TEXT,
    "counterpartyLabel" TEXT,
    "counterpartyRiskLevel" "RiskLevel",
    "counterpartyCategory" TEXT,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnChainTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletAddress_organizationId_idx" ON "WalletAddress"("organizationId");

-- CreateIndex
CREATE INDEX "WalletAddress_customerProfileId_idx" ON "WalletAddress"("customerProfileId");

-- CreateIndex
CREATE INDEX "WalletAddress_businessProfileId_idx" ON "WalletAddress"("businessProfileId");

-- CreateIndex
CREATE INDEX "WalletAddress_complianceCaseId_idx" ON "WalletAddress"("complianceCaseId");

-- CreateIndex
CREATE INDEX "WalletAddress_network_idx" ON "WalletAddress"("network");

-- CreateIndex
CREATE INDEX "WalletAddress_address_idx" ON "WalletAddress"("address");

-- CreateIndex
CREATE INDEX "WalletAddress_status_idx" ON "WalletAddress"("status");

-- CreateIndex
CREATE INDEX "WalletAddress_createdAt_idx" ON "WalletAddress"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAddress_organizationId_network_address_key" ON "WalletAddress"("organizationId", "network", "address");

-- CreateIndex
CREATE INDEX "WalletScreeningRun_organizationId_idx" ON "WalletScreeningRun"("organizationId");

-- CreateIndex
CREATE INDEX "WalletScreeningRun_walletAddressId_idx" ON "WalletScreeningRun"("walletAddressId");

-- CreateIndex
CREATE INDEX "WalletScreeningRun_status_idx" ON "WalletScreeningRun"("status");

-- CreateIndex
CREATE INDEX "WalletScreeningRun_provider_idx" ON "WalletScreeningRun"("provider");

-- CreateIndex
CREATE INDEX "WalletScreeningRun_screenedAt_idx" ON "WalletScreeningRun"("screenedAt");

-- CreateIndex
CREATE INDEX "WalletScreeningRun_createdAt_idx" ON "WalletScreeningRun"("createdAt");

-- CreateIndex
CREATE INDEX "OnChainTransaction_organizationId_idx" ON "OnChainTransaction"("organizationId");

-- CreateIndex
CREATE INDEX "OnChainTransaction_walletAddressId_idx" ON "OnChainTransaction"("walletAddressId");

-- CreateIndex
CREATE INDEX "OnChainTransaction_complianceCaseId_idx" ON "OnChainTransaction"("complianceCaseId");

-- CreateIndex
CREATE INDEX "OnChainTransaction_network_idx" ON "OnChainTransaction"("network");

-- CreateIndex
CREATE INDEX "OnChainTransaction_txHash_idx" ON "OnChainTransaction"("txHash");

-- CreateIndex
CREATE INDEX "OnChainTransaction_blockTime_idx" ON "OnChainTransaction"("blockTime");

-- CreateIndex
CREATE INDEX "OnChainTransaction_counterpartyAddress_idx" ON "OnChainTransaction"("counterpartyAddress");

-- CreateIndex
CREATE INDEX "OnChainTransaction_createdAt_idx" ON "OnChainTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OnChainTransaction_organizationId_network_txHash_walletAddr_key" ON "OnChainTransaction"("organizationId", "network", "txHash", "walletAddressId");

-- CreateIndex
CREATE INDEX "RiskSignal_walletAddressId_idx" ON "RiskSignal"("walletAddressId");

-- CreateIndex
CREATE INDEX "RiskSignal_onChainTransactionId_idx" ON "RiskSignal"("onChainTransactionId");

-- AddForeignKey
ALTER TABLE "RiskSignal" ADD CONSTRAINT "RiskSignal_walletAddressId_fkey" FOREIGN KEY ("walletAddressId") REFERENCES "WalletAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSignal" ADD CONSTRAINT "RiskSignal_onChainTransactionId_fkey" FOREIGN KEY ("onChainTransactionId") REFERENCES "OnChainTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_complianceCaseId_fkey" FOREIGN KEY ("complianceCaseId") REFERENCES "ComplianceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletScreeningRun" ADD CONSTRAINT "WalletScreeningRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletScreeningRun" ADD CONSTRAINT "WalletScreeningRun_walletAddressId_fkey" FOREIGN KEY ("walletAddressId") REFERENCES "WalletAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnChainTransaction" ADD CONSTRAINT "OnChainTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnChainTransaction" ADD CONSTRAINT "OnChainTransaction_walletAddressId_fkey" FOREIGN KEY ("walletAddressId") REFERENCES "WalletAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnChainTransaction" ADD CONSTRAINT "OnChainTransaction_complianceCaseId_fkey" FOREIGN KEY ("complianceCaseId") REFERENCES "ComplianceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
