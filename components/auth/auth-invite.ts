/**
 * Organization invitation detection for the auth pages.
 *
 * Clerk appends `__clerk_ticket` (the opaque ticket) to the link inside the
 * invitation email. Older links use `__clerk_invitation_token`.
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

/**
 * Params that only ever appear on an organization invitation link.
 *
 * Deliberately excludes `__clerk_status`: Clerk uses that one for every ticket
 * flow, including password reset and the `needs-sync` handshake redirect, so
 * accepting it would show the invite banner on links that invite nothing.
 */
export const INVITE_PARAMS = [
  "__clerk_ticket",
  "__clerk_invitation_token",
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** True when the URL carries an organization invitation ticket. */
export function hasInvitation(searchParams: SearchParams): boolean {
  return INVITE_PARAMS.some((param) => {
    const value = firstValue(searchParams[param]);
    return typeof value === "string" && value.length > 0;
  });
}
