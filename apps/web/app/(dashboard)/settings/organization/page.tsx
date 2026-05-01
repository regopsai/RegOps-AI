import { requirePermission } from "@/lib/auth/server";

export default async function OrganizationSettingsPage() {
  const context = await requirePermission("organization:read");

  const canUpdate = context.membership.role === "OWNER" || context.membership.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization</h1>
        <p className="mt-1 text-sm text-slate-600">
          Details about your active organization.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <dl className="space-y-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Name
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {context.organization.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Slug
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {context.organization.slug}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Status
            </dt>
            <dd className="mt-1 text-sm text-slate-900">ACTIVE</dd>
          </div>
        </dl>

        {!canUpdate && (
          <p className="mt-4 text-xs text-slate-500">
            You do not have permission to edit organization settings.
          </p>
        )}
      </div>
    </div>
  );
}
