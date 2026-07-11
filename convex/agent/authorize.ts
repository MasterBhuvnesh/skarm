import { Infer } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { ActionCtx } from "../_generated/server";
import { planValidator } from "../schema";

type AiAuth = {
  orgId: Id<"organizations">;
  userId: Id<"users">;
  plan: Infer<typeof planValidator>;
  orgName: string;
  userName: string;
};

/**
 * `authorizeAi` for public actions: plan-gate rejections are EXPECTED (free
 * orgs, or a downgrade mid-session while the UI still shows AI affordances),
 * so they come back as a `{ ok: false }` result the client can toast/render,
 * instead of a thrown server error that Next's dev overlay escalates.
 */
export async function tryAuthorizeAi(
  ctx: ActionCtx
): Promise<{ ok: true; auth: AiAuth } | { ok: false; error: string }> {
  try {
    return {
      ok: true,
      auth: await ctx.runQuery(internal.agent.data.authorizeAi, {}),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.replace(/^Uncaught Error:\s*/, "")
          : "The AI agent is unavailable.",
    };
  }
}
