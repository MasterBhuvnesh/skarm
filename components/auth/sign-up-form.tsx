"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SkarmLogo } from "@/components/shared/skarm-logo";

function getClerkErrorMessage(err: unknown, fallback: string): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors?: unknown }).errors) &&
    (err as { errors: Array<{ longMessage?: unknown }> }).errors[0]?.longMessage
  ) {
    const msg = (err as { errors: Array<{ longMessage?: unknown }> }).errors[0]
      .longMessage;
    if (typeof msg === "string") return msg;
  }
  return fallback;
}

export function SignUpForm() {
  const clerk = useClerk();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clerk.loaded) return;

    setIsLoading(true);
    setError("");

    try {
      await clerk.client.signUp.create({
        emailAddress,
        password,
      });

      await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "An error occurred during sign up."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clerk.loaded) return;

    setIsLoading(true);
    setError("");

    try {
      const result = await clerk.client.signUp.attemptEmailAddressVerification({ code });

      if (result.status === "complete") {
        await clerk.setActive({ session: result.createdSessionId });
        router.push("/onboarding");
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Invalid verification code."));
    } finally {
      setIsLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <div className="w-full max-w-[440px] rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-white/10 dark:bg-white/[0.02] lg:p-10">
        <div className="mb-6 flex items-center gap-2.5">
          <SkarmLogo size={28} tile id="sign-up-verify-logo" />
          <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">Skarm</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white">
          Verify your email
        </h1>
        <p className="mt-1.5 break-all text-sm text-zinc-500 dark:text-white/50">
          We sent a code to {emailAddress}
        </p>

        <form onSubmit={handleVerify} className="mt-6 space-y-4 sm:mt-7">
          <div className="space-y-2">
            <label htmlFor="code" className="text-[13.5px] font-medium text-zinc-700 dark:text-white/85">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code"
              required
              className="h-11 w-full rounded-[10px] border border-zinc-200 bg-zinc-50 px-4 text-sm tracking-[0.2em] text-zinc-900 placeholder:text-zinc-400 placeholder:tracking-normal outline-none transition-colors focus:border-zinc-400 focus:bg-white sm:h-12 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/25 dark:focus:bg-white/[0.07]"
            />
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-zinc-900 text-[14px] font-semibold text-white transition-all hover:bg-zinc-800 active:translate-y-px disabled:pointer-events-none disabled:opacity-60 sm:h-12 sm:text-[14.5px] dark:bg-[#f4f4f5] dark:text-[#09090b] dark:hover:bg-white"
          >
            {isLoading ? "Verifying..." : "Verify & Continue"}
            {!isLoading && <ArrowRight className="size-4" />}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Mobile brand row — panel is lg+ only */}
      <div className="mb-7 flex items-center justify-center gap-3 lg:hidden">
        <SkarmLogo size={44} tile id="sign-up-mobile-logo" />
        <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
          Skarm
        </span>
      </div>

      <div className="w-full max-w-[440px] rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_16px_48px_-24px_rgb(0_0_0/0.25)] sm:p-8 dark:border-white/10 dark:bg-white/[0.02] dark:shadow-[0_24px_80px_-24px_rgb(0_0_0/0.8)] lg:p-10">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-900 sm:text-[26px] dark:text-white">
          Get started for free
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-white/50">
          Create your workspace · No credit card required
        </p>

        <div className="mt-6 sm:mt-7">
          <OAuthButtons mode="signUp" />
        </div>

        <div className="my-5 flex items-center gap-4 sm:my-6">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
          <span className="text-[13px] text-zinc-400 dark:text-white/40">or</span>
          <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        </div>

        <form onSubmit={handleSignUp} className="space-y-4 sm:space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="text-[13.5px] font-medium text-zinc-700 dark:text-white/85">
              Email address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-white/35" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="you@company.com"
                required
                className="h-11 w-full rounded-[10px] border border-zinc-200 bg-zinc-50 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:bg-white sm:h-12 sm:text-[14px] dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/25 dark:focus:bg-white/[0.07]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-[13.5px] font-medium text-zinc-700 dark:text-white/85">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-white/35" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                required
                className={`h-11 w-full rounded-[10px] border border-zinc-200 bg-zinc-50 pl-10 pr-11 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 placeholder:tracking-normal focus:border-zinc-400 focus:bg-white sm:h-12 sm:text-[14px] dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/25 dark:focus:bg-white/[0.07] ${showPassword ? "" : "tracking-[0.35em]"}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 transition-colors hover:text-zinc-700 dark:text-white/40 dark:hover:text-white/75"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-[13px] leading-relaxed text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !clerk.loaded}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-zinc-900 text-[14px] font-semibold text-white transition-all hover:bg-zinc-800 active:translate-y-px disabled:pointer-events-none disabled:opacity-60 sm:h-12 sm:text-[14.5px] dark:bg-[#f4f4f5] dark:text-[#09090b] dark:hover:bg-white"
          >
            {isLoading ? "Creating account..." : "Create account"}
            {!isLoading && <ArrowRight className="size-4" />}
          </button>
        </form>

        <p className="mt-5 text-center text-[12.5px] leading-relaxed text-zinc-400 sm:mt-6 dark:text-white/40">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-zinc-600 dark:hover:text-white/70">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-zinc-600 dark:hover:text-white/70">
            Privacy Policy.
          </Link>
        </p>

        <p className="mt-4 border-t border-zinc-200 pt-5 text-center text-[13.5px] text-zinc-500 sm:mt-5 sm:pt-6 dark:border-white/10 dark:text-white/50">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-semibold text-zinc-900 hover:underline underline-offset-4 dark:text-white">
            Sign in
          </Link>
        </p>
      </div>

      <p className="mt-5 text-center text-[12.5px] text-zinc-400 lg:hidden dark:text-white/35">
        Free for teams of 3 · No credit card required
      </p>
    </div>
  );
}
