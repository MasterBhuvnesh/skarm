import {
  createThread as createAgentThread,
  listUIMessages,
  saveMessage,
  syncStreams,
  updateThreadMetadata,
  vStreamArgs,
} from "@convex-dev/agent";
import { calculateRateLimit } from "@convex-dev/rate-limiter";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import {
  MutationCtx,
  QueryCtx,
  internalAction,
} from "../_generated/server";
import { orgMutation, orgQuery } from "../lib/customFunctions";
import { hasAiAccess } from "../lib/limits";
import {
  PRO_DAILY_MESSAGE_LIMIT,
  aiMessageKey,
  aiRateLimiter,
  threadUserKey,
} from "./limiter";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  assertAiConfigured,
  isAiConfigured,
} from "./models";
import { VECTOR_INSTRUCTIONS, vectorAgent } from "./vectorAgent";

const DEFAULT_THREAD_TITLE = "New conversation";

function assertAiAccess(org: Doc<"organizations">): void {
  if (!hasAiAccess(org)) {
    throw new Error(
      "The AI agent requires a Pro or Enterprise plan. Upgrade to unlock it."
    );
  }
}

/**
 * Verify the agent-component thread belongs to the authenticated
 * (org, user) pair before any read/write. Thread ownership is keyed by
 * `threadUserKey`, so cross-org access is impossible.
 */
async function getOwnedThread(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
  threadId: string
) {
  const thread = await ctx.runQuery(components.agent.threads.getThread, {
    threadId,
  });
  if (!thread || thread.userId !== threadUserKey(orgId, userId)) {
    throw new Error("Thread not found");
  }
  return thread;
}

// ── Threads ────────────────────────────────────────────────────────────────

export const createThread = orgMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    assertAiAccess(ctx.org);
    return await createAgentThread(ctx, components.agent, {
      userId: threadUserKey(ctx.org._id, ctx.user._id),
      title: DEFAULT_THREAD_TITLE,
    });
  },
});

export const listThreads = orgQuery({
  args: {},
  returns: v.array(
    v.object({
      threadId: v.string(),
      title: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    if (!hasAiAccess(ctx.org)) {
      return [];
    }
    const result = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      {
        userId: threadUserKey(ctx.org._id, ctx.user._id),
        order: "desc",
        paginationOpts: { cursor: null, numItems: 100 },
      }
    );
    return result.page
      .filter((thread) => thread.status === "active")
      .map((thread) => ({
        threadId: thread._id,
        title: thread.title ?? DEFAULT_THREAD_TITLE,
        createdAt: thread._creationTime,
      }));
  },
});

export const deleteThread = orgMutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getOwnedThread(ctx, ctx.org._id, ctx.user._id, args.threadId);
    await vectorAgent.deleteThreadAsync(ctx, { threadId: args.threadId });
    return null;
  },
});

// ── Messages ───────────────────────────────────────────────────────────────

export const listMessages = orgQuery({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  returns: v.object({
    page: v.array(v.any()),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal("SplitRecommended"),
        v.literal("SplitRequired"),
        v.null()
      )
    ),
    streams: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    await getOwnedThread(ctx, ctx.org._id, ctx.user._id, args.threadId);
    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });
    return { ...paginated, streams };
  },
});

export const sendMessage = orgMutation({
  args: { threadId: v.string(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertAiAccess(ctx.org);
    const prompt = args.prompt.trim();
    if (!prompt) {
      throw new Error("Message cannot be empty");
    }
    const thread = await getOwnedThread(
      ctx,
      ctx.org._id,
      ctx.user._id,
      args.threadId
    );

    // Pro: 50 messages/user/day. Enterprise: unlimited.
    if (ctx.org.plan === "pro") {
      const status = await aiRateLimiter.limit(ctx, "aiMessagesDaily", {
        key: aiMessageKey(ctx.org._id, ctx.user._id),
      });
      if (!status.ok) {
        const hours = Math.max(
          1,
          Math.ceil((status.retryAfter ?? 0) / (60 * 60 * 1000))
        );
        throw new Error(
          `Daily AI limit reached (${PRO_DAILY_MESSAGE_LIMIT} messages/day on Pro). Try again in about ${hours}h, or upgrade to Enterprise for unlimited AI.`
        );
      }
    }

    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId: threadUserKey(ctx.org._id, ctx.user._id),
      prompt,
    });

    // First message names the conversation.
    if (!thread.title || thread.title === DEFAULT_THREAD_TITLE) {
      await updateThreadMetadata(ctx, components.agent, {
        threadId: args.threadId,
        patch: { title: prompt.length > 60 ? `${prompt.slice(0, 57)}…` : prompt },
      });
    }

    await ctx.scheduler.runAfter(0, internal.agent.chat.streamResponse, {
      threadId: args.threadId,
      promptMessageId: messageId,
      orgId: ctx.org._id,
      userId: ctx.user._id,
    });
    return null;
  },
});

/**
 * Generate the assistant's reply asynchronously, streaming deltas over the
 * websocket. Tools receive the server-resolved org/user via the custom ctx
 * fields — never from model output.
 */
export const streamResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    orgId: v.id("organizations"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const actor = await ctx.runQuery(internal.agent.data.actorContext, {
      orgId: args.orgId,
      userId: args.userId,
    });
    try {
      assertAiConfigured();
      await vectorAgent.streamText(
        { ...ctx, orgId: args.orgId, requestUserId: args.userId },
        {
          threadId: args.threadId,
          userId: threadUserKey(args.orgId, args.userId),
        },
        {
          promptMessageId: args.promptMessageId,
          system: `${VECTOR_INSTRUCTIONS}\n\nWorkspace: ${actor.orgName}. Requesting user: ${actor.userName}. Today's date: ${new Date().toISOString().slice(0, 10)}.`,
        },
        { saveStreamDeltas: true }
      );
    } catch (error) {
      console.error("AI response generation failed", error);
      // Fail gracefully: leave a visible assistant message in the thread.
      const reason = isAiConfigured()
        ? "Something went wrong while generating a response. Please try again."
        : AI_NOT_CONFIGURED_MESSAGE;
      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        userId: threadUserKey(args.orgId, args.userId),
        agentName: "Skarm",
        message: { role: "assistant", content: reason },
      });
    }
    return null;
  },
});

// ── Quota ──────────────────────────────────────────────────────────────────

export const quota = orgQuery({
  args: {},
  returns: v.object({
    hasAccess: v.boolean(),
    unlimited: v.boolean(),
    limit: v.number(),
    remaining: v.number(),
    resetsAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    if (!hasAiAccess(ctx.org)) {
      return {
        hasAccess: false,
        unlimited: false,
        limit: 0,
        remaining: 0,
        resetsAt: null,
      };
    }
    if (ctx.org.plan === "enterprise") {
      return {
        hasAccess: true,
        unlimited: true,
        limit: PRO_DAILY_MESSAGE_LIMIT,
        remaining: PRO_DAILY_MESSAGE_LIMIT,
        resetsAt: null,
      };
    }
    const { value, ts, config } = await aiRateLimiter.getValue(
      ctx,
      "aiMessagesDaily",
      { key: aiMessageKey(ctx.org._id, ctx.user._id) }
    );
    const current = calculateRateLimit({ value, ts }, config, Date.now(), 0);
    return {
      hasAccess: true,
      unlimited: false,
      limit: PRO_DAILY_MESSAGE_LIMIT,
      remaining: Math.max(0, Math.floor(current.value)),
      resetsAt:
        current.windowStart !== undefined
          ? current.windowStart + config.period
          : null,
    };
  },
});
