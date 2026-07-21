import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, QueryCtx } from "./_generated/server";
import { insertIssue } from "./issues";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import { issuePriorityValidator, templateCadenceValidator } from "./schema";

const templateShape = {
  _id: v.id("issueTemplates"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  teamId: v.id("teams"),
  creatorId: v.id("users"),
  name: v.string(),
  titlePrefix: v.string(),
  description: v.optional(v.string()),
  priority: issuePriorityValidator,
  labelIds: v.array(v.id("labels")),
  cadence: v.optional(templateCadenceValidator),
  weekday: v.optional(v.number()),
  dayOfMonth: v.optional(v.number()),
  nextRunAt: v.optional(v.number()),
};

/** Hour (UTC) at which recurring issues are created. */
// ponytail: fixed 9:00 UTC run time; add a per-template timezone/hour field if teams ask.
const RUN_HOUR_UTC = 9;

type Schedule = {
  cadence?: Doc<"issueTemplates">["cadence"];
  weekday?: number;
  dayOfMonth?: number;
};

/** Next occurrence strictly after `after`, at RUN_HOUR_UTC. Exported for seed.ts. */
export function computeNextRun(after: number, schedule: Schedule): number {
  const d = new Date(after);
  d.setUTCHours(RUN_HOUR_UTC, 0, 0, 0);
  const step = () => d.setUTCDate(d.getUTCDate() + 1);
  if (d.getTime() <= after) {
    step();
  }
  switch (schedule.cadence) {
    case "daily":
      break;
    case "weekdays":
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
        step();
      }
      break;
    case "weekly":
      while (d.getUTCDay() !== (schedule.weekday ?? 1)) {
        step();
      }
      break;
    case "monthly":
      // dayOfMonth is capped at 28, so every month has it.
      while (d.getUTCDate() !== (schedule.dayOfMonth ?? 1)) {
        step();
      }
      break;
  }
  return d.getTime();
}

const scheduleArgs = {
  cadence: v.optional(templateCadenceValidator),
  weekday: v.optional(v.number()),
  dayOfMonth: v.optional(v.number()),
  /** Whether the recurring schedule is active. */
  scheduleEnabled: v.boolean(),
};

function resolveSchedule(args: {
  cadence?: Doc<"issueTemplates">["cadence"];
  weekday?: number;
  dayOfMonth?: number;
  scheduleEnabled: boolean;
}): Pick<
  Doc<"issueTemplates">,
  "cadence" | "weekday" | "dayOfMonth" | "nextRunAt"
> {
  if (args.scheduleEnabled && !args.cadence) {
    throw new Error("Pick a cadence to enable recurring issues");
  }
  if (
    args.weekday !== undefined &&
    (args.weekday < 0 || args.weekday > 6 || !Number.isInteger(args.weekday))
  ) {
    throw new Error("Weekday must be between 0 (Sunday) and 6 (Saturday)");
  }
  if (
    args.dayOfMonth !== undefined &&
    (args.dayOfMonth < 1 ||
      args.dayOfMonth > 28 ||
      !Number.isInteger(args.dayOfMonth))
  ) {
    throw new Error("Day of month must be between 1 and 28");
  }
  return {
    cadence: args.cadence,
    weekday: args.weekday,
    dayOfMonth: args.dayOfMonth,
    nextRunAt: args.scheduleEnabled
      ? computeNextRun(Date.now(), args)
      : undefined,
  };
}

/** Verify a template belongs to the caller's org before any read/write. */
async function getOrgTemplate(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  templateId: Id<"issueTemplates">
): Promise<Doc<"issueTemplates">> {
  const template = await ctx.db.get(templateId);
  if (!template || template.orgId !== orgId) {
    throw new Error("Template not found");
  }
  return template;
}

export const list = orgQuery({
  args: {},
  returns: v.array(v.object(templateShape)),
  handler: async (ctx) => {
    return await ctx.db
      .query("issueTemplates")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .take(200);
  },
});

export const create = orgMutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    titlePrefix: v.string(),
    description: v.optional(v.string()),
    priority: issuePriorityValidator,
    labelIds: v.array(v.id("labels")),
    ...scheduleArgs,
  },
  returns: v.id("issueTemplates"),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== ctx.org._id) {
      throw new Error("Team not found");
    }
    for (const labelId of args.labelIds) {
      const label = await ctx.db.get(labelId);
      if (!label || label.orgId !== ctx.org._id) {
        throw new Error("Label not found");
      }
    }
    return await ctx.db.insert("issueTemplates", {
      orgId: ctx.org._id,
      teamId: args.teamId,
      creatorId: ctx.user._id,
      name: args.name.trim(),
      titlePrefix: args.titlePrefix.trim(),
      description: args.description,
      priority: args.priority,
      labelIds: args.labelIds,
      ...resolveSchedule(args),
    });
  },
});

export const update = orgMutation({
  args: {
    templateId: v.id("issueTemplates"),
    teamId: v.id("teams"),
    name: v.string(),
    titlePrefix: v.string(),
    description: v.optional(v.string()),
    priority: issuePriorityValidator,
    labelIds: v.array(v.id("labels")),
    ...scheduleArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const template = await getOrgTemplate(ctx, ctx.org._id, args.templateId);
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== ctx.org._id) {
      throw new Error("Team not found");
    }
    for (const labelId of args.labelIds) {
      const label = await ctx.db.get(labelId);
      if (!label || label.orgId !== ctx.org._id) {
        throw new Error("Label not found");
      }
    }
    await ctx.db.replace(template._id, {
      orgId: ctx.org._id,
      teamId: args.teamId,
      creatorId: template.creatorId,
      name: args.name.trim(),
      titlePrefix: args.titlePrefix.trim(),
      description: args.description,
      priority: args.priority,
      labelIds: args.labelIds,
      ...resolveSchedule(args),
    });
    return null;
  },
});

export const remove = orgMutation({
  args: { templateId: v.id("issueTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const template = await getOrgTemplate(ctx, ctx.org._id, args.templateId);
    await ctx.db.delete(template._id);
    return null;
  },
});

/**
 * Cron entry point (convex/crons.ts): create issues for every template whose
 * nextRunAt has passed. Idempotent - nextRunAt is advanced in the same
 * transaction as the issue insert, so a due template is picked up exactly
 * once even if the cron overlaps or retries.
 */
export const runDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("issueTemplates")
      .withIndex("by_next_run", (q) =>
        q.gte("nextRunAt", 0).lte("nextRunAt", now)
      )
      .take(100);

    for (const template of due) {
      // Advance the schedule first so a failing template skips this
      // occurrence instead of blocking the whole batch forever.
      await ctx.db.patch(template._id, {
        nextRunAt: computeNextRun(now, template),
      });

      const org = await ctx.db.get(template.orgId);
      const team = await ctx.db.get(template.teamId);
      if (!org || !team) {
        continue;
      }
      const date = new Date(now).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
      try {
        await insertIssue(ctx, {
          org,
          team,
          creatorId: template.creatorId,
          title: `${template.titlePrefix} - ${date}`,
          description: template.description,
          status: "backlog",
          priority: template.priority,
          labelIds: template.labelIds,
        });
      } catch (error) {
        // e.g. free-plan issue limit reached - skip this occurrence.
        console.error(
          `Recurring template ${template._id} skipped: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    return null;
  },
});
