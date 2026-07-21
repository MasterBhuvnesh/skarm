import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthContext, getCurrentUser } from "./auth";

/**
 * Org-agnostic authenticated functions - use when no active org is required
 * (e.g. user profile, onboarding).
 */
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await getCurrentUser(ctx);
    return { user };
  })
);

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await getCurrentUser(ctx);
    return { user };
  })
);

/**
 * Org-scoped functions - THE default for all workspace data. Resolves the
 * active org from the JWT, verifies membership, and exposes
 * `ctx.user`, `ctx.org`, `ctx.membership`. Always filter queries by
 * `ctx.org._id`.
 */
export const orgQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    return await getAuthContext(ctx);
  })
);

export const orgMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    return await getAuthContext(ctx);
  })
);

/** Org-scoped mutation restricted to org admins. */
export const orgAdminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (auth.membership.role !== "admin") {
      // ConvexError (not a plain Error) so the client catch shows a toast
      // instead of the noisy "Server Error" dev overlay.
      throw new ConvexError("Admin access required");
    }
    return auth;
  })
);
