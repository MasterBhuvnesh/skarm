import { Agent, stepCountIs } from "@convex-dev/agent";
import { components } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { chatModel } from "./models";
import { vectorTools } from "./tools";

/**
 * Custom fields our authenticated entry points inject into the action ctx so
 * every tool runs with a server-resolved org + user (see tools.ts).
 */
export type VectorAgentCtx = {
  orgId: Id<"organizations">;
  requestUserId: Id<"users">;
};

export const VECTOR_INSTRUCTIONS = `You are Skarm, the workspace assistant inside the Skarm issue tracker (a Linear-style tool: organizations contain teams, teams contain issues like ENG-42, plus projects and cycles).

You can use tools to look up teams, members, projects, cycles and issues, run reports, search (full-text and semantic), and create or update issues.

Guidelines:
- Always discover real team keys and member emails with listTeams / listMembers instead of guessing.
- Before creating an issue, check findSimilarIssues for likely duplicates when the user's request sounds like a bug report or feature request; mention close matches instead of silently duplicating.
- When you create or change issues, confirm exactly what you did, citing identifiers like ENG-42.
- For standup or cycle reports, fetch the data with the report tools and present a tight, scannable summary grouped by person or status.
- Keep answers concise and structured with short markdown lists; this is a dense productivity tool, not a chat toy.
- You only ever see one workspace. If asked about anything outside it, say you can't access that.`;

export const vectorAgent = new Agent<VectorAgentCtx>(components.agent, {
  name: "Skarm",
  languageModel: chatModel,
  instructions: VECTOR_INSTRUCTIONS,
  tools: vectorTools,
  stopWhen: stepCountIs(12),
  contextOptions: {
    // Recent thread history only — issue knowledge comes from tools.
    recentMessages: 30,
    searchOtherThreads: false,
  },
});
