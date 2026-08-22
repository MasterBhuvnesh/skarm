import { ConvexError } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";

/**
 * Free-tier caps on issues and projects, enforced in Convex because every
 * create path runs through a mutation. Seats are the exception - see the
 * note at the bottom of this file.
 *
 * Limit breaches throw `ConvexError` (not a plain Error): Convex treats it
 * as an expected application error, so the client catch shows a toast and
 * the upgrade prompt without the noisy "Server Error" dev overlay.
 */
export const FREE_PLAN_LIMITS = {
  seats: 3,
  projects: 2,
  issues: 100,
} as const;

export function isPaidPlan(org: Doc<"organizations">): boolean {
  return org.plan === "pro" || org.plan === "enterprise";
}

export async function assertCanCreateIssue(
  ctx: MutationCtx,
  org: Doc<"organizations">
): Promise<void> {
  if (isPaidPlan(org)) {
    return;
  }
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_org", (q) => q.eq("orgId", org._id))
    .collect();
  if (issues.length >= FREE_PLAN_LIMITS.issues) {
    throw new ConvexError(
      `Free plan is limited to ${FREE_PLAN_LIMITS.issues} issues. Upgrade to Pro for unlimited issues.`
    );
  }
}

export async function assertCanCreateProject(
  ctx: MutationCtx,
  org: Doc<"organizations">
): Promise<void> {
  if (isPaidPlan(org)) {
    return;
  }
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_org", (q) => q.eq("orgId", org._id))
    .collect();
  if (projects.length >= FREE_PLAN_LIMITS.projects) {
    throw new ConvexError(
      `Free plan is limited to ${FREE_PLAN_LIMITS.projects} projects. Upgrade to Pro for unlimited projects.`
    );
  }
}

/**
 * Seats are NOT enforced here, and a guard in this file could not enforce
 * them. Invitations go straight from the browser to Clerk via
 * `organization.inviteMember()`, so no Convex mutation is in the path.
 *
 * The cap lives on the Clerk plan itself ("Limit organization members"),
 * which is what makes it correct for every organization on that plan
 * without anything syncing it. `FREE_PLAN_LIMITS.seats` above is the
 * display mirror of the Free plan's limit, not the enforcement.
 *
 * Keep the two in step: changing a plan's member limit in the Clerk
 * Dashboard means changing `lib/plans.ts` and this file to match.
 */

export function hasAiAccess(org: Doc<"organizations">): boolean {
  return isPaidPlan(org);
}
