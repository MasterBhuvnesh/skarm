import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getOrgIssue } from "./issues";
import { orgQuery } from "./lib/customFunctions";

/**
 * Activity feed queries. Entries are written by `logActivity` in
 * `convex/lib/activity.ts` from every issue-changing mutation; this module
 * only renders them.
 */
const activityEntryValidator = v.object({
  _id: v.id("activity"),
  _creationTime: v.number(),
  issueId: v.id("issues"),
  actorId: v.optional(v.id("users")),
  /** Set for automated events; the UI shows the integration's logo. */
  systemActor: v.optional(v.literal("github")),
  type: v.string(),
  field: v.optional(v.string()),
  oldValue: v.optional(v.string()),
  newValue: v.optional(v.string()),
  actorName: v.string(),
  actorImageUrl: v.optional(v.string()),
});

export const listByIssue = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.array(activityEntryValidator),
  handler: async (ctx, args) => {
    await getOrgIssue(ctx, ctx.org._id, args.issueId);

    const entries = await ctx.db
      .query("activity")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .take(500);

    const userCache = new Map<Id<"users">, Doc<"users"> | null>();
    const getUser = async (userId: Id<"users">) => {
      if (!userCache.has(userId)) {
        userCache.set(userId, await ctx.db.get(userId));
      }
      return userCache.get(userId) ?? null;
    };

    /**
     * Assignee changes store raw user ids - resolve them to display names so
     * the client never sees opaque ids.
     */
    const resolveValue = async (
      field: string | undefined,
      value: string | undefined
    ): Promise<string | undefined> => {
      if (value === undefined || field !== "assignee") {
        return value;
      }
      const userId = ctx.db.normalizeId("users", value);
      if (!userId) {
        return value;
      }
      const user = await getUser(userId);
      return user?.name ?? value;
    };

    const result = [];
    for (const entry of entries) {
      const actor = entry.actorId ? await getUser(entry.actorId) : null;
      result.push({
        _id: entry._id,
        _creationTime: entry._creationTime,
        issueId: entry.issueId,
        actorId: entry.actorId,
        systemActor: entry.systemActor,
        type: entry.type,
        field: entry.field,
        oldValue: await resolveValue(entry.field, entry.oldValue),
        newValue: await resolveValue(entry.field, entry.newValue),
        actorName:
          entry.systemActor === "github"
            ? "GitHub"
            : (actor?.name ?? "Unknown user"),
        actorImageUrl: actor?.imageUrl,
      });
    }
    return result;
  },
});
