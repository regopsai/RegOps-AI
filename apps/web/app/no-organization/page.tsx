import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function NoOrganizationPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          No Organization Access
        </h1>
        <p className="mt-4 text-slate-600">
          You are signed in, but you do not have access to any active
          organizations. Contact your administrator to be invited to an
          organization.
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
