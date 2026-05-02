"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/server";
import {
  createWalletAddressService,
  archiveWalletAddressService,
  listWalletAddressesService,
  getWalletAddressService,
} from "./wallet-service";
import { runWalletScreeningService, importWalletScreeningCsvService } from "./screening-service";
import { importOnChainTransactionsCsvService } from "./onchain-transaction-import";
import { runOnChainRiskChecksForCaseService, runOnChainRiskChecksForWalletService } from "./onchain-risk-service";

function toContext(context: Awaited<ReturnType<typeof requirePermission>>) {
  return {
    userId: context.user.id,
    organizationId: context.organization.id,
    role: context.membership.role,
  };
}

export async function listWallets(filters?: {
  network?: string;
  status?: "ACTIVE" | "ARCHIVED";
  customerProfileId?: string;
  businessProfileId?: string;
  complianceCaseId?: string;
}) {
  const ctx = toContext(await requirePermission("onchain:read"));
  return listWalletAddressesService(ctx, filters);
}

export async function getWallet(walletAddressId: string) {
  const ctx = toContext(await requirePermission("onchain:read"));
  return getWalletAddressService(ctx, walletAddressId);
}

export async function createWallet(formData: FormData) {
  const ctx = toContext(await requirePermission("onchain:write"));
  const wallet = await createWalletAddressService(ctx, {
    network: formData.get("network") as string,
    address: formData.get("address") as string,
    label: (formData.get("label") as string) || undefined,
    customerProfileId: (formData.get("customerProfileId") as string) || undefined,
    businessProfileId: (formData.get("businessProfileId") as string) || undefined,
    complianceCaseId: (formData.get("complianceCaseId") as string) || undefined,
  });
  revalidatePath("/wallets");
  return wallet;
}

export async function archiveWallet(walletAddressId: string) {
  const ctx = toContext(await requirePermission("onchain:write"));
  await archiveWalletAddressService(ctx, walletAddressId);
  revalidatePath("/wallets");
  revalidatePath(`/wallets/${walletAddressId}`);
}

export async function runWalletScreening(walletAddressId: string) {
  const ctx = toContext(await requirePermission("onchain:screen"));
  const run = await runWalletScreeningService(ctx, walletAddressId);
  revalidatePath(`/wallets/${walletAddressId}`);
  return run;
}

export async function importWalletScreeningCsv(rows: Array<{
  network: string;
  address: string;
  provider: string;
  riskScore?: number;
  riskLevel: string;
  categories?: string;
  labels?: string;
  summary?: string;
  providerRunId?: string;
}>) {
  const ctx = toContext(await requirePermission("onchain:import"));
  const result = await importWalletScreeningCsvService(ctx, rows);
  revalidatePath("/wallets");
  return result;
}

export async function importOnChainTransactionsCsv(rows: Array<{
  network: string;
  walletAddress: string;
  txHash: string;
  direction: string;
  assetSymbol: string;
  assetMintOrContract?: string;
  amount: number;
  usdValue?: number | "";
  counterpartyAddress?: string;
  counterpartyLabel?: string;
  counterpartyRiskLevel?: string | "";
  counterpartyCategory?: string;
  blockTime: Date | string;
  complianceCaseId?: string;
}>) {
  const ctx = toContext(await requirePermission("onchain:import"));
  const result = await importOnChainTransactionsCsvService(ctx, rows);
  revalidatePath("/wallets");
  return result;
}

export async function runOnChainRiskChecksForCase(caseId: string) {
  const ctx = toContext(await requirePermission("onchain:screen"));
  const result = await runOnChainRiskChecksForCaseService(ctx, caseId);
  revalidatePath(`/cases/${caseId}`);
  return result;
}

export async function runOnChainRiskChecksForWallet(walletAddressId: string) {
  const ctx = toContext(await requirePermission("onchain:screen"));
  const result = await runOnChainRiskChecksForWalletService(ctx, walletAddressId);
  revalidatePath(`/wallets/${walletAddressId}`);
  return result;
}
