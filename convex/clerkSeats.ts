import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { planValidator } from "./schema";
import { Doc } from "./_generated/dataModel";

/**
 * Pushes each organization's seat cap into Clerk.
 *
 * Clerk - not Convex - is the only real enforcement point for seats.
 * Invitations are sent straight from the browser via
 * `organization.inviteMember()` (see components/billing/members-manager.tsx),
 * so no Convex mutation is ever in the path and no server guard here could
 * see them. Whatever Clerk holds in `max_allowed_memberships` is what
 * decides whether an invite succeeds.
 *
 * Left alone, every organization inherits the instance-wide default, which
 * is why Free workspaces could reach 10 members and Enterprise workspaces
 * could not exceed them.
 *
 * `max_allowed_memberships: 0` means unlimited.
 */

/**
 * Clerk's `max_allowed_memberships` for a plan, or null when Clerk billing
 * owns the number and refuses external writes.
 *
 * Pro is that case. Its per-seat price makes the cap a billing artifact:
 * Clerk sets it to the seat quantity actually purchased and rejects any
 * attempt to change it, with
 *
 *   400 organization_member_limit_managed_by_billing
 *   "This organization's member limit is managed by their subscription.
 *    It cannot be edited directly."
 *
 * So Pro's seat allowance cannot be fixed from here. It is a property of
 * the Pro plan in the Clerk Dashboard: the base price has to include the
 * seats the pricing page promises. See issue #29 and .docs/CONFIGURE.md.
 */
export function seatCapForPlan(
  plan: Doc<"organizations">["plan"]
): number | null {
  switch (plan) {
    case "free":
      return 3;
    case "pro":
      return null; // managed by Clerk billing, not writable
    case "enterprise":
      return 0; // unlimited
  }
}

export const syncSeatCap = internalAction({
  args: { clerkOrgId: v.string(), plan: planValidator },
  returns: v.null(),
  handler: async (_ctx, args): Promise<null> => {
    const cap = seatCapForPlan(args.plan);
    if (cap === null) {
      return null;
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      // Never throw: a missing key must not fail the webhook that scheduled
      // this, or Svix retries a plan sync that already succeeded.
      console.error(
        "CLERK_SECRET_KEY is not set - seat cap not synced for " +
          args.clerkOrgId
      );
      return null;
    }

    const response = await fetch(
      `https://api.clerk.com/v1/organizations/${args.clerkOrgId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ max_allowed_memberships: cap }),
      }
    );

    if (!response.ok) {
      // Logged rather than thrown, for the same reason as above. The next
      // plan event re-applies the cap.
      console.error(
        `Seat cap sync failed for ${args.clerkOrgId} (${response.status}): ` +
          (await response.text())
      );
    }
    return null;
  },
});
