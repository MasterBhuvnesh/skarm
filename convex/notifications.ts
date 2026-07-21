import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import { notificationTypeValidator } from "./schema";

/**
 * Insert an in-app notification. Skips self-notifications so actors never
 * hear about their own edits. Automated events pass `systemActor` instead
 * of `actorId` (e.g. the GitHub integration).
 */
export async function createNotification(
  ctx: MutationCtx,
  args: {
    orgId: Id<"organizations">;
    userId: Id<"users">;
    actorId?: Id<"users">;
    systemActor?: "github";
    issueId: Id<"issues">;
    type: Doc<"notifications">["type"];
    newValue?: string;
    commentId?: Id<"comments">;
  }
): Promise<void> {
  if (!args.actorId && !args.systemActor) {
    throw new Error("Notification needs an actor");
  }
  if (args.userId === args.actorId) {
    return;
  }
  // Respect the recipient's per-channel toggles. A missing doc means every
  // channel is enabled. Unmapped/future types fall through to insert.
  const prefs = await ctx.db
    .query("notificationPrefs")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", args.orgId).eq("userId", args.userId)
    )
    .unique();
  if (prefs) {
    const channel: PrefKey | undefined =
      args.systemActor === "github" ? "github" : CHANNEL_BY_TYPE[args.type];
    if (channel && !prefs[channel]) {
      return;
    }
  }
  await ctx.db.insert("notifications", { ...args, read: false });
}

/** Notification type → prefs channel. Unmapped types stay unmapped (allowed). */
const CHANNEL_BY_TYPE: Record<string, PrefKey> = {
  mention: "mention",
  assigned: "assigned",
  status_changed: "statusChanged",
};

type PrefKey = "mention" | "assigned" | "statusChanged" | "github";

const prefsValidator = v.object({
  mention: v.boolean(),
  assigned: v.boolean(),
  statusChanged: v.boolean(),
  github: v.boolean(),
});

export const getPrefs = orgQuery({
  args: {},
  returns: prefsValidator,
  handler: async (ctx) => {
    const prefs = await ctx.db
      .query("notificationPrefs")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id)
      )
      .unique();
    return {
      mention: prefs?.mention ?? true,
      assigned: prefs?.assigned ?? true,
      statusChanged: prefs?.statusChanged ?? true,
      github: prefs?.github ?? true,
    };
  },
});

export const setPref = orgMutation({
  args: {
    key: v.union(
      v.literal("mention"),
      v.literal("assigned"),
      v.literal("statusChanged"),
      v.literal("github")
    ),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notificationPrefs")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { [args.key]: args.enabled });
    } else {
      await ctx.db.insert("notificationPrefs", {
        orgId: ctx.org._id,
        userId: ctx.user._id,
        mention: true,
        assigned: true,
        statusChanged: true,
        github: true,
        [args.key]: args.enabled,
      });
    }
    return null;
  },
});

const enrichedNotificationValidator = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  type: notificationTypeValidator,
  read: v.boolean(),
  newValue: v.optional(v.string()),
  actorName: v.string(),
  actorImageUrl: v.optional(v.string()),
  /** Set for automated events; the UI shows the integration's logo. */
  systemActor: v.optional(v.literal("github")),
  issueId: v.id("issues"),
  /** Display identifier, e.g. ENG-42. */
  identifier: v.string(),
  issueTitle: v.string(),
  /** Snippet of the mentioning comment. */
  commentBody: v.optional(v.string()),
});

export const list = orgQuery({
  args: {},
  returns: v.array(enrichedNotificationValidator),
  handler: async (ctx) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id)
      )
      .order("desc")
      .take(50);

    const userCache = new Map<Id<"users">, Doc<"users"> | null>();
    const teamCache = new Map<Id<"teams">, Doc<"teams"> | null>();

    const result = [];
    for (const notification of notifications) {
      const issue = await ctx.db.get(notification.issueId);
      if (!issue) {
        continue; // issue deleted since; stale notification is just hidden
      }
      let actor: Doc<"users"> | null = null;
      if (notification.actorId) {
        if (!userCache.has(notification.actorId)) {
          userCache.set(
            notification.actorId,
            await ctx.db.get(notification.actorId)
          );
        }
        actor = userCache.get(notification.actorId) ?? null;
      }
      if (!teamCache.has(issue.teamId)) {
        teamCache.set(issue.teamId, await ctx.db.get(issue.teamId));
      }
      const team = teamCache.get(issue.teamId) ?? null;
      const comment = notification.commentId
        ? await ctx.db.get(notification.commentId)
        : null;

      result.push({
        _id: notification._id,
        _creationTime: notification._creationTime,
        type: notification.type,
        read: notification.read,
        newValue: notification.newValue,
        actorName:
          notification.systemActor === "github"
            ? "GitHub"
            : (actor?.name ?? "Someone"),
        actorImageUrl: actor?.imageUrl,
        systemActor: notification.systemActor,
        issueId: issue._id,
        identifier: `${team?.key ?? "?"}-${issue.number}`,
        issueTitle: issue.title,
        commentBody: comment?.body.slice(0, 140),
      });
    }
    return result;
  },
});

export const unreadCount = orgQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // ponytail: capped at 100 — the badge shows "9+" long before this matters.
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id).eq("read", false)
      )
      .take(100);
    return unread.length;
  },
});

export const markRead = orgMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (
      !notification ||
      notification.orgId !== ctx.org._id ||
      notification.userId !== ctx.user._id
    ) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(notification._id, { read: true });
    return null;
  },
});

export const markAllRead = orgMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id).eq("read", false)
      )
      .collect();
    for (const notification of unread) {
      await ctx.db.patch(notification._id, { read: true });
    }
    return null;
  },
});
