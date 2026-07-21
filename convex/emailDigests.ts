import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import {
  issuePriorityValidator,
  issueStatusValidator,
} from "./schema";

/**
 * Email digests — the full case matrix:
 *
 * Time of day (user-local, via tzOffsetMinutes captured from the browser):
 *   morning → delivered in the 08:00 hour
 *   evening → delivered in the 18:00 hour
 *   any     → delivered in the 09:00 hour (no preference default)
 *
 * Frequency:
 *   daily  → every day
 *   weekly → exactly one weekday (days = [d])
 *   custom → any set of weekdays (days = [d, ...], at least one)
 *
 * Content sections (each independently on/off, at least one on):
 *   assigned   → open issues assigned to you (in-progress excluded when the
 *                inProgress section is also on, to avoid duplicate rows)
 *   inProgress → your issues currently In Progress
 *   mentions   → @mentions and replies since the last digest (24h window
 *                for the first one)
 *   focus      → what needs attention: overdue, due within 72h, or urgent
 *
 * Delivery guards: at most one digest per local day (lastSentDay), and a
 * digest whose every enabled section is empty is skipped, not sent.
 */

const HOUR_FOR: Record<Doc<"emailDigests">["timeOfDay"], number> = {
  morning: 8,
  evening: 18,
  any: 9,
};

const settingsShape = {
  enabled: v.boolean(),
  timeOfDay: v.union(
    v.literal("morning"),
    v.literal("evening"),
    v.literal("any")
  ),
  frequency: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("custom")
  ),
  days: v.array(v.number()),
  sections: v.object({
    assigned: v.boolean(),
    inProgress: v.boolean(),
    mentions: v.boolean(),
    focus: v.boolean(),
  }),
  tzOffsetMinutes: v.number(),
};

export const DEFAULT_SETTINGS = {
  enabled: false,
  timeOfDay: "morning" as const,
  frequency: "daily" as const,
  days: [1],
  sections: { assigned: true, inProgress: true, mentions: true, focus: true },
  tzOffsetMinutes: 0,
};

export const getSettings = orgQuery({
  args: {},
  returns: v.object(settingsShape),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("emailDigests")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id)
      )
      .unique();
    if (!existing) {
      return DEFAULT_SETTINGS;
    }
    return {
      enabled: existing.enabled,
      timeOfDay: existing.timeOfDay,
      frequency: existing.frequency,
      days: existing.days,
      sections: existing.sections,
      tzOffsetMinutes: existing.tzOffsetMinutes,
    };
  },
});

function validateSettings(settings: {
  enabled: boolean;
  frequency: "daily" | "weekly" | "custom";
  days: number[];
  sections: Record<string, boolean>;
}): void {
  if (!settings.enabled) {
    return; // anything goes while off
  }
  if (settings.days.some((d) => d < 0 || d > 6 || !Number.isInteger(d))) {
    throw new ConvexError("Days must be weekday numbers 0–6");
  }
  if (settings.frequency === "weekly" && settings.days.length !== 1) {
    throw new ConvexError("Pick exactly one day for a weekly digest");
  }
  if (settings.frequency === "custom" && settings.days.length === 0) {
    throw new ConvexError("Pick at least one day for a custom schedule");
  }
  if (!Object.values(settings.sections).some(Boolean)) {
    throw new ConvexError("Turn on at least one content section");
  }
}

export const saveSettings = orgMutation({
  args: settingsShape,
  returns: v.null(),
  handler: async (ctx, args) => {
    validateSettings(args);
    const existing = await ctx.db
      .query("emailDigests")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("emailDigests", {
        ...args,
        orgId: ctx.org._id,
        userId: ctx.user._id,
      });
    }
    return null;
  },
});

/** Queue a digest for the caller right now, ignoring schedule guards. */
export const sendTest = orgMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    let digest = await ctx.db
      .query("emailDigests")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id)
      )
      .unique();
    if (!digest) {
      const id = await ctx.db.insert("emailDigests", {
        ...DEFAULT_SETTINGS,
        orgId: ctx.org._id,
        userId: ctx.user._id,
      });
      digest = (await ctx.db.get(id))!;
    }
    await ctx.scheduler.runAfter(0, internal.email.sendDigest.deliver, {
      digestId: digest._id,
      force: true,
    });
    return null;
  },
});

/** Local wall-clock parts for a digest owner at `now`. */
function localParts(now: number, tzOffsetMinutes: number) {
  const local = new Date(now - tzOffsetMinutes * 60_000);
  return {
    hour: local.getUTCHours(),
    weekday: local.getUTCDay(),
    day: local.toISOString().slice(0, 10),
  };
}

/** Digests whose local schedule says "deliver now". Called by the hourly cron. */
export const listDue = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.id("emailDigests")),
  handler: async (ctx, args): Promise<Id<"emailDigests">[]> => {
    const enabled = await ctx.db
      .query("emailDigests")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    const due: Id<"emailDigests">[] = [];
    for (const digest of enabled) {
      const { hour, weekday, day } = localParts(args.now, digest.tzOffsetMinutes);
      if (hour !== HOUR_FOR[digest.timeOfDay]) continue;
      if (digest.frequency !== "daily" && !digest.days.includes(weekday)) {
        continue;
      }
      if (digest.lastSentDay === day) continue;
      due.push(digest._id);
    }
    return due;
  },
});

export const markSent = internalMutation({
  args: { digestId: v.id("emailDigests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const digest = await ctx.db.get(args.digestId);
    if (!digest) return null;
    const now = Date.now();
    await ctx.db.patch(args.digestId, {
      lastSentAt: now,
      lastSentDay: localParts(now, digest.tzOffsetMinutes).day,
    });
    return null;
  },
});

// ── Digest content ─────────────────────────────────────────────────────────

const digestIssueValidator = v.object({
  identifier: v.string(),
  title: v.string(),
  status: issueStatusValidator,
  priority: issuePriorityValidator,
  dueDate: v.optional(v.number()),
  path: v.string(),
});

const digestMentionValidator = v.object({
  identifier: v.string(),
  title: v.string(),
  actorName: v.string(),
  snippet: v.string(),
  path: v.string(),
});

export type DigestIssue = {
  identifier: string;
  title: string;
  status: Doc<"issues">["status"];
  priority: Doc<"issues">["priority"];
  dueDate?: number;
  path: string;
};

export type DigestMention = {
  identifier: string;
  title: string;
  actorName: string;
  snippet: string;
  path: string;
};

export type DigestData = {
  email: string;
  name: string;
  orgName: string;
  orgSlug: string;
  timeOfDay: "morning" | "evening" | "any";
  sections: {
    assigned: DigestIssue[] | null;
    inProgress: DigestIssue[] | null;
    mentions: DigestMention[] | null;
    focus: DigestIssue[] | null;
  };
};

const OPEN_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review"]);
const FOCUS_WINDOW_MS = 72 * 60 * 60 * 1000;
const MAX_ROWS = 20;

/** Everything the email needs, or null when the digest/user is gone. */
export const getDigestData = internalQuery({
  args: { digestId: v.id("emailDigests") },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      name: v.string(),
      orgName: v.string(),
      orgSlug: v.string(),
      timeOfDay: v.union(
        v.literal("morning"),
        v.literal("evening"),
        v.literal("any")
      ),
      sections: v.object({
        assigned: v.union(v.null(), v.array(digestIssueValidator)),
        inProgress: v.union(v.null(), v.array(digestIssueValidator)),
        mentions: v.union(v.null(), v.array(digestMentionValidator)),
        focus: v.union(v.null(), v.array(digestIssueValidator)),
      }),
    })
  ),
  handler: async (ctx, args): Promise<DigestData | null> => {
    const digest = await ctx.db.get(args.digestId);
    if (!digest) return null;
    const user = await ctx.db.get(digest.userId);
    const org = await ctx.db.get(digest.orgId);
    if (!user || !org || !org.slug) return null;

    const teamCache = new Map<Id<"teams">, Doc<"teams"> | null>();
    const identifierFor = async (issue: Doc<"issues">) => {
      if (!teamCache.has(issue.teamId)) {
        teamCache.set(issue.teamId, await ctx.db.get(issue.teamId));
      }
      return `${teamCache.get(issue.teamId)?.key ?? "?"}-${issue.number}`;
    };
    const toItem = async (issue: Doc<"issues">): Promise<DigestIssue> => ({
      identifier: await identifierFor(issue),
      title: issue.title,
      status: issue.status,
      priority: issue.priority,
      dueDate: issue.dueDate,
      path: `/${org.slug}/issue/${issue._id}`,
    });

    const mine = digest.sections.assigned ||
      digest.sections.inProgress ||
      digest.sections.focus
      ? (
          await ctx.db
            .query("issues")
            .withIndex("by_assignee", (q) =>
              q.eq("orgId", digest.orgId).eq("assigneeId", digest.userId)
            )
            .order("desc")
            .take(300)
        ).filter((issue) => OPEN_STATUSES.has(issue.status))
      : [];

    const now = Date.now();
    const sections: DigestData["sections"] = {
      assigned: null,
      inProgress: null,
      mentions: null,
      focus: null,
    };

    if (digest.sections.assigned) {
      const rows = digest.sections.inProgress
        ? mine.filter((issue) => issue.status !== "in_progress")
        : mine;
      sections.assigned = await Promise.all(
        rows.slice(0, MAX_ROWS).map(toItem)
      );
    }
    if (digest.sections.inProgress) {
      sections.inProgress = await Promise.all(
        mine
          .filter((issue) => issue.status === "in_progress")
          .slice(0, MAX_ROWS)
          .map(toItem)
      );
    }
    if (digest.sections.focus) {
      sections.focus = await Promise.all(
        mine
          .filter(
            (issue) =>
              issue.priority === "urgent" ||
              (issue.dueDate !== undefined &&
                issue.dueDate < now + FOCUS_WINDOW_MS)
          )
          .sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
          .slice(0, MAX_ROWS)
          .map(toItem)
      );
    }
    if (digest.sections.mentions) {
      const since = digest.lastSentAt ?? now - 24 * 60 * 60 * 1000;
      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) =>
          q.eq("orgId", digest.orgId).eq("userId", digest.userId)
        )
        .order("desc")
        .take(100);
      const mentions: DigestMention[] = [];
      const userCache = new Map<Id<"users">, Doc<"users"> | null>();
      for (const notification of notifications) {
        if (notification._creationTime <= since) break; // desc order
        const type = notification.type as string;
        if (type !== "mention" && type !== "reply") continue;
        const issue = await ctx.db.get(notification.issueId);
        if (!issue) continue;
        let actorName = "Someone";
        if (notification.actorId) {
          if (!userCache.has(notification.actorId)) {
            userCache.set(
              notification.actorId,
              await ctx.db.get(notification.actorId)
            );
          }
          actorName = userCache.get(notification.actorId)?.name ?? "Someone";
        }
        const comment = notification.commentId
          ? await ctx.db.get(notification.commentId)
          : null;
        mentions.push({
          identifier: await identifierFor(issue),
          title: issue.title,
          actorName,
          snippet: comment?.body.slice(0, 160) ?? "",
          path: `/${org.slug}/issue/${issue._id}`,
        });
        if (mentions.length >= MAX_ROWS) break;
      }
      sections.mentions = mentions;
    }

    return {
      email: user.email,
      name: user.name,
      orgName: org.name,
      orgSlug: org.slug,
      timeOfDay: digest.timeOfDay,
      sections,
    };
  },
});
