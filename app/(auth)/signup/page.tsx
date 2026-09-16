import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <Link
          href="/"
          className="mb-10 text-center text-[15px] font-semibold tracking-tight text-ink-950"
        >
          SUBBY STORE
        </Link>
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-center text-xl font-semibold tracking-tight text-ink-950">
            Create account
          </h1>
          <p className="mt-1.5 text-center text-sm text-ink-500">
            Start selling with your own store
          </p>
          <div className="mt-6">
            <AuthForm mode="signup" />
          </div>
        </div>
      </div>
    </div>
  );
}
