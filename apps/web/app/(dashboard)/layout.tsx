import { requireOrganizationContext } from "@/lib/auth/server";
import { signOut } from "@/auth";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireOrganizationContext();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold text-slate-900">
              RegOps AI
            </Link>
            <nav className="hidden items-center gap-4 text-sm font-medium text-slate-600 md:flex">
              <Link href="/dashboard" className="hover:text-slate-900">
                Dashboard
              </Link>
              <Link href="/cases" className="hover:text-slate-900">
                Cases
              </Link>
              <Link href="/customers" className="hover:text-slate-900">
                Customers
              </Link>
              <Link href="/businesses" className="hover:text-slate-900">
                Businesses
              </Link>
              <Link
                href="/settings/organization"
                className="hover:text-slate-900"
              >
                Organization
              </Link>
              <Link href="/settings/members" className="hover:text-slate-900">
                Members
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {context.organization.name}
              </span>
              <span className="text-slate-500">{context.user.email}</span>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
