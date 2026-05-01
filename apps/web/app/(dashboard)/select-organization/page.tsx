import {
  requireCurrentUser,
  getUserMemberships,
  setActiveOrganizationId,
} from "@/lib/auth/server";
import { createAuditEvent } from "@regops-ai/database";
import { redirect } from "next/navigation";

export default async function SelectOrganizationPage() {
  const user = await requireCurrentUser();
  const memberships = await getUserMemberships(user.id);

  if (memberships.length === 0) {
    redirect("/no-organization");
  }

  async function selectOrganization(formData: FormData) {
    "use server";

    const organizationId = formData.get("organizationId") as string;
    if (!organizationId) return;

    await setActiveOrganizationId(organizationId);

    try {
      await createAuditEvent({
        organizationId,
        actorUserId: user.id,
        action: "ORGANIZATION_SWITCHED",
        entityType: "Organization",
        entityId: organizationId,
      });
    } catch {
      // Audit failure should not block switch
    }

    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold tracking-tight">
        Select Organization
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Choose which organization to work in.
      </p>

      <div className="mt-6 space-y-3">
        {memberships.map((m: { id: string; organizationId: string; organization: { name: string; slug: string }; role: string }) => (
          <form key={m.id} action={selectOrganization}>
            <input type="hidden" name="organizationId" value={m.organizationId} />
            <button
              type="submit"
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-slate-400"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {m.organization.name}
                </p>
                <p className="text-xs text-slate-500">{m.organization.slug}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {m.role}
              </span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
