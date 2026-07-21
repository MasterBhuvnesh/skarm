import { Output, generateText, jsonSchema } from "ai";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { action, internalQuery } from "../_generated/server";
import {
  issuePriorityValidator,
  issueRelationTypeValidator,
} from "../schema";
import { tryAuthorizeAi } from "./authorize";
import {
  aiMessageKey,
  aiRateLimiter,
  PRO_DAILY_MESSAGE_LIMIT,
} from "./limiter";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  chatModel,
  isAiConfigured,
} from "./models";

/**
 * AI issue drafting: expand a one-line idea into a fully specced issue -
 * description with acceptance criteria, priority, estimate, labels,
 * sub-issues, and suggested relations to existing team issues. The draft is
 * returned to the create-issue dialog for review; nothing is written until
 * the user submits.
 */

const PRIORITIES = ["none", "urgent", "high", "medium", "low"] as const;
const RELATION_TYPES = [
  "blocks",
  "blocked_by",
  "related",
  "duplicate_of",
] as const;
const ESTIMATES = [1, 2, 3, 5, 8, 13];

const failure = v.object({ ok: v.literal(false), error: v.string() });

export const draftEffortValidator = v.union(
  v.literal("short"),
  v.literal("concise"),
  v.literal("detailed"),
  v.literal("thorough")
);

/** Description-length guidance per effort level, injected into the prompt. */
const EFFORT_GUIDANCE: Record<string, string> = {
  short:
    "Keep the description SHORT: 1-2 sentences of context and 2-3 acceptance criteria, under 80 words total.",
  concise:
    "Keep the description concise: a short context paragraph and 3-5 acceptance criteria, under 150 words total.",
  detailed:
    "Write a DETAILED description: context, suggested approach, and 5-8 acceptance criteria, around 250 words.",
  thorough:
    "Write a THOROUGH spec: context, proposed approach, risks/edge cases, testing notes, and 6-10 acceptance criteria, up to 450 words.",
};

/** Labels + recent issues the model may reference, never invented ids. */
export const draftContext = internalQuery({
  args: {
    orgId: v.id("organizations"),
    teamId: v.id("teams"),
    projectId: v.optional(v.id("projects")),
  },
  returns: v.object({
    teamName: v.string(),
    orgLabels: v.array(
      v.object({
        labelId: v.id("labels"),
        name: v.string(),
        color: v.string(),
      })
    ),
    recentIssues: v.array(
      v.object({
        issueId: v.id("issues"),
        identifier: v.string(),
        title: v.string(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== args.orgId) {
      throw new Error("Team not found");
    }
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.orgId !== args.orgId) {
        throw new Error("Project not found");
      }
    }
    const orgLabels = await ctx.db
      .query("labels")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    // Scope relation candidates to the chosen project when set; otherwise the
    // whole team's recent issues.
    const recent = args.projectId
      ? await ctx.db
          .query("issues")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .order("desc")
          .take(80)
      : await ctx.db
          .query("issues")
          .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
          .order("desc")
          .take(80);
    return {
      teamName: team.name,
      orgLabels: orgLabels.map((label) => ({
        labelId: label._id,
        name: label.name,
        color: label.color,
      })),
      recentIssues: recent.map((issue) => ({
        issueId: issue._id,
        identifier: `${team.key}-${issue.number}`,
        title: issue.title,
      })),
    };
  },
});

type DraftOutput = {
  title: string;
  description: string;
  priority: (typeof PRIORITIES)[number];
  estimate: number | null;
  labelNames: string[];
  subIssues: string[];
  relations: {
    identifier: string;
    type: (typeof RELATION_TYPES)[number];
    reason: string;
  }[];
};

type DraftResult =
  | { ok: false; error: string }
  | {
      ok: true;
      title: string;
      description: string;
      priority: (typeof PRIORITIES)[number];
      estimate: number | null;
      labels: { labelId: Id<"labels">; name: string; color: string }[];
      subIssues: string[];
      relations: {
        issueId: Id<"issues">;
        identifier: string;
        title: string;
        type: (typeof RELATION_TYPES)[number];
        reason: string;
      }[];
    };

export const draftIssue = action({
  args: {
    idea: v.string(),
    teamId: v.id("teams"),
    projectId: v.optional(v.id("projects")),
    /** Optional user guidance, e.g. "focus on the mobile flow". */
    instructions: v.optional(v.string()),
    /** Description length: short | concise (default) | detailed | thorough. */
    effort: v.optional(draftEffortValidator),
    /** Set when rephrasing so the model revises instead of repeating. */
    previousDescription: v.optional(v.string()),
  },
  returns: v.union(
    failure,
    v.object({
      ok: v.literal(true),
      title: v.string(),
      description: v.string(),
      priority: issuePriorityValidator,
      estimate: v.union(v.number(), v.null()),
      labels: v.array(
        v.object({
          labelId: v.id("labels"),
          name: v.string(),
          color: v.string(),
        })
      ),
      subIssues: v.array(v.string()),
      relations: v.array(
        v.object({
          issueId: v.id("issues"),
          identifier: v.string(),
          title: v.string(),
          type: issueRelationTypeValidator,
          reason: v.string(),
        })
      ),
    })
  ),
  handler: async (ctx, args): Promise<DraftResult> => {
    const idea = args.idea.trim();
    if (!idea) {
      return { ok: false as const, error: "Describe the idea first." };
    }
    const authResult = await tryAuthorizeAi(ctx);
    if (!authResult.ok) {
      return authResult;
    }
    const auth = authResult.auth;
    const context = await ctx.runQuery(internal.agent.draft.draftContext, {
      orgId: auth.orgId,
      teamId: args.teamId,
      projectId: args.projectId,
    });
    if (!isAiConfigured()) {
      return { ok: false as const, error: AI_NOT_CONFIGURED_MESSAGE };
    }

    // Drafts share the chat allowance: 50 AI messages/user/day on Pro,
    // unlimited on Enterprise (free plans never pass authorizeAi).
    if (auth.plan === "pro") {
      const status = await aiRateLimiter.limit(ctx, "aiMessagesDaily", {
        key: aiMessageKey(auth.orgId, auth.userId),
      });
      if (!status.ok) {
        const hours = Math.max(
          1,
          Math.ceil((status.retryAfter ?? 0) / (60 * 60 * 1000))
        );
        return {
          ok: false as const,
          error: `Daily AI limit reached (${PRO_DAILY_MESSAGE_LIMIT} messages/day on Pro). Try again in about ${hours}h, or upgrade to Enterprise for unlimited AI.`,
        };
      }
    }

    try {
      const { output } = await generateText({
        model: chatModel,
        output: Output.object({
          schema: jsonSchema<DraftOutput>({
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Concise, action-oriented issue title",
              },
              description: {
                type: "string",
                description:
                  "Markdown body: short context paragraph, then '### Acceptance criteria' with 3-6 '- [ ]' checklist items. Under 250 words.",
              },
              priority: { type: "string", enum: [...PRIORITIES] },
              estimate: {
                type: ["number", "null"],
                description:
                  "Story points from 1, 2, 3, 5, 8, 13 - null if unclear",
              },
              labelNames: {
                type: "array",
                items: { type: "string" },
                description:
                  "Labels chosen ONLY from the provided workspace labels (empty if none fit)",
              },
              subIssues: {
                type: "array",
                items: { type: "string" },
                description:
                  "0-6 short sub-issue titles breaking down the work; empty if the issue is atomic",
              },
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    identifier: {
                      type: "string",
                      description:
                        "Identifier of an EXISTING issue from the provided list, e.g. ENG-42",
                    },
                    type: { type: "string", enum: [...RELATION_TYPES] },
                    reason: {
                      type: "string",
                      description: "One short sentence why",
                    },
                  },
                  required: ["identifier", "type", "reason"],
                  additionalProperties: false,
                },
                description:
                  "Up to 3 relations to existing issues; empty if none clearly apply",
              },
            },
            required: [
              "title",
              "description",
              "priority",
              "estimate",
              "labelNames",
              "subIssues",
              "relations",
            ],
            additionalProperties: false,
          }),
        }),
        prompt: [
          `You draft fully specced issues for the team "${context.teamName}" in a software project tracker.`,
          `One-line idea from the user: ${idea}`,
          args.instructions?.trim()
            ? `Additional guidance from the user (follow it closely): ${args.instructions.trim()}`
            : "",
          args.previousDescription?.trim()
            ? `The user asked for a REPHRASE. Previous draft description - write a meaningfully different/improved version, do not repeat it:\n${args.previousDescription.trim().slice(0, 1500)}`
            : "",
          EFFORT_GUIDANCE[args.effort ?? "concise"],
          context.orgLabels.length > 0
            ? `Workspace labels you may choose from: ${context.orgLabels.map((l) => l.name).join(", ")}`
            : "This workspace has no labels yet, so suggest none.",
          context.recentIssues.length > 0
            ? `Existing team issues (identifier: title) you may reference for relations:\n${context.recentIssues.map((i) => `${i.identifier}: ${i.title}`).join("\n")}`
            : "There are no existing issues, so suggest no relations.",
          "Expand the idea into a well-specified issue. Priorities: urgent = production-breaking, high = important and time-sensitive, medium = normal, low = nice-to-have, none = unclear.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });

      const labelsByName = new Map(
        context.orgLabels.map((label) => [label.name.toLowerCase(), label])
      );
      const labels = [
        ...new Set(
          output.labelNames
            .map((name) => labelsByName.get(name.toLowerCase()))
            .filter((label) => label !== undefined)
        ),
      ];

      const issuesByIdentifier = new Map(
        context.recentIssues.map((issue) => [
          issue.identifier.toUpperCase(),
          issue,
        ])
      );
      const seenTargets = new Set<Id<"issues">>();
      const relations = [];
      for (const relation of output.relations ?? []) {
        const target = issuesByIdentifier.get(
          relation.identifier.toUpperCase()
        );
        if (
          !target ||
          seenTargets.has(target.issueId) ||
          !RELATION_TYPES.includes(relation.type)
        ) {
          continue;
        }
        seenTargets.add(target.issueId);
        relations.push({
          issueId: target.issueId,
          identifier: target.identifier,
          title: target.title,
          type: relation.type,
          reason: relation.reason,
        });
        if (relations.length >= 3) {
          break;
        }
      }

      return {
        ok: true as const,
        title: output.title.trim() || idea,
        description: output.description,
        priority: PRIORITIES.includes(output.priority)
          ? output.priority
          : ("none" as const),
        estimate:
          output.estimate !== null && ESTIMATES.includes(output.estimate)
            ? output.estimate
            : null,
        labels,
        subIssues: (output.subIssues ?? [])
          .map((title) => title.trim())
          .filter(Boolean)
          .slice(0, 6),
        relations,
      };
    } catch (error) {
      console.error("Issue drafting failed", error);
      return {
        ok: false as const,
        error: "Could not draft the issue. Please try again.",
      };
    }
  },
});
