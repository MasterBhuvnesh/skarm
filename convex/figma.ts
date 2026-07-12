import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { getOrgIssue } from "./issues";
import { logActivity } from "./lib/activity";
import { orgMutation, orgQuery } from "./lib/customFunctions";

/**
 * Figma designs linked to issues. A link stores the parsed file key +
 * node id; a scheduled action fetches the design's name and a rendered
 * thumbnail through the Figma REST API using the org's OAuth token
 * (convex/integrations.ts owns the connect/token lifecycle).
 */

/** figma.com/file|design|proto|board/<key>/…?node-id=1-2 */
function parseFigmaUrl(
  raw: string
): { fileKey: string; nodeId?: string } | null {
  const match = raw.match(
    /^https:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/
  );
  if (!match) {
    return null;
  }
  let nodeId: string | undefined;
  try {
    nodeId =
      new URL(raw).searchParams.get("node-id")?.replace("-", ":") ?? undefined;
  } catch {
    return null;
  }
  return { fileKey: match[1], nodeId };
}

export const addLink = orgMutation({
  args: { issueId: v.id("issues"), url: v.string() },
  returns: v.id("figmaLinks"),
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
      throw new Error(
        "Connect Figma in Settings → Integrations first"
      );
    }

    const linkId = await ctx.db.insert("figmaLinks", {
      orgId: ctx.org._id,
      issueId: issue._id,
      url,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
      addedBy: ctx.user._id,
    });
    await logActivity(ctx, {
      orgId: ctx.org._id,
      issueId: issue._id,
      actorId: ctx.user._id,
      type: "figma_linked",
      field: "figma",
    });
    await ctx.scheduler.runAfter(0, internal.figma.fetchPreview, { linkId });
    return linkId;
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
    }));
  },
});

// ── Preview fetching (internal) ────────────────────────────────────────────

export const getLinkForFetch = internalQuery({
  args: { linkId: v.id("figmaLinks") },
  returns: v.union(
    v.null(),
    v.object({
      orgId: v.id("organizations"),
      fileKey: v.string(),
      nodeId: v.optional(v.string()),
      accessToken: v.string(),
      refreshToken: v.string(),
      expiresAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) {
      return null;
    }
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_org_and_type", (q) =>
        q.eq("orgId", link.orgId).eq("type", "figma")
      )
      .unique();
    if (!integration?.enabled || !integration.figmaAccessToken) {
      return null;
    }
    return {
      orgId: link.orgId,
      fileKey: link.fileKey,
      nodeId: link.nodeId,
      accessToken: integration.figmaAccessToken,
      refreshToken: integration.figmaRefreshToken ?? "",
      expiresAt: integration.figmaTokenExpiresAt,
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (link) {
      await ctx.db.patch(link._id, {
        name: args.name,
        thumbnailUrl: args.thumbnailUrl,
      });
    }
    return null;
  },
});

async function figmaFetch<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://api.figma.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      `Figma GET ${path} failed (${response.status}): ${(await response.text()).slice(0, 200)}`
    );
  }
  return (await response.json()) as T;
}

/** Fill in a link's design name + thumbnail via the Figma REST API. */
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
      let token = info.accessToken;
      // Refresh when the OAuth token is (nearly) expired.
      if (info.expiresAt && info.expiresAt < Date.now() + 60_000) {
        const clientId = process.env.FIGMA_CLIENT_ID;
        const clientSecret = process.env.FIGMA_CLIENT_SECRET;
        if (!clientId || !clientSecret || !info.refreshToken) {
          throw new Error("Figma token expired and refresh is not configured");
        }
        const response = await fetch("https://api.figma.com/v1/oauth/refresh", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          },
          body: new URLSearchParams({ refresh_token: info.refreshToken }),
        });
        if (!response.ok) {
          throw new Error(`Figma token refresh failed (${response.status})`);
        }
        const refreshed = (await response.json()) as {
          access_token: string;
          expires_in?: number;
        };
        token = refreshed.access_token;
        await ctx.runMutation(internal.figma.saveTokens, {
          orgId: info.orgId,
          accessToken: token,
          expiresAt: refreshed.expires_in
            ? Date.now() + refreshed.expires_in * 1000
            : undefined,
        });
      }

      let name: string | undefined;
      let thumbnailUrl: string | undefined;
      if (info.nodeId) {
        const nodes = await figmaFetch<{
          name?: string;
          nodes?: Record<string, { document?: { name?: string } }>;
        }>(
          token,
          `/v1/files/${info.fileKey}/nodes?ids=${encodeURIComponent(info.nodeId)}&depth=1`
        );
        name =
          nodes.nodes?.[info.nodeId]?.document?.name ?? nodes.name ?? undefined;
        const images = await figmaFetch<{
          images?: Record<string, string | null>;
        }>(
          token,
          `/v1/images/${info.fileKey}?ids=${encodeURIComponent(info.nodeId)}&format=png&scale=1`
        );
        thumbnailUrl = images.images?.[info.nodeId] ?? undefined;
      } else {
        const file = await figmaFetch<{
          name?: string;
          thumbnailUrl?: string;
        }>(token, `/v1/files/${info.fileKey}?depth=1`);
        name = file.name;
        thumbnailUrl = file.thumbnailUrl;
      }

      await ctx.runMutation(internal.figma.savePreview, {
        linkId: args.linkId,
        name,
        thumbnailUrl,
      });
    } catch (error) {
      // The raw URL still works as a plain link; just log the miss.
      console.error("Figma preview fetch failed", error);
    }
    return null;
  },
});
