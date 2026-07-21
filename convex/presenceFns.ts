import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { getOrgIssue } from "./issues";
import { orgMutation, orgQuery } from "./lib/customFunctions";

/**
 * Presence for issue detail pages ("who's viewing this issue").
 *
 * Rooms are issue ids; user ids are Convex `users` ids. The shape of these
 * three functions matches the `PresenceAPI` expected by the
 * `usePresence` hook from `@convex-dev/presence/react`.
 */
export const presence = new Presence(components.presence);

export const heartbeat = orgMutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.object({
    roomToken: v.string(),
    sessionToken: v.string(),
  }),
  handler: async (ctx, args) => {
    // Rooms are issues - only org members of the issue's org may join.
    const issueId = ctx.db.normalizeId("issues", args.roomId);
    if (!issueId) {
      throw new Error("Invalid presence room");
    }
    await getOrgIssue(ctx, ctx.org._id, issueId);

    // Always record presence as the authenticated user, never the claimed one.
    return await presence.heartbeat(
      ctx,
      args.roomId,
      ctx.user._id,
      args.sessionId,
      args.interval
    );
  },
});

export const list = orgQuery({
  args: { roomToken: v.string() },
  returns: v.array(
    v.object({
      userId: v.string(),
      online: v.boolean(),
      lastDisconnected: v.number(),
      name: v.optional(v.string()),
      image: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const state = await presence.list(ctx, args.roomToken);

    const result = [];
    for (const entry of state) {
      const userId = ctx.db.normalizeId("users", entry.userId);
      if (!userId) {
        continue;
      }
      // Only surface users that are (still) members of the caller's org.
      const membership = await ctx.db
        .query("members")
        .withIndex("by_org_and_user", (q) =>
          q.eq("orgId", ctx.org._id).eq("userId", userId)
        )
        .unique();
      if (!membership) {
        continue;
      }
      const user = await ctx.db.get(userId);
      result.push({
        userId: entry.userId,
        online: entry.online,
        lastDisconnected: entry.lastDisconnected,
        name: user?.name,
        image: user?.imageUrl,
      });
    }
    return result;
  },
});

export const disconnect = orgMutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // The session token is an unguessable capability minted by `heartbeat`.
    return await presence.disconnect(ctx, args.sessionToken);
  },
});
