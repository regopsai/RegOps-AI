import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          RegOps AI
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Compliance-native AI back office for regulated fintech operations.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          KYB/KYC review, AML casework, policy checks, risk memos, and audit
          trails — with human oversight at every critical decision.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex items-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
