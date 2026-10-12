"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { Skeleton } from "@/components/ui/skeleton";
import { authAppearance } from "@/components/auth/auth-appearance";

/**
 * Thin client wrapper around Clerk's prebuilt <SignIn /> / <SignUp />.
 *
 * Client-side on purpose: it keeps the appearance object out of the RSC
 * boundary entirely, and it is where the mount `fallback` skeleton lives so
 * the form column does not collapse before Clerk hydrates.
 *
 * We deliberately pass NO redirect props. `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and
 * friends (plus `NEXT_PUBLIC_CLERK_*_FALLBACK_REDIRECT_URL=/onboarding` in
 * .env.example) still drive routing, exactly as before. We also pass no
 * `withInvitationToken`: Clerk v7 dropped that prop and the prebuilt
 * components consume `__clerk_ticket` themselves, so invitation acceptance
 * keeps working without help from us.
 */
function AuthFormFallback() {
  return (
    <div className="w-full" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-3 h-4 w-64" />
      <Skeleton className="mt-8 h-11 w-full" />
      <Skeleton className="mt-3 h-11 w-full" />
      <Skeleton className="mt-6 h-11 w-full" />
    </div>
  );
}

export function ClerkAuth({ mode }: { mode: "sign-in" | "sign-up" }) {
  const appearance = authAppearance;
  const fallback = <AuthFormFallback />;

  return mode === "sign-in" ? (
    <SignIn appearance={appearance} fallback={fallback} />
  ) : (
    <SignUp appearance={appearance} fallback={fallback} />
  );
}
