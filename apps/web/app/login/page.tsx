import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user?.id) {
    redirect(params.callbackUrl || "/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight text-center">
          Sign in to RegOps AI
        </h1>
        <p className="mt-2 text-sm text-slate-500 text-center">
          Compliance-native AI back office
        </p>
        <LoginForm
          callbackUrl={params.callbackUrl}
          initialError={params.error}
        />
      </div>
    </main>
  );
}
