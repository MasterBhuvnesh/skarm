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
 *
 * This only works while no plan carries a per-seat price. Clerk derives the
 * cap from seats purchased on a seat-billed plan and rejects writes to it
 * with `organization_member_limit_managed_by_billing`. Every plan here is
 * flat rate, so the cap is ours to set. Reintroducing per-seat pricing would
 * take that back - see .docs/CONFIGURE.md.
 */

/** Clerk's `max_allowed_memberships` for a plan. 0 means unlimited. */
export function seatCapForPlan(plan: Doc<"organizations">["plan"]): number {
  switch (plan) {
    case "free":
      return 3;
    case "pro":
      return 10;
    case "enterprise":
      return 0; // unlimited
  }
}

export const syncSeatCap = internalAction({
  args: { clerkOrgId: v.string(), plan: planValidator },
  returns: v.null(),
  handler: async (_ctx, args): Promise<null> => {
    const cap = seatCapForPlan(args.plan);

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
      const body = await response.text();
      // Logged rather than thrown, for the same reason as above. The next
      // plan event re-applies the cap.
      if (body.includes("organization_member_limit_managed_by_billing")) {
        // The plan still carries a per-seat price, so Clerk derives the cap
        // from seats purchased and refuses this write. Remove the per-seat
        // price from the plan in the Clerk Dashboard - see CONFIGURE.md.
        console.error(
          `Seat cap for ${args.clerkOrgId} is managed by Clerk billing. ` +
            `Remove the per-seat price from the ${args.plan} plan so its ` +
            `member limit can be set to ${cap}.`
        );
      } else {
        console.error(
          `Seat cap sync failed for ${args.clerkOrgId} (${response.status}): ${body}`
        );
      }
    }
    return null;
  },
});
