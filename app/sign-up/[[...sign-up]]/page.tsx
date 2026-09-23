import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { AuthPanel } from "@/components/auth/auth-panel";

export const metadata: Metadata = {
  title: "Sign up — Skarm",
  description: "Create your Skarm workspace for free.",
};

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-[#0a0a0c] dark:text-white">
      <AuthPanel />
      <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-12">
        {/* faint glow behind the card */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[80px] sm:h-[480px] sm:w-[480px] dark:bg-indigo-500/10"
        />
        <div className="relative z-10 flex w-full max-w-[440px] justify-center">
          <SignUpForm />
        </div>
      </div>
    </main>
  );
}
