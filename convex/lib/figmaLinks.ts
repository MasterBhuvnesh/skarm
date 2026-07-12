import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import { logActivity } from "./activity";

/**
 * Figma-link plumbing shared by convex/figma.ts (the + button),
 * convex/issues.ts and convex/comments.ts (URL auto-detection). Lives in
 * lib/ so issues.ts can use it without an issues ↔ figma import cycle.
 */

export const FIGMA_URL_REGEX =
  /https:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board)\/[^\s)\]>"']+/g;

/** figma.com/file|design|proto|board/<key>/…?node-id=1-2 */
export function parseFigmaUrl(
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

/**
 * Insert a link (skipping duplicates of the same file+node on the issue)
 * and schedule the preview fetch. Returns null for duplicates.
 */
export async function insertFigmaLink(
  ctx: MutationCtx,
  args: {
    orgId: Id<"organizations">;
    issueId: Id<"issues">;
    addedBy: Id<"users">;
    url: string;
    fileKey: string;
    nodeId?: string;
  }
): Promise<Id<"figmaLinks"> | null> {
  const existing = await ctx.db
    .query("figmaLinks")
    .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
    .collect();
  if (
    existing.some(
      (link) => link.fileKey === args.fileKey && link.nodeId === args.nodeId
    )
  ) {
    return null;
  }
  const linkId = await ctx.db.insert("figmaLinks", {
    orgId: args.orgId,
    issueId: args.issueId,
    url: args.url,
    fileKey: args.fileKey,
    nodeId: args.nodeId,
    addedBy: args.addedBy,
  });
  await ctx.scheduler.runAfter(0, internal.figma.fetchPreview, { linkId });
  return linkId;
}

/**
 * Auto-detect figma.com URLs in free text (descriptions, comments) and
 * attach them to the issue's Figma panel. No-op when the integration is
 * not connected/enabled.
 */
export async function autoLinkFigmaUrls(
  ctx: MutationCtx,
  args: {
    orgId: Id<"organizations">;
    issueId: Id<"issues">;
    actorId: Id<"users">;
    text: string | undefined;
  }
): Promise<void> {
  const urls = [...new Set(args.text?.match(FIGMA_URL_REGEX) ?? [])];
  if (urls.length === 0) {
    return;
  }
  const integration = await ctx.db
    .query("integrations")
    .withIndex("by_org_and_type", (q) =>
      q.eq("orgId", args.orgId).eq("type", "figma")
    )
    .unique();
  if (!integration?.enabled || !integration.figmaAccessToken) {
    return;
  }
  let added = false;
  for (const url of urls) {
    const parsed = parseFigmaUrl(url);
    if (!parsed) {
      continue;
    }
    const linkId = await insertFigmaLink(ctx, {
      orgId: args.orgId,
      issueId: args.issueId,
      addedBy: args.actorId,
      url,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
    });
    added = added || linkId !== null;
  }
  if (added) {
    await logActivity(ctx, {
      orgId: args.orgId,
      issueId: args.issueId,
      actorId: args.actorId,
      type: "figma_linked",
      field: "figma",
    });
  }
}

/**
 * After a title/status change, keep pushed Dev Mode resources ("ENG-42 ·
 * In Progress · …") in sync. Cheap no-op when nothing was pushed.
 */
export async function scheduleFigmaDevSync(
  ctx: MutationCtx,
  issueId: Id<"issues">
): Promise<void> {
  const links = await ctx.db
    .query("figmaLinks")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();
  if (links.some((link) => link.devResourceId)) {
    await ctx.scheduler.runAfter(0, internal.figma.updateDevResources, {
      issueId,
    });
  }
}
