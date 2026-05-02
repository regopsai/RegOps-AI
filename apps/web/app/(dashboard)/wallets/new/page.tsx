import { createWallet } from "@/lib/onchain/server";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@regops-ai/database";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function NewWalletPage() {
  const context = await requirePermission("onchain:write");

  const customers = await prisma.customerProfile.findMany({
    where: { organizationId: context.organization.id, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { createdAt: "desc" },
  });

  const businesses = await prisma.businessProfile.findMany({
    where: { organizationId: context.organization.id, deletedAt: null },
    select: { id: true, legalName: true },
    orderBy: { createdAt: "desc" },
  });

  const cases = await prisma.complianceCase.findMany({
    where: { organizationId: context.organization.id, deletedAt: null },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Add Wallet</h1>
        <Link href="/wallets" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Back to wallets
        </Link>
      </div>

      <form
        action={async (formData: FormData) => {
          "use server";
          await createWallet(formData);
          redirect("/wallets");
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700">Network</label>
          <select name="network" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select network...</option>
            <option value="SOLANA">Solana</option>
            <option value="ETHEREUM">Ethereum</option>
            <option value="BASE">Base</option>
            <option value="TRON">Tron</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Address</label>
          <input
            name="address"
            required
            placeholder="Wallet address"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Label (optional)</label>
          <input
            name="label"
            placeholder="e.g. Primary SOL wallet"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Link to Customer (optional)</label>
          <select name="customerProfileId" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">—</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Link to Business (optional)</label>
          <select name="businessProfileId" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">—</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.legalName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Link to Case (optional)</label>
          <select name="complianceCaseId" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">—</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-500">At least one link is required.</p>

        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add Wallet
        </button>
      </form>
    </div>
  );
}
