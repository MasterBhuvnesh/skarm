import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import { notificationTypeValidator } from "./schema";

/**
 * Insert an in-app notification. Skips self-notifications so actors never
 * hear about their own edits. Shared by comments.create (mentions) and
 * issues.update (assignments, status changes).
 */
export async function createNotification(
  ctx: MutationCtx,
  args: {
    orgId: Id<"organizations">;
    userId: Id<"users">;
    actorId: Id<"users">;
    issueId: Id<"issues">;
    type: Doc<"notifications">["type"];
    newValue?: string;
    commentId?: Id<"comments">;
  }
): Promise<void> {
  if (args.userId === args.actorId) {
    return;
  }
  await ctx.db.insert("notifications", { ...args, read: false });
}

const enrichedNotificationValidator = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  type: notificationTypeValidator,
  read: v.boolean(),
  newValue: v.optional(v.string()),
  actorName: v.string(),
  actorImageUrl: v.optional(v.string()),
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
      if (!userCache.has(notification.actorId)) {
        userCache.set(notification.actorId, await ctx.db.get(notification.actorId));
      }
      const actor = userCache.get(notification.actorId) ?? null;
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
        actorName: actor?.name ?? "Someone",
        actorImageUrl: actor?.imageUrl,
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
