import { importOnChainTransactionsCsv } from "@/lib/onchain/server";
import { requirePermission } from "@/lib/auth/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function TransactionsImportPage() {
  await requirePermission("onchain:import");

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Import On-Chain Transactions</h1>
        <Link href="/wallets" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Back to wallets
        </Link>
      </div>

      <p className="text-sm text-slate-600">
        Paste CSV rows below. Required columns: <code className="rounded bg-slate-100 px-1">network</code>,{" "}
        <code className="rounded bg-slate-100 px-1">walletAddress</code>,{" "}
        <code className="rounded bg-slate-100 px-1">txHash</code>,{" "}
        <code className="rounded bg-slate-100 px-1">direction</code>,{" "}
        <code className="rounded bg-slate-100 px-1">assetSymbol</code>,{" "}
        <code className="rounded bg-slate-100 px-1">assetMintOrContract</code>,{" "}
        <code className="rounded bg-slate-100 px-1">amount</code>,{" "}
        <code className="rounded bg-slate-100 px-1">usdValue</code>,{" "}
        <code className="rounded bg-slate-100 px-1">counterpartyAddress</code>,{" "}
        <code className="rounded bg-slate-100 px-1">counterpartyLabel</code>,{" "}
        <code className="rounded bg-slate-100 px-1">counterpartyRiskLevel</code>,{" "}
        <code className="rounded bg-slate-100 px-1">counterpartyCategory</code>,{" "}
        <code className="rounded bg-slate-100 px-1">blockTime</code>,{" "}
        <code className="rounded bg-slate-100 px-1">complianceCaseId</code>.
        Wallets must already exist in the active organization.
      </p>

      <form
        action={async (formData: FormData) => {
          "use server";
          const raw = formData.get("csv") as string;
          const lines = raw.trim().split("\n");
          if (lines.length < 2) {
            throw new Error("CSV must have a header and at least one data row.");
          }
          const headers = lines[0].split(",").map((h) => h.trim());
          const rows = [];
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(",").map((v) => v.trim());
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => {
              row[h] = values[idx] ?? "";
            });
            rows.push({
              network: row.network,
              walletAddress: row.walletAddress,
              txHash: row.txHash,
              direction: row.direction,
              assetSymbol: row.assetSymbol,
              assetMintOrContract: row.assetMintOrContract,
              amount: Number(row.amount),
              usdValue: row.usdValue ? Number(row.usdValue) : undefined,
              counterpartyAddress: row.counterpartyAddress,
              counterpartyLabel: row.counterpartyLabel,
              counterpartyRiskLevel: row.counterpartyRiskLevel,
              counterpartyCategory: row.counterpartyCategory,
              blockTime: row.blockTime,
              complianceCaseId: row.complianceCaseId,
            });
          }
          const result = await importOnChainTransactionsCsv(rows as any);
          redirect(`/wallets?imported=${result.imported}&failed=${result.failed}`);
        }}
        className="space-y-4"
      >
        <textarea
          name="csv"
          required
          rows={12}
          placeholder={`network,walletAddress,txHash,direction,assetSymbol,assetMintOrContract,amount,usdValue,counterpartyAddress,counterpartyLabel,counterpartyRiskLevel,counterpartyCategory,blockTime,complianceCaseId\nSOLANA,ABC123...,tx1,INBOUND,USDC,EPjF...,15000.5,15000.5,XYZ...,Exchange Label,LOW,exchange,2024-01-15T10:00:00Z,`}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Import Transactions
        </button>
      </form>
    </div>
  );
}
