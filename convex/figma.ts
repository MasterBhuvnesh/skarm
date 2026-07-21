import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  QueryCtx,
} from "./_generated/server";
import { getOrgIssue } from "./issues";
import { logActivity } from "./lib/activity";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import { insertFigmaLink, parseFigmaUrl } from "./lib/figmaLinks";

/**
 * Figma designs linked to issues: previews (name, thumbnail, freshness),
 * comment posting, and Dev Mode resources — all through the org's OAuth
 * token (convex/integrations.ts owns the connect/token lifecycle;
 * convex/lib/figmaLinks.ts owns URL parsing and auto-detection).
 */

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  canceled: "Canceled",
};

export const addLink = orgMutation({
  args: { issueId: v.id("issues"), url: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const issue = await getOrgIssue(ctx, ctx.org._id, args.issueId);
    const url = args.url.trim();
    const parsed = parseFigmaUrl(url);
    if (!parsed) {
      throw new Error(
        "That doesn't look like a Figma link (expected figma.com/design/… or /file/…)"
      );
    }
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_org_and_type", (q) =>
        q.eq("orgId", ctx.org._id).eq("type", "figma")
      )
      .unique();
    if (!integration?.enabled || !integration.figmaAccessToken) {
      throw new Error("Connect Figma in Settings → Integrations first");
    }

    const linkId = await insertFigmaLink(ctx, {
      orgId: ctx.org._id,
      issueId: issue._id,
      addedBy: ctx.user._id,
      url,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
    });
    if (linkId) {
      await logActivity(ctx, {
        orgId: ctx.org._id,
        issueId: issue._id,
        actorId: ctx.user._id,
        type: "figma_linked",
        field: "figma",
      });
    }
    return null;
  },
});

export const removeLink = orgMutation({
  args: { linkId: v.id("figmaLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link || link.orgId !== ctx.org._id) {
      throw new Error("Link not found");
    }
    if (link.devResourceId) {
      await ctx.scheduler.runAfter(0, internal.figma.deleteDevResource, {
        orgId: link.orgId,
        fileKey: link.fileKey,
        devResourceId: link.devResourceId,
      });
    }
    await ctx.db.delete(link._id);
    return null;
  },
});

export const listByIssue = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.array(
    v.object({
      _id: v.id("figmaLinks"),
      url: v.string(),
      name: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      lastModified: v.optional(v.number()),
      inDevMode: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    await getOrgIssue(ctx, ctx.org._id, args.issueId);
    const links = await ctx.db
      .query("figmaLinks")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    return links.map((link) => ({
      _id: link._id,
      url: link.url,
      name: link.name,
      thumbnailUrl: link.thumbnailUrl,
      lastModified: link.lastModified,
      inDevMode: link.devResourceId !== undefined,
    }));
  },
});

/** Re-fetch previews (name/thumbnail/freshness) for every link on an issue. */
export const refreshPreviews = orgMutation({
  args: { issueId: v.id("issues") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getOrgIssue(ctx, ctx.org._id, args.issueId);
    const links = await ctx.db
      .query("figmaLinks")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    for (const link of links) {
      await ctx.scheduler.runAfter(0, internal.figma.fetchPreview, {
        linkId: link._id,
      });
    }
    return null;
  },
});

// ── Internal queries / mutations for the actions ───────────────────────────

const authFields = {
  accessToken: v.string(),
  refreshToken: v.string(),
  expiresAt: v.optional(v.number()),
};

type FigmaAuth = {
  orgId: Id<"organizations">;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
};

async function figmaAuthForOrg(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">
): Promise<FigmaAuth | null> {
  const integration = await ctx.db
    .query("integrations")
    .withIndex("by_org_and_type", (q) =>
      q.eq("orgId", orgId).eq("type", "figma")
    )
    .unique();
  if (!integration?.enabled || !integration.figmaAccessToken) {
    return null;
  }
  return {
    orgId,
    accessToken: integration.figmaAccessToken,
    refreshToken: integration.figmaRefreshToken ?? "",
    expiresAt: integration.figmaTokenExpiresAt,
  };
}

export const getLinkForFetch = internalQuery({
  args: { linkId: v.id("figmaLinks") },
  returns: v.union(
    v.null(),
    v.object({
      orgId: v.id("organizations"),
      issueId: v.id("issues"),
      fileKey: v.string(),
      nodeId: v.optional(v.string()),
      devResourceId: v.optional(v.string()),
      /** For pushing a Dev Mode resource: ENG-42 · Status · Title @ url */
      identifier: v.string(),
      issueTitle: v.string(),
      issueStatus: v.string(),
      orgSlug: v.optional(v.string()),
      ...authFields,
    })
  ),
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) {
      return null;
    }
    const auth = await figmaAuthForOrg(ctx, link.orgId);
    if (!auth) {
      return null;
    }
    const issue = await ctx.db.get(link.issueId);
    if (!issue) {
      return null;
    }
    const team = await ctx.db.get(issue.teamId);
    const org = await ctx.db.get(link.orgId);
    return {
      orgId: link.orgId,
      issueId: link.issueId,
      fileKey: link.fileKey,
      nodeId: link.nodeId,
      devResourceId: link.devResourceId,
      identifier: `${team?.key ?? "?"}-${issue.number}`,
      issueTitle: issue.title,
      issueStatus: issue.status,
      orgSlug: org?.slug,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
    };
  },
});

/** Auth + all links for an issue — powers comment posting and dev sync. */
export const getIssueFigmaContext = internalQuery({
  args: { issueId: v.id("issues") },
  returns: v.union(
    v.null(),
    v.object({
      orgId: v.id("organizations"),
      identifier: v.string(),
      issueTitle: v.string(),
      issueStatus: v.string(),
      orgSlug: v.optional(v.string()),
      links: v.array(
        v.object({
          linkId: v.id("figmaLinks"),
          fileKey: v.string(),
          nodeId: v.optional(v.string()),
          devResourceId: v.optional(v.string()),
        })
      ),
      ...authFields,
    })
  ),
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) {
      return null;
    }
    const auth = await figmaAuthForOrg(ctx, issue.orgId);
    if (!auth) {
      return null;
    }
    const team = await ctx.db.get(issue.teamId);
    const org = await ctx.db.get(issue.orgId);
    const links = await ctx.db
      .query("figmaLinks")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    return {
      orgId: issue.orgId,
      identifier: `${team?.key ?? "?"}-${issue.number}`,
      issueTitle: issue.title,
      issueStatus: issue.status,
      orgSlug: org?.slug,
      links: links.map((link) => ({
        linkId: link._id,
        fileKey: link.fileKey,
        nodeId: link.nodeId,
        devResourceId: link.devResourceId,
      })),
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
    };
  },
});

export const saveTokens = internalMutation({
  args: {
    orgId: v.id("organizations"),
    accessToken: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_org_and_type", (q) =>
        q.eq("orgId", args.orgId).eq("type", "figma")
      )
      .unique();
    if (integration) {
      await ctx.db.patch(integration._id, {
        figmaAccessToken: args.accessToken,
        figmaTokenExpiresAt: args.expiresAt,
      });
    }
    return null;
  },
});

export const savePreview = internalMutation({
  args: {
    linkId: v.id("figmaLinks"),
    name: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    lastModified: v.optional(v.number()),
    devResourceId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { linkId, ...fields } = args;
    const link = await ctx.db.get(linkId);
    if (link) {
      await ctx.db.patch(link._id, fields);
    }
    return null;
  },
});

// ── Figma REST plumbing ────────────────────────────────────────────────────

async function figmaFetch<T>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`https://api.figma.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Figma ${method} ${path} failed (${response.status}): ${text.slice(0, 200)}`
    );
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Valid access token for the org, refreshing (and persisting) if expired. */
async function ensureToken(
  ctx: ActionCtx,
  auth: {
    orgId: Id<"organizations">;
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
  }
): Promise<string> {
  if (!auth.expiresAt || auth.expiresAt > Date.now() + 60_000) {
    return auth.accessToken;
  }
  const clientId = process.env.FIGMA_CLIENT_ID;
  const clientSecret = process.env.FIGMA_CLIENT_SECRET;
  if (!clientId || !clientSecret || !auth.refreshToken) {
    throw new Error("Figma token expired and refresh is not configured");
  }
  const response = await fetch("https://api.figma.com/v1/oauth/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ refresh_token: auth.refreshToken }),
  });
  if (!response.ok) {
    throw new Error(`Figma token refresh failed (${response.status})`);
  }
  const refreshed = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };
  await ctx.runMutation(internal.figma.saveTokens, {
    orgId: auth.orgId,
    accessToken: refreshed.access_token,
    expiresAt: refreshed.expires_in
      ? Date.now() + refreshed.expires_in * 1000
      : undefined,
  });
  return refreshed.access_token;
}

function devResourceName(
  identifier: string,
  status: string,
  title: string
): string {
  const label = STATUS_LABELS[status] ?? status;
  return `${identifier} · ${label} · ${title}`.slice(0, 120);
}

// ── Actions ────────────────────────────────────────────────────────────────

/**
 * Fill in a link's name, thumbnail, and freshness; for frame links, also
 * push a Dev Mode resource pointing back at the Skarm issue.
 */
export const fetchPreview = internalAction({
  args: { linkId: v.id("figmaLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(internal.figma.getLinkForFetch, {
      linkId: args.linkId,
    });
    if (!info) {
      return null;
    }
    try {
      const token = await ensureToken(ctx, info);

      let name: string | undefined;
      let thumbnailUrl: string | undefined;
      let lastModified: number | undefined;
      if (info.nodeId) {
        const nodes = await figmaFetch<{
          name?: string;
          lastModified?: string;
          nodes?: Record<string, { document?: { name?: string } }>;
        }>(
          token,
          "GET",
          `/v1/files/${info.fileKey}/nodes?ids=${encodeURIComponent(info.nodeId)}&depth=1`
        );
        name =
          nodes.nodes?.[info.nodeId]?.document?.name ?? nodes.name ?? undefined;
        lastModified = nodes.lastModified
          ? Date.parse(nodes.lastModified)
          : undefined;
        const images = await figmaFetch<{
          images?: Record<string, string | null>;
        }>(
          token,
          "GET",
          `/v1/images/${info.fileKey}?ids=${encodeURIComponent(info.nodeId)}&format=png&scale=1`
        );
        thumbnailUrl = images.images?.[info.nodeId] ?? undefined;
      } else {
        const file = await figmaFetch<{
          name?: string;
          thumbnailUrl?: string;
          lastModified?: string;
        }>(token, "GET", `/v1/files/${info.fileKey}?depth=1`);
        name = file.name;
        thumbnailUrl = file.thumbnailUrl;
        lastModified = file.lastModified
          ? Date.parse(file.lastModified)
          : undefined;
      }

      // Dev Mode resource: only for frame links, once, and only when the
      // public app origin is known.
      let devResourceId = info.devResourceId;
      if (info.nodeId && !devResourceId && info.orgSlug) {
        try {
          const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
          const created = await figmaFetch<{
            links_created?: { id: string }[];
          }>(token, "POST", "/v1/dev_resources", {
            dev_resources: [
              {
                name: devResourceName(
                  info.identifier,
                  info.issueStatus,
                  info.issueTitle
                ),
                url: `${siteUrl}/${info.orgSlug}/issue/${info.issueId}`,
                file_key: info.fileKey,
                node_id: info.nodeId,
              },
            ],
          });
          devResourceId = created.links_created?.[0]?.id;
        } catch (error) {
          // Missing file_dev_resources:write scope is fine — previews still work.
          console.error("Figma dev resource create failed", error);
        }
      }

      await ctx.runMutation(internal.figma.savePreview, {
        linkId: args.linkId,
        name,
        thumbnailUrl,
        lastModified,
        devResourceId,
      });
    } catch (error) {
      // The raw URL still works as a plain link; just log the miss.
      console.error("Figma preview fetch failed", error);
    }
    return null;
  },
});

/** Post a comment to every design linked to the issue. */
export const pushComment = internalAction({
  args: {
    issueId: v.id("issues"),
    authorName: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.figma.getIssueFigmaContext, {
      issueId: args.issueId,
    });
    if (!context || context.links.length === 0) {
      return null;
    }
    try {
      const token = await ensureToken(ctx, context);
      const message = `${args.authorName} via Skarm ${context.identifier}: ${args.body}`;
      for (const link of context.links) {
        try {
          await figmaFetch(
            token,
            "POST",
            `/v1/files/${link.fileKey}/comments`,
            {
              message,
              ...(link.nodeId
                ? {
                    client_meta: {
                      node_id: link.nodeId,
                      node_offset: { x: 0, y: 0 },
                    },
                  }
                : {}),
            }
          );
        } catch (error) {
          console.error("Figma comment post failed", error);
        }
      }
    } catch (error) {
      console.error("Figma comment auth failed", error);
    }
    return null;
  },
});

/** Rename pushed Dev Mode resources after a title/status change. */
export const updateDevResources = internalAction({
  args: { issueId: v.id("issues") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.figma.getIssueFigmaContext, {
      issueId: args.issueId,
    });
    const targets = context?.links.filter((link) => link.devResourceId) ?? [];
    if (!context || targets.length === 0) {
      return null;
    }
    try {
      const token = await ensureToken(ctx, context);
      const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
      const url = `${siteUrl}/${context.orgSlug}/issue/${args.issueId}`;
      const name = devResourceName(
        context.identifier,
        context.issueStatus,
        context.issueTitle
      );
      // PUT requires the dev_resources array with id + name + url per entry
      // (url is mandatory even when unchanged).
      await figmaFetch(token, "PUT", "/v1/dev_resources", {
        dev_resources: targets.map((link) => ({
          id: link.devResourceId,
          name,
          url,
        })),
      });
    } catch (error) {
      console.error("Figma dev resource update failed", error);
    }
    return null;
  },
});

export const getOrgFigmaAuth = internalQuery({
  args: { orgId: v.id("organizations") },
  returns: v.union(
    v.null(),
    v.object({ orgId: v.id("organizations"), ...authFields })
  ),
  handler: async (ctx, args) => {
    return await figmaAuthForOrg(ctx, args.orgId);
  },
});

/** Remove the Dev Mode resource when its link is removed. */
export const deleteDevResource = internalAction({
  args: {
    orgId: v.id("organizations"),
    fileKey: v.string(),
    devResourceId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await ctx.runQuery(internal.figma.getOrgFigmaAuth, {
      orgId: args.orgId,
    });
    if (!auth) {
      return null;
    }
    try {
      const token = await ensureToken(ctx, auth);
      await figmaFetch(
        token,
        "DELETE",
        `/v1/files/${args.fileKey}/dev_resources/${args.devResourceId}`
      );
    } catch (error) {
      console.error("Figma dev resource delete failed", error);
    }
    return null;
  },
});
