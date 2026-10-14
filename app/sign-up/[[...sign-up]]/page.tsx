import { AuthShell } from "@/components/auth/auth-shell";
import { ClerkAuth } from "@/components/auth/clerk-auth";
import { hasInvitation } from "@/components/auth/auth-invite";

/**
 * Branded sign-up. Clerk's prebuilt <SignUp /> is kept so OAuth, email
 * verification, MFA, error handling, and invitation acceptance are unchanged;
 * only the surrounding page and the appearance are ours. See issue #33.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const invited = hasInvitation(await searchParams);

  return (
    <AuthShell invited={invited}>
      <ClerkAuth mode="sign-up" />
    </AuthShell>
  );
}
