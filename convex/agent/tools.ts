import { createTool, type ToolCtx } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { Infer } from "convex/values";
import { internal } from "../_generated/api";
import { DataModel, Id } from "../_generated/dataModel";
import { issueSummaryValidator } from "./data";
import { embedText } from "./embeddings";

/**
 * Org-scoped tools for the Vector agent.
 *
 * SECURITY: every tool reads `orgId` / `requestUserId` from the custom action
 * context that our own internal action injects after authenticating the
 * caller. The model can never choose which org it operates on - tool inputs
 * only carry user-meaningful identifiers (team keys, issue numbers, emails)
 * that are resolved inside the caller's org.
 *
 * NOTE: `execute` return types are annotated explicitly to avoid a type cycle
 * through `internal` → `_generated/api` → this module.
 */
export type VectorToolCtx = ToolCtx<DataModel> & {
  orgId: Id<"organizations">;
  requestUserId: Id<"users">;
};

type IssueSummary = Infer<typeof issueSummaryValidator>;

const ISSUE_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled",
] as const;
const ISSUE_PRIORITIES = ["none", "urgent", "high", "medium", "low"] as const;

type IssueStatus = (typeof ISSUE_STATUSES)[number];
type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

const emptyInput = jsonSchema<Record<string, never>>({
  type: "object",
  properties: {},
  additionalProperties: false,
});

const listTeams = createTool({
  description:
    "List the teams in this workspace with their issue-prefix keys (e.g. ENG). Use a team key whenever another tool needs one.",
  inputSchema: emptyInput,
  execute: async (
    ctx: VectorToolCtx
  ): Promise<
    Array<{ teamId: Id<"teams">; name: string; key: string; issueCount: number }>
  > => {
    return await ctx.runQuery(internal.agent.data.listTeamsForOrg, {
      orgId: ctx.orgId,
    });
  },
});

const listMembers = createTool({
  description:
    "List the members of this workspace with their names, emails and roles. Use emails when assigning issues.",
  inputSchema: emptyInput,
  execute: async (
    ctx: VectorToolCtx
  ): Promise<Array<{ name: string; email: string; role: string }>> => {
    return await ctx.runQuery(internal.agent.data.listMembersForOrg, {
      orgId: ctx.orgId,
    });
  },
});

const projectStatus = createTool({
  description:
    "Get the status of every project in the workspace: progress counts, lead and target date.",
  inputSchema: emptyInput,
  execute: async (
    ctx: VectorToolCtx
  ): Promise<
    Array<{
      name: string;
      status: string;
      leadName: string | null;
      targetDate: string | null;
      totalIssues: number;
      doneIssues: number;
      inProgressIssues: number;
    }>
  > => {
    return await ctx.runQuery(internal.agent.data.listProjectStatus, {
      orgId: ctx.orgId,
    });
  },
});

const searchIssues = createTool({
  description:
    "Full-text search issues by title in this workspace. Optionally restrict to one team by key.",
  inputSchema: jsonSchema<{ query: string; teamKey?: string }>({
    type: "object",
    properties: {
      query: { type: "string", description: "Search terms for issue titles" },
      teamKey: {
        type: "string",
        description: "Optional team key, e.g. ENG, to limit the search",
      },
    },
    required: ["query"],
    additionalProperties: false,
  }),
  execute: async (ctx: VectorToolCtx, input): Promise<IssueSummary[]> => {
    return await ctx.runQuery(internal.agent.data.searchIssues, {
      orgId: ctx.orgId,
      query: input.query,
      teamKey: input.teamKey,
    });
  },
});

const findSimilarIssues = createTool({
  description:
    "Semantic search: find issues whose meaning is similar to the given text. Best for detecting duplicates before creating a new issue.",
  inputSchema: jsonSchema<{ text: string }>({
    type: "object",
    properties: {
      text: {
        type: "string",
        description:
          "Issue title and/or description to find semantically similar issues for",
      },
    },
    required: ["text"],
    additionalProperties: false,
  }),
  execute: async (
    ctx: VectorToolCtx,
    input
  ): Promise<Array<IssueSummary & { similarity: number }>> => {
    const embedding = await embedText(input.text);
    const results = await ctx.vectorSearch("issues", "by_embedding", {
      vector: embedding,
      limit: 8,
      filter: (q) => q.eq("orgId", ctx.orgId),
    });
    const summaries: IssueSummary[] = await ctx.runQuery(
      internal.agent.data.issueSummariesByIds,
      { orgId: ctx.orgId, issueIds: results.map((r) => r._id) }
    );
    const scores = new Map(results.map((r) => [r._id, r._score]));
    return summaries
      .map((summary) => ({
        ...summary,
        similarity: Math.round((scores.get(summary.issueId) ?? 0) * 100) / 100,
      }))
      .filter((summary) => summary.similarity >= 0.35);
  },
});

const createIssue = createTool({
  description:
    "Create a new issue in a team. Returns the new issue's identifier (e.g. ENG-42). Check for duplicates with findSimilarIssues first when it makes sense.",
  inputSchema: jsonSchema<{
    teamKey: string;
    title: string;
    description?: string;
    status?: IssueStatus;
    priority?: IssuePriority;
    assigneeEmail?: string;
  }>({
    type: "object",
    properties: {
      teamKey: { type: "string", description: "Team key, e.g. ENG" },
      title: { type: "string", description: "Short, specific issue title" },
      description: {
        type: "string",
        description: "Optional longer description in plain text",
      },
      status: {
        type: "string",
        enum: [...ISSUE_STATUSES],
        description: "Initial status (defaults to todo)",
      },
      priority: {
        type: "string",
        enum: [...ISSUE_PRIORITIES],
        description: "Priority (defaults to none)",
      },
      assigneeEmail: {
        type: "string",
        description: "Email of the workspace member to assign",
      },
    },
    required: ["teamKey", "title"],
    additionalProperties: false,
  }),
  execute: async (
    ctx: VectorToolCtx,
    input
  ): Promise<{ issueId: Id<"issues">; identifier: string }> => {
    return await ctx.runMutation(internal.agent.data.createIssueForAgent, {
      orgId: ctx.orgId,
      actorUserId: ctx.requestUserId,
      teamKey: input.teamKey,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigneeEmail: input.assigneeEmail,
    });
  },
});

const updateIssue = createTool({
  description:
    "Update an existing issue referenced by its identifier (e.g. ENG-42). Only pass the fields you want to change. Pass assigneeEmail: null to unassign.",
  inputSchema: jsonSchema<{
    identifier: string;
    title?: string;
    description?: string;
    status?: IssueStatus;
    priority?: IssuePriority;
    assigneeEmail?: string | null;
  }>({
    type: "object",
    properties: {
      identifier: {
        type: "string",
        description: "Issue identifier like ENG-42",
      },
      title: { type: "string" },
      description: { type: "string" },
      status: { type: "string", enum: [...ISSUE_STATUSES] },
      priority: { type: "string", enum: [...ISSUE_PRIORITIES] },
      assigneeEmail: {
        type: ["string", "null"],
        description: "Member email to assign, or null to unassign",
      },
    },
    required: ["identifier"],
    additionalProperties: false,
  }),
  execute: async (
    ctx: VectorToolCtx,
    input
  ): Promise<{ identifier: string; changedFields: string[] }> => {
    const match = input.identifier
      .trim()
      .match(/^([A-Za-z][A-Za-z0-9]{0,4})-(\d+)$/);
    if (!match) {
      throw new Error(
        `"${input.identifier}" is not a valid issue identifier. Use the form KEY-number, e.g. ENG-42.`
      );
    }
    return await ctx.runMutation(internal.agent.data.updateIssueForAgent, {
      orgId: ctx.orgId,
      actorUserId: ctx.requestUserId,
      teamKey: match[1],
      number: Number(match[2]),
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigneeEmail: input.assigneeEmail,
    });
  },
});

type CycleSummary = {
  teamName: string;
  teamKey: string;
  cycle: {
    name: string;
    startDate: string;
    endDate: string;
    daysRemaining: number;
  } | null;
  counts: {
    total: number;
    done: number;
    inProgress: number;
    inReview: number;
    todo: number;
    backlog: number;
    canceled: number;
  };
  issues: IssueSummary[];
};

const cycleSummary = createTool({
  description:
    "Summarize a team's current cycle (sprint): dates, days remaining, progress counts and the issues in it.",
  inputSchema: jsonSchema<{ teamKey: string }>({
    type: "object",
    properties: {
      teamKey: { type: "string", description: "Team key, e.g. ENG" },
    },
    required: ["teamKey"],
    additionalProperties: false,
  }),
  execute: async (ctx: VectorToolCtx, input): Promise<CycleSummary> => {
    return await ctx.runQuery(internal.agent.data.cycleSummaryForTeam, {
      orgId: ctx.orgId,
      teamKey: input.teamKey,
    });
  },
});

type StandupData = {
  sinceHours: number;
  entries: Array<{
    memberName: string;
    inProgress: IssueSummary[];
    completed: IssueSummary[];
    created: IssueSummary[];
  }>;
};

const standupReport = createTool({
  description:
    "Gather standup data: what each member completed and created recently, plus what they have in progress. Optionally restrict to a team.",
  inputSchema: jsonSchema<{ teamKey?: string; sinceHours?: number }>({
    type: "object",
    properties: {
      teamKey: {
        type: "string",
        description: "Optional team key to restrict the report to",
      },
      sinceHours: {
        type: "number",
        description: "Look-back window in hours (default 24, max 168)",
      },
    },
    additionalProperties: false,
  }),
  execute: async (ctx: VectorToolCtx, input): Promise<StandupData> => {
    const sinceHours = Math.min(Math.max(input.sinceHours ?? 24, 1), 168);
    return await ctx.runQuery(internal.agent.data.standupForOrg, {
      orgId: ctx.orgId,
      teamKey: input.teamKey,
      sinceHours,
    });
  },
});

export const vectorTools = {
  listTeams,
  listMembers,
  projectStatus,
  searchIssues,
  findSimilarIssues,
  createIssue,
  updateIssue,
  cycleSummary,
  standupReport,
};
