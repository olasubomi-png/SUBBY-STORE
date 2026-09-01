import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-center text-lg font-semibold text-ink-950">
        SUBBY STORE
      </Link>
      <h1 className="mb-6 text-center text-2xl font-semibold">Create account</h1>
      <AuthForm mode="signup" />
    </div>
  );
}
