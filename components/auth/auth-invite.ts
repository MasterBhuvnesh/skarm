/**
 * Organization invitation detection for the auth pages.
 *
 * Clerk appends its own params to the link inside the invitation email:
 * `__clerk_ticket` (the opaque ticket) and `__clerk_status` (whether the
 * invited address already has an account, so Clerk knows whether to run the
 * sign-in or the sign-up flow). Older links use `__clerk_invitation_token`.
 *
 * We only read these to decide whether to show invite context copy. The
 * prebuilt <SignIn /> / <SignUp /> components consume the ticket themselves,
 * so nothing here participates in the auth flow and nothing here can change
 * whether an invitation is accepted.
 *
 * The ticket is opaque and Clerk exposes no pre-auth lookup that maps it to
 * an organization, so we deliberately do not attempt to name the workspace
 * here. See issue #33.
 */

/** Params Clerk appends to an invitation link. */
export const INVITE_PARAMS = [
  "__clerk_ticket",
  "__clerk_invitation_token",
  "__clerk_status",
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * True when the URL carries an organization invitation. A ticket is the
 * strong signal; `__clerk_status` alone is accepted too, since Clerk sends
 * it alongside the ticket and older links may only carry it.
 */
export function hasInvitation(searchParams: SearchParams): boolean {
  return INVITE_PARAMS.some((param) => {
    const value = firstValue(searchParams[param]);
    return typeof value === "string" && value.length > 0;
  });
}
