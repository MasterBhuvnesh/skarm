import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import { Id } from "../_generated/dataModel";

/** Pro orgs get 50 AI messages per user per day; Enterprise is unlimited. */
export const PRO_DAILY_MESSAGE_LIMIT = 50;

export const aiRateLimiter = new RateLimiter(components.rateLimiter, {
  aiMessagesDaily: {
    kind: "fixed window",
    rate: PRO_DAILY_MESSAGE_LIMIT,
    period: DAY,
  },
});

/** Per-user-per-org key so quotas never leak across workspaces. */
export function aiMessageKey(
  orgId: Id<"organizations">,
  userId: Id<"users">
): string {
  return `${orgId}:${userId}`;
}

/**
 * Agent-component thread owner key. Threads are stored in the agent
 * component keyed by this composite id, scoping every thread to a single
 * (organization, user) pair - listing/reading threads can therefore never
 * cross org boundaries.
 */
export function threadUserKey(
  orgId: Id<"organizations">,
  userId: Id<"users">
): string {
  return `${orgId}:${userId}`;
}
