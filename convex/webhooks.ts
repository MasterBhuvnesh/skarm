import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";

/**
 * Clerk → Convex sync. Clerk is the source of truth for users, orgs,
 * memberships, and subscriptions; these handlers mirror them into Convex
 * tables so queries can join against them with indexes.
 *
 * Clerk billing uses dot-notation event names (subscription.updated,
 * subscriptionItem.canceled) - never Stripe-style names.
 */

type ClerkUserData = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: { id: string; email_address: string }[];
};

type ClerkOrgData = {
  id: string;
  name?: string;
  slug?: string | null;
  image_url?: string | null;
};

type ClerkMembershipData = {
  id: string;
  role?: string;
  organization?: { id: string };
  public_user_data?: { user_id: string };
};

type ClerkSubscriptionData = {
  id: string;
  status?: string;
  payer?: { organization_id?: string; user_id?: string };
  items?: { status?: string; plan?: { slug?: string } }[];
};

type ClerkSubscriptionItemData = {
  id: string;
  status?: string;
  payer?: { organization_id?: string; user_id?: string };
  plan?: { slug?: string };
};

export const handleClerkEvent = internalMutation({
  args: {
    eventType: v.string(),
    data: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { eventType } = args;

    if (eventType === "user.created" || eventType === "user.updated") {
      await upsertUser(ctx, args.data as ClerkUserData);
    } else if (eventType === "user.deleted") {
      await deleteUser(ctx, args.data as ClerkUserData);
    } else if (
      eventType === "organization.created" ||
      eventType === "organization.updated"
    ) {
      await upsertOrganization(ctx, args.data as ClerkOrgData);
    } else if (eventType === "organization.deleted") {
      await deleteOrganization(ctx, args.data as ClerkOrgData);
    } else if (
      eventType === "organizationMembership.created" ||
      eventType === "organizationMembership.updated"
    ) {
      await upsertMembership(ctx, args.data as ClerkMembershipData);
    } else if (eventType === "organizationMembership.deleted") {
      await deleteMembership(ctx, args.data as ClerkMembershipData);
    } else if (eventType.startsWith("subscription.")) {
      await syncSubscription(ctx, args.data as ClerkSubscriptionData);
    } else if (eventType.startsWith("subscriptionItem.")) {
      await syncSubscriptionItem(
        ctx,
        eventType,
        args.data as ClerkSubscriptionItemData
      );
    } else {
      console.log("Unhandled Clerk webhook event", eventType);
    }
    return null;
  },
});

async function upsertUser(ctx: MutationCtx, data: ClerkUserData) {
  const primaryEmail =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id)
      ?.email_address ??
    data.email_addresses?.[0]?.email_address ??
    "";
  const name =
    [data.first_name, data.last_name].filter(Boolean).join(" ") ||
    primaryEmail ||
    "Unknown";

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.id))
    .unique();

  const fields = {
    name,
    email: primaryEmail,
    imageUrl: data.image_url ?? undefined,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
  } else {
    await ctx.db.insert("users", { clerkId: data.id, ...fields });
  }
}

async function deleteUser(ctx: MutationCtx, data: ClerkUserData) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.id))
    .unique();
  if (!user) {
    return;
  }
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  for (const membership of memberships) {
    await ctx.db.delete(membership._id);
  }
  await ctx.db.delete(user._id);
}

async function upsertOrganization(ctx: MutationCtx, data: ClerkOrgData) {
  const existing = await ctx.db
    .query("organizations")
    .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", data.id))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: data.name ?? existing.name,
      slug: data.slug ?? existing.slug,
      imageUrl: data.image_url ?? existing.imageUrl,
    });
  } else {
    await ctx.db.insert("organizations", {
      clerkOrgId: data.id,
      name: data.name ?? "Untitled",
      slug: data.slug ?? undefined,
      imageUrl: data.image_url ?? undefined,
      plan: "free",
    });
  }
}

async function deleteOrganization(ctx: MutationCtx, data: ClerkOrgData) {
  const org = await ctx.db
    .query("organizations")
    .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", data.id))
    .unique();
  if (!org) {
    return;
  }
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_org", (q) => q.eq("orgId", org._id))
    .collect();
  for (const membership of memberships) {
    await ctx.db.delete(membership._id);
  }
  // Workspace data (teams/issues/...) is intentionally left for a future
  // cleanup job - orgs are rarely deleted and cascading here would make
  // webhook handling slow.
  await ctx.db.delete(org._id);
}

async function upsertMembership(ctx: MutationCtx, data: ClerkMembershipData) {
  const clerkOrgId = data.organization?.id;
  const clerkUserId = data.public_user_data?.user_id;
  if (!clerkOrgId || !clerkUserId) {
    console.error("Membership event missing org or user id", data.id);
    return;
  }

  const org = await ctx.db
    .query("organizations")
    .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", clerkOrgId))
    .unique();
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
    .unique();
  if (!org || !user) {
    // Clerk fires organization.created and organizationMembership.created
    // near-simultaneously and Svix does not guarantee ordering. Throwing makes
    // the webhook return non-2xx so Svix retries; returning success here would
    // ACK the event and lose the membership forever.
    throw new Error(
      `Membership sync: org or user not synced yet (${clerkOrgId}, ${clerkUserId}) - failing so Svix retries`
    );
  }

  const role = data.role === "org:admin" ? ("admin" as const) : ("member" as const);

  const existing = await ctx.db
    .query("members")
    .withIndex("by_clerk_membership_id", (q) =>
      q.eq("clerkMembershipId", data.id)
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { role });
  } else {
    await ctx.db.insert("members", {
      orgId: org._id,
      userId: user._id,
      role,
      clerkMembershipId: data.id,
    });
  }
}

async function deleteMembership(ctx: MutationCtx, data: ClerkMembershipData) {
  const existing = await ctx.db
    .query("members")
    .withIndex("by_clerk_membership_id", (q) =>
      q.eq("clerkMembershipId", data.id)
    )
    .unique();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

function planFromSlug(slug: string | undefined): Doc<"organizations">["plan"] | null {
  if (slug === "pro" || slug === "enterprise") {
    return slug;
  }
  if (slug === "free_org") {
    return "free";
  }
  return null;
}

async function getOrgByClerkId(ctx: MutationCtx, clerkOrgId: string) {
  return await ctx.db
    .query("organizations")
    .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", clerkOrgId))
    .unique();
}

async function syncSubscription(
  ctx: MutationCtx,
  data: ClerkSubscriptionData
) {
  const clerkOrgId = data.payer?.organization_id;
  if (!clerkOrgId) {
    return;
  }
  const org = await getOrgByClerkId(ctx, clerkOrgId);
  if (!org) {
    // Same out-of-order delivery race as memberships: fail so Svix retries.
    throw new Error(
      `Subscription sync: org not synced yet (${clerkOrgId}) - failing so Svix retries`
    );
  }

  // Highest active paid plan wins; fall back to free.
  let plan: Doc<"organizations">["plan"] = "free";
  for (const item of data.items ?? []) {
    const itemPlan = planFromSlug(item.plan?.slug);
    if (
      itemPlan &&
      itemPlan !== "free" &&
      (item.status === "active" || item.status === "upcoming")
    ) {
      plan = itemPlan === "enterprise" ? "enterprise" : plan === "enterprise" ? plan : itemPlan;
    }
  }

  await ctx.db.patch(org._id, {
    plan,
    subscriptionStatus: data.status,
  });
}

async function syncSubscriptionItem(
  ctx: MutationCtx,
  eventType: string,
  data: ClerkSubscriptionItemData
) {
  const clerkOrgId = data.payer?.organization_id;
  if (!clerkOrgId) {
    return;
  }
  const org = await getOrgByClerkId(ctx, clerkOrgId);
  if (!org) {
    // Same out-of-order delivery race as memberships: fail so Svix retries.
    throw new Error(
      `Subscription item sync: org not synced yet (${clerkOrgId}) - failing so Svix retries`
    );
  }

  const itemPlan = planFromSlug(data.plan?.slug);
  if (!itemPlan || itemPlan === "free") {
    return;
  }

  const activated =
    eventType === "subscriptionItem.active" ||
    (eventType === "subscriptionItem.updated" && data.status === "active");
  const deactivated =
    eventType === "subscriptionItem.canceled" ||
    eventType === "subscriptionItem.ended" ||
    eventType === "subscriptionItem.expired" ||
    eventType === "subscriptionItem.abandoned";

  if (activated) {
    await ctx.db.patch(org._id, { plan: itemPlan, subscriptionStatus: "active" });
  } else if (deactivated && org.plan === itemPlan) {
    await ctx.db.patch(org._id, { plan: "free" });
  }
}
