import {
  requireOrganizationContext,
  getUserMemberships,
} from "@/lib/auth/server";
import Link from "next/link";

export default async function DashboardPage() {
  const context = await requireOrganizationContext();
  const memberships = await getUserMemberships(context.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Welcome back, {context.user.name || context.user.email}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Active Organization
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {context.organization.name}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Your Role
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {context.membership.role}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Organizations
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {memberships.length}
          </p>
        </div>
      </div>

      {memberships.length > 1 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Your Memberships
          </h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {memberships.map((m: { id: string; organization: { name: string }; role: string }) => (
              <li
                key={m.id}
                className="flex items-center justify-between py-2"
              >
                <span className="text-sm text-slate-700">
                  {m.organization.name}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Link
              href="/select-organization"
              className="text-sm font-medium text-slate-900 hover:underline"
            >
              Switch organization →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
