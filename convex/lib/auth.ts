import { Doc } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

/** Custom claims we add via the Clerk "convex" JWT template. */
type OrgClaims = {
  org_id?: string;
  org_slug?: string;
  org_role?: string;
};

export type AuthContext = {
  user: Doc<"users">;
  org: Doc<"organizations">;
  membership: Doc<"members">;
};

/**
 * Resolve the signed-in user from the Clerk JWT. Returns null while the
 * Clerk → Convex webhook sync hasn't landed yet (caller decides how to wait).
 */
export async function getCurrentUserOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) {
    throw new Error("User not synced yet");
  }
  return user;
}

/**
 * Resolve the full auth context: user + active organization + membership.
 * The active org comes from the `org_id` claim in the Clerk JWT and is
 * verified against the synced members table - never trust the client.
 */
export async function getAuthContext(
  ctx: QueryCtx | MutationCtx
): Promise<AuthContext> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) {
    throw new Error("User not synced yet");
  }

  const claims = identity as unknown as OrgClaims;
  if (!claims.org_id) {
    throw new Error("No active organization");
  }

  const org = await ctx.db
    .query("organizations")
    .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", claims.org_id!))
    .unique();
  if (!org) {
    throw new Error("Organization not synced yet");
  }

  const membership = await ctx.db
    .query("members")
    .withIndex("by_org_and_user", (q) =>
      q.eq("orgId", org._id).eq("userId", user._id)
    )
    .unique();
  if (!membership) {
    throw new Error("Not a member of this organization");
  }

  return { user, org, membership };
}
