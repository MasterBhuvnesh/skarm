import { Output, generateText, jsonSchema } from "ai";
import { Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { issuePriorityValidator } from "../schema";
import { tryAuthorizeAi } from "./authorize";
import { issueSummaryValidator } from "./data";
import { embedText } from "./embeddings";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  chatModel,
  isAiConfigured,
} from "./models";

/**
 * Triage assist for the issue detail page (Track D).
 *
 * These are public actions, so they authenticate + plan-gate through
 * `internal.agent.data.authorizeAi` (JWT-derived org, never client input)
 * before touching any data, and return `{ ok: false }` results instead of
 * throwing for expected failures so the UI can degrade gracefully.
 */

const PRIORITIES = ["none", "urgent", "high", "medium", "low"] as const;
type SuggestedPriority = (typeof PRIORITIES)[number];

const failure = v.object({ ok: v.literal(false), error: v.string() });

type IssueSummary = Infer<typeof issueSummaryValidator>;

type DuplicatesResult =
  | { ok: false; error: string }
  | { ok: true; duplicates: Array<IssueSummary & { similarity: number }> };

type TriageSuggestionResult =
  | { ok: false; error: string }
  | {
      ok: true;
      priority: SuggestedPriority;
      labels: Array<{ labelId: Id<"labels">; name: string; color: string }>;
      reasoning: string;
    };

/** Semantic duplicate detection over the `by_embedding` vector index. */
export const findDuplicates = action({
  args: { issueId: v.id("issues") },
  returns: v.union(
    failure,
    v.object({
      ok: v.literal(true),
      duplicates: v.array(
        v.object({
          ...issueSummaryValidator.fields,
          similarity: v.number(),
        })
      ),
    })
  ),
  handler: async (ctx, args): Promise<DuplicatesResult> => {
    const authResult = await tryAuthorizeAi(ctx);
    if (!authResult.ok) {
      return authResult;
    }
    const auth = authResult.auth;
    const issue = await ctx.runQuery(internal.agent.data.issueTriageContext, {
      orgId: auth.orgId,
      issueId: args.issueId,
    });
    if (!isAiConfigured()) {
      return { ok: false as const, error: AI_NOT_CONFIGURED_MESSAGE };
    }
    try {
      const text = issue.description
        ? `${issue.title}\n\n${issue.description}`
        : issue.title;
      const embedding = await embedText(text);
      // Keep the stored embedding fresh while we have it.
      await ctx.runMutation(internal.agent.data.saveIssueEmbeddings, {
        orgId: auth.orgId,
        items: [{ issueId: args.issueId, embedding }],
      });

      const results = await ctx.vectorSearch("issues", "by_embedding", {
        vector: embedding,
        limit: 8,
        filter: (q) => q.eq("orgId", auth.orgId),
      });
      const candidates = results.filter(
        (result) => result._id !== args.issueId && result._score >= 0.4
      );
      const summaries = await ctx.runQuery(
        internal.agent.data.issueSummariesByIds,
        { orgId: auth.orgId, issueIds: candidates.map((c) => c._id) }
      );
      const scores = new Map(candidates.map((c) => [c._id, c._score]));
      return {
        ok: true as const,
        duplicates: summaries
          .map((summary) => ({
            ...summary,
            similarity:
              Math.round((scores.get(summary.issueId) ?? 0) * 100) / 100,
          }))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5),
      };
    } catch (error) {
      console.error("Duplicate detection failed", error);
      return {
        ok: false as const,
        error: "Could not check for duplicates. Please try again.",
      };
    }
  },
});

/** Suggest a priority + labels for an issue from its title/description. */
export const suggestTriage = action({
  args: { issueId: v.id("issues") },
  returns: v.union(
    failure,
    v.object({
      ok: v.literal(true),
      priority: issuePriorityValidator,
      labels: v.array(
        v.object({
          labelId: v.id("labels"),
          name: v.string(),
          color: v.string(),
        })
      ),
      reasoning: v.string(),
    })
  ),
  handler: async (ctx, args): Promise<TriageSuggestionResult> => {
    const authResult = await tryAuthorizeAi(ctx);
    if (!authResult.ok) {
      return authResult;
    }
    const issue = await ctx.runQuery(internal.agent.data.issueTriageContext, {
      orgId: authResult.auth.orgId,
      issueId: args.issueId,
    });
    if (!isAiConfigured()) {
      return { ok: false as const, error: AI_NOT_CONFIGURED_MESSAGE };
    }

    const labelNames = issue.orgLabels.map((label) => label.name);
    try {
      const { output } = await generateText({
        model: chatModel,
        output: Output.object({
          schema: jsonSchema<{
            priority: SuggestedPriority;
            labelNames: string[];
            reasoning: string;
          }>({
            type: "object",
            properties: {
              priority: {
                type: "string",
                enum: [...PRIORITIES],
                description: "Suggested priority for the issue",
              },
              labelNames: {
                type: "array",
                items: { type: "string" },
                description:
                  "Labels to apply, chosen ONLY from the provided workspace labels (empty if none fit)",
              },
              reasoning: {
                type: "string",
                description: "One short sentence explaining the suggestion",
              },
            },
            required: ["priority", "labelNames", "reasoning"],
            additionalProperties: false,
          }),
        }),
        prompt: [
          "You triage issues in a software project tracker.",
          `Issue ${issue.identifier} in team "${issue.teamName}":`,
          `Title: ${issue.title}`,
          issue.description ? `Description: ${issue.description}` : "",
          labelNames.length > 0
            ? `Workspace labels you may choose from: ${labelNames.join(", ")}`
            : "This workspace has no labels yet, so suggest none.",
          "Suggest the most fitting priority (urgent = production-breaking, high = important and time-sensitive, medium = normal, low = nice-to-have, none = unclear) and any fitting labels.",
        ]
          .filter(Boolean)
          .join("\n"),
      });

      const byName = new Map(
        issue.orgLabels.map((label) => [label.name.toLowerCase(), label])
      );
      const applied = new Set(issue.appliedLabelIds);
      const labels = output.labelNames
        .map((name) => byName.get(name.toLowerCase()))
        .filter((label) => label !== undefined)
        .filter((label) => !applied.has(label.labelId));

      return {
        ok: true as const,
        priority: PRIORITIES.includes(output.priority)
          ? output.priority
          : ("none" as const),
        labels,
        reasoning: output.reasoning,
      };
    } catch (error) {
      console.error("Triage suggestion failed", error);
      return {
        ok: false as const,
        error: "Could not generate triage suggestions. Please try again.",
      };
    }
  },
});
