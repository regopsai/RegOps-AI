import { importWalletScreeningCsv } from "@/lib/onchain/server";
import { requirePermission } from "@/lib/auth/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ScreeningImportPage() {
  await requirePermission("onchain:import");

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Import Wallet Screening</h1>
        <Link href="/wallets" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Back to wallets
        </Link>
      </div>

      <p className="text-sm text-slate-600">
        Paste CSV rows below. Required columns: <code className="rounded bg-slate-100 px-1">network</code>,{" "}
        <code className="rounded bg-slate-100 px-1">address</code>,{" "}
        <code className="rounded bg-slate-100 px-1">provider</code>,{" "}
        <code className="rounded bg-slate-100 px-1">riskScore</code>,{" "}
        <code className="rounded bg-slate-100 px-1">riskLevel</code>,{" "}
        <code className="rounded bg-slate-100 px-1">categories</code>,{" "}
        <code className="rounded bg-slate-100 px-1">labels</code>,{" "}
        <code className="rounded bg-slate-100 px-1">summary</code>,{" "}
        <code className="rounded bg-slate-100 px-1">providerRunId</code>.
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
              address: row.address,
              provider: row.provider,
              riskScore: row.riskScore ? Number(row.riskScore) : undefined,
              riskLevel: row.riskLevel,
              categories: row.categories,
              labels: row.labels,
              summary: row.summary,
              providerRunId: row.providerRunId,
            });
          }
          const result = await importWalletScreeningCsv(rows as any);
          redirect(`/wallets?imported=${result.imported}&failed=${result.failed}`);
        }}
        className="space-y-4"
      >
        <textarea
          name="csv"
          required
          rows={12}
          placeholder={`network,address,provider,riskScore,riskLevel,categories,labels,summary,providerRunId\nSOLANA,ABC123...,manual,85,HIGH,mixer,long_address,High risk mixer indicator,run-001`}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Import Screening Results
        </button>
      </form>
    </div>
  );
}
