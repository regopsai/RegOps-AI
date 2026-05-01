import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@regops-ai/database";

export default async function MembersSettingsPage() {
  const context = await requirePermission("members:read");

  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: context.organization.id,
    },
    include: {
      user: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-slate-600">
          People with access to {context.organization.name}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Joined
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {members.map((m: { id: string; user: { name: string | null; email: string }; role: string; status: string; joinedAt: Date | null; invitedAt: Date | null }) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-900">
                  {m.user.name || "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                  {m.user.email}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                  {m.role}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                  {m.status}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                  {m.joinedAt
                    ? new Date(m.joinedAt).toLocaleDateString()
                    : m.invitedAt
                    ? new Date(m.invitedAt).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
