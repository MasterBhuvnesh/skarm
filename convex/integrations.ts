import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  QueryCtx,
} from "./_generated/server";
import { scheduleGithubIssueSync } from "./github/sync";
import { logActivity } from "./lib/activity";
import { orgAdminMutation, orgQuery } from "./lib/customFunctions";
import { createNotification } from "./notifications";

/**
 * GitHub integration via a GitHub App.
 *
 * Connect flow: `beginInstall` mints a single-use nonce and sends the user
 * to GitHub's install screen (where they pick repositories). GitHub
 * redirects to `/github-setup` (http.ts) with the installation id + nonce,
 * and `completeSetup` binds the installation to the org. From then on the
 * app-level webhook (`GITHUB_WEBHOOK_SECRET`) delivers installation and
 * pull_request events; PRs link to issues by identifier (ENG-42 in the
 * branch name, title or body) and drive statuses: opened → in_review,
 * merged → done.
 */

async function getGithubIntegration(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">
): Promise<Doc<"integrations"> | null> {
  return await ctx.db
    .query("integrations")
    .withIndex("by_org_and_type", (q) =>
      q.eq("orgId", orgId).eq("type", "github")
    )
    .unique();
}

export const get = orgQuery({
  args: {},
  returns: v.object({
    /** Whether GITHUB_APP_SLUG is set on the deployment. */
    appConfigured: v.boolean(),
    connection: v.union(
      v.null(),
      v.object({
        enabled: v.boolean(),
        connectedByName: v.string(),
        connectedAt: v.number(),
        repositories: v.array(v.string()),
      })
    ),
  }),
  handler: async (ctx) => {
    const integration = await getGithubIntegration(ctx, ctx.org._id);
    const connected = integration?.installationId !== undefined;
    const connectedBy = connected
      ? await ctx.db.get(integration!.connectedBy)
      : null;
    return {
      appConfigured: !!process.env.GITHUB_APP_SLUG,
      connection: connected
        ? {
            enabled: integration!.enabled,
            connectedByName: connectedBy?.name ?? "Unknown user",
            connectedAt: integration!._creationTime,
            repositories: integration!.repositories ?? [],
          }
        : null,
    };
  },
});

/** Mint a nonce and return GitHub's install URL (repo picker) to redirect to. */
export const beginInstall = orgAdminMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const slug = process.env.GITHUB_APP_SLUG;
    if (!slug) {
      throw new Error(
        "GITHUB_APP_SLUG is not set on the Convex deployment"
      );
    }
    const nonce = crypto.randomUUID();
    await ctx.db.insert("githubInstallStates", {
      orgId: ctx.org._id,
      userId: ctx.user._id,
      nonce,
    });
    return `https://github.com/apps/${slug}/installations/new?state=${nonce}`;
  },
});

export const setEnabled = orgAdminMutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await getGithubIntegration(ctx, ctx.org._id);
    if (!integration) {
      throw new Error("GitHub is not connected");
    }
    await ctx.db.patch(integration._id, { enabled: args.enabled });
    return null;
  },
});

/** Remove the binding. Linked PR records on issues are kept. */
export const disconnect = orgAdminMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const integration = await getGithubIntegration(ctx, ctx.org._id);
    if (integration) {
      await ctx.db.delete(integration._id);
    }
    return null;
  },
});

/** PRs linked to an issue, for the issue-detail panel. */
export const listByIssue = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.array(
    v.object({
      _id: v.id("pullRequests"),
      repo: v.string(),
      number: v.number(),
      title: v.string(),
      url: v.string(),
      state: v.union(
        v.literal("open"),
        v.literal("merged"),
        v.literal("closed")
      ),
      authorLogin: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.orgId !== ctx.org._id) {
      throw new Error("Issue not found");
    }
    const prs = await ctx.db
      .query("pullRequests")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    return prs.map((pr) => ({
      _id: pr._id,
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: pr.state,
      authorLogin: pr.authorLogin,
    }));
  },
});

// ── Figma (OAuth) ──────────────────────────────────────────────────────────

async function getFigmaIntegration(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">
): Promise<Doc<"integrations"> | null> {
  return await ctx.db
    .query("integrations")
    .withIndex("by_org_and_type", (q) =>
      q.eq("orgId", orgId).eq("type", "figma")
    )
    .unique();
}

export const getFigma = orgQuery({
  args: {},
  returns: v.object({
    /** Whether FIGMA_CLIENT_ID is set on the deployment. */
    appConfigured: v.boolean(),
    connection: v.union(
      v.null(),
      v.object({
        enabled: v.boolean(),
        connectedByName: v.string(),
        connectedAt: v.number(),
      })
    ),
  }),
  handler: async (ctx) => {
    const integration = await getFigmaIntegration(ctx, ctx.org._id);
    const connectedBy = integration
      ? await ctx.db.get(integration.connectedBy)
      : null;
    return {
      appConfigured: !!process.env.FIGMA_CLIENT_ID,
      connection: integration
        ? {
            enabled: integration.enabled,
            connectedByName: connectedBy?.name ?? "Unknown user",
            connectedAt: integration._creationTime,
          }
        : null,
    };
  },
});

/** Mint a nonce and return Figma's OAuth URL to redirect to. */
export const beginFigmaConnect = orgAdminMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const clientId = process.env.FIGMA_CLIENT_ID;
    if (!clientId) {
      throw new Error("FIGMA_CLIENT_ID is not set on the Convex deployment");
    }
    const nonce = crypto.randomUUID();
    // ponytail: reuses the GitHub install-state table — it's just
    // (orgId, userId, nonce); rename to oauthStates if a third OAuth lands.
    await ctx.db.insert("githubInstallStates", {
      orgId: ctx.org._id,
      userId: ctx.user._id,
      nonce,
    });
    const redirectUri = encodeURIComponent(
      `${process.env.CONVEX_SITE_URL}/figma-callback`
    );
    // Granular scopes (must be enabled on the Figma app): file contents +
    // rendered images, file metadata, posting comments, and Dev Mode
    // resources. Changing this list requires reconnecting.
    const scope = encodeURIComponent(
      "file_content:read file_metadata:read file_comments:write file_versions:read file_dev_resources:write"
    );
    return `https://www.figma.com/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${nonce}&response_type=code`;
  },
});

export const setFigmaEnabled = orgAdminMutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await getFigmaIntegration(ctx, ctx.org._id);
    if (!integration) {
      throw new Error("Figma is not connected");
    }
    await ctx.db.patch(integration._id, { enabled: args.enabled });
    return null;
  },
});

/** Remove the Figma connection. Linked designs on issues are kept. */
export const disconnectFigma = orgAdminMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const integration = await getFigmaIntegration(ctx, ctx.org._id);
    if (integration) {
      await ctx.db.delete(integration._id);
    }
    return null;
  },
});

/** Bind a finished Figma OAuth exchange to the org that started it. */
export const completeFigmaSetup = internalMutation({
  args: {
    nonce: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    /** Token lifetime in seconds (0 = unknown/non-expiring). */
    expiresIn: v.number(),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("githubInstallStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique();
    if (!state) {
      return null;
    }
    await ctx.db.delete(state._id);
    if (Date.now() - state._creationTime > NONCE_TTL_MS) {
      return null;
    }

    const tokenFields = {
      figmaAccessToken: args.accessToken,
      figmaRefreshToken: args.refreshToken,
      figmaTokenExpiresAt:
        args.expiresIn > 0 ? Date.now() + args.expiresIn * 1000 : undefined,
    };
    const existing = await getFigmaIntegration(ctx, state.orgId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...tokenFields,
        connectedBy: state.userId,
        enabled: true,
      });
    } else {
      await ctx.db.insert("integrations", {
        orgId: state.orgId,
        type: "figma",
        enabled: true,
        connectedBy: state.userId,
        ...tokenFields,
      });
    }
    const org = await ctx.db.get(state.orgId);
    return org?.slug ?? null;
  },
});

// ── Install callback + webhook internals ──────────────────────────────────

const NONCE_TTL_MS = 15 * 60 * 1000;

/**
 * Bind a finished GitHub App install to the org that started it. Returns
 * the org slug for the post-install redirect, or null if the nonce is
 * unknown/expired.
 */
export const completeSetup = internalMutation({
  args: { nonce: v.string(), installationId: v.number() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("githubInstallStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique();
    if (!state) {
      return null;
    }
    await ctx.db.delete(state._id);
    if (Date.now() - state._creationTime > NONCE_TTL_MS) {
      return null;
    }

    const existing = await getGithubIntegration(ctx, state.orgId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        installationId: args.installationId,
        connectedBy: state.userId,
        enabled: true,
        webhookSecret: undefined,
      });
    } else {
      await ctx.db.insert("integrations", {
        orgId: state.orgId,
        type: "github",
        enabled: true,
        connectedBy: state.userId,
        installationId: args.installationId,
      });
    }

    // Pull the repo list from the API now — the installation webhook that
    // carries it races with this mutation and is dropped if it arrives first.
    await ctx.scheduler.runAfter(0, internal.github.client.syncRepositories, {
      installationId: args.installationId,
    });

    const org = await ctx.db.get(state.orgId);
    return org?.slug ?? null;
  },
});

async function getByInstallation(
  ctx: { db: QueryCtx["db"] },
  installationId: number
): Promise<Doc<"integrations"> | null> {
  return await ctx.db
    .query("integrations")
    .withIndex("by_installation", (q) =>
      q.eq("installationId", installationId)
    )
    .first();
}

/** installation / installation_repositories events: sync the repo list. */
export const handleInstallationEvent = internalMutation({
  args: {
    installationId: v.number(),
    action: v.string(),
    /** Full repo list when GitHub sends one (install created). */
    repositories: v.optional(v.array(v.string())),
    repositoriesAdded: v.optional(v.array(v.string())),
    repositoriesRemoved: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await getByInstallation(ctx, args.installationId);
    if (!integration) {
      return null; // install created before completeSetup ran; repos sync on later events
    }

    if (args.action === "deleted") {
      // App uninstalled on GitHub: drop the binding.
      await ctx.db.delete(integration._id);
      return null;
    }

    const repos = new Set(
      args.repositories ?? integration.repositories ?? []
    );
    for (const repo of args.repositoriesAdded ?? []) {
      repos.add(repo);
    }
    for (const repo of args.repositoriesRemoved ?? []) {
      repos.delete(repo);
    }
    await ctx.db.patch(integration._id, {
      repositories: [...repos].sort(),
    });
    return null;
  },
});

/**
 * Process a pull_request event: upsert PR links on referenced issues and
 * move statuses (opened → in_review, merged → done) with activity +
 * notifications.
 */
export const handlePullRequest = internalMutation({
  args: {
    installationId: v.number(),
    merged: v.boolean(),
    closed: v.boolean(),
    repo: v.string(),
    number: v.number(),
    title: v.string(),
    url: v.string(),
    authorLogin: v.string(),
    /** Branch name + title + body, scanned for issue identifiers. */
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await getByInstallation(ctx, args.installationId);
    if (!integration || !integration.enabled) {
      return null;
    }
    const orgId = integration.orgId;

    // Self-heal the repo list from real traffic.
    if (args.repo && !(integration.repositories ?? []).includes(args.repo)) {
      await ctx.db.patch(integration._id, {
        repositories: [...(integration.repositories ?? []), args.repo].sort(),
      });
    }

    // "ENG-42" → team key + number. Team keys are short and alphabetic.
    const identifiers = new Map<string, number>();
    for (const match of args.text.matchAll(/\b([A-Za-z]{1,10})-(\d{1,6})\b/g)) {
      identifiers.set(match[1].toUpperCase(), Number(match[2]));
    }

    const state = args.merged ? "merged" : args.closed ? "closed" : "open";

    for (const [key, number] of identifiers) {
      const team = await ctx.db
        .query("teams")
        .withIndex("by_org_and_key", (q) =>
          q.eq("orgId", orgId).eq("key", key)
        )
        .unique();
      if (!team) {
        continue;
      }
      const issue = await ctx.db
        .query("issues")
        .withIndex("by_team_and_number", (q) =>
          q.eq("teamId", team._id).eq("number", number)
        )
        .unique();
      if (!issue) {
        continue;
      }

      // Upsert the PR link for this issue.
      const links = await ctx.db
        .query("pullRequests")
        .withIndex("by_org_repo_number", (q) =>
          q
            .eq("orgId", orgId)
            .eq("repo", args.repo)
            .eq("number", args.number)
        )
        .collect();
      const existing = links.find((link) => link.issueId === issue._id);
      if (existing) {
        await ctx.db.patch(existing._id, { title: args.title, state });
      } else {
        await ctx.db.insert("pullRequests", {
          orgId,
          issueId: issue._id,
          repo: args.repo,
          number: args.number,
          title: args.title,
          url: args.url,
          state,
          authorLogin: args.authorLogin,
        });
      }

      // Status transitions, attributed to the GitHub system actor.
      const nextStatus =
        state === "merged" &&
        issue.status !== "done" &&
        issue.status !== "canceled"
          ? ("done" as const)
          : state === "open" &&
              (issue.status === "backlog" ||
                issue.status === "todo" ||
                issue.status === "in_progress")
            ? ("in_review" as const)
            : null;
      if (!nextStatus) {
        continue;
      }

      await ctx.db.patch(issue._id, { status: nextStatus });
      // Close/reopen the synced GitHub issue too (e.g. PR merged → done).
      await scheduleGithubIssueSync(ctx, issue._id);
      await logActivity(ctx, {
        orgId,
        issueId: issue._id,
        systemActor: "github",
        type: "status_changed",
        field: "status",
        oldValue: issue.status,
        newValue: nextStatus,
      });
      const recipients = new Set(
        [issue.creatorId, issue.assigneeId].filter(
          (id): id is NonNullable<typeof id> => id !== undefined
        )
      );
      for (const userId of recipients) {
        await createNotification(ctx, {
          orgId,
          userId,
          systemActor: "github",
          issueId: issue._id,
          type: "status_changed",
          newValue: nextStatus,
        });
      }
    }
    return null;
  },
});
