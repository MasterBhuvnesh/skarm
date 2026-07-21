import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";
import { issueShape } from "./issues";
import { logActivity } from "./lib/activity";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import { assertCanCreateProject } from "./lib/limits";
import { projectStatusValidator } from "./schema";

export const projectShape = {
  _id: v.id("projects"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  name: v.string(),
  description: v.optional(v.string()),
  status: projectStatusValidator,
  leadId: v.optional(v.id("users")),
  targetDate: v.optional(v.number()),
  color: v.optional(v.string()),
  /** Legacy single repo - superseded by githubRepos */
  githubRepo: v.optional(v.string()),
  githubRepos: v.optional(v.array(v.string())),
  githubRepoConnectedBy: v.optional(v.id("users")),
};

/** Issue counts by status - the project progress primitive. */
export const progressShape = v.object({
  total: v.number(),
  backlog: v.number(),
  todo: v.number(),
  in_progress: v.number(),
  in_review: v.number(),
  done: v.number(),
  canceled: v.number(),
});

/** Verify a project belongs to the caller's org before any read/write. */
async function getOrgProject(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  projectId: Id<"projects">
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project || project.orgId !== orgId) {
    throw new Error("Project not found");
  }
  return project;
}

async function countProgress(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  projectId: Id<"projects">
) {
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const progress = {
    total: 0,
    backlog: 0,
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    canceled: 0,
  };
  for (const issue of issues) {
    if (issue.orgId !== orgId) {
      continue;
    }
    progress.total += 1;
    progress[issue.status] += 1;
  }
  return progress;
}

/** Lightweight project list for pickers (no progress computation). */
export const list = orgQuery({
  args: {},
  returns: v.array(v.object(projectShape)),
  handler: async (ctx) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .collect();
  },
});

/** Projects with issue counts by status - powers the projects index page. */
export const listWithProgress = orgQuery({
  args: {},
  returns: v.array(v.object({ ...projectShape, progress: progressShape })),
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .collect();
    return await Promise.all(
      projects.map(async (project) => ({
        ...project,
        progress: await countProgress(ctx, ctx.org._id, project._id),
      }))
    );
  },
});

export const get = orgQuery({
  args: { projectId: v.id("projects") },
  returns: v.union(v.object(projectShape), v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.orgId !== ctx.org._id) {
      return null;
    }
    return project;
  },
});

/** All issues assigned to a project (project detail page computes progress from this). */
export const listIssues = orgQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(v.object(issueShape)),
  handler: async (ctx, args) => {
    await getOrgProject(ctx, ctx.org._id, args.projectId);
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return issues.filter((issue) => issue.orgId === ctx.org._id);
  },
});

/**
 * Recent org issues NOT already in the given project - candidates for the
 * "add issues to project" picker. Assignment itself goes through
 * `issues.update` (projectId arg).
 */
export const candidateIssues = orgQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(v.object(issueShape)),
  handler: async (ctx, args) => {
    await getOrgProject(ctx, ctx.org._id, args.projectId);
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .order("desc")
      .take(500);
    return issues
      .filter((issue) => issue.projectId !== args.projectId)
      .slice(0, 200);
  },
});

export const create = orgMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    status: v.optional(projectStatusValidator),
    leadId: v.optional(v.id("users")),
    targetDate: v.optional(v.number()),
    color: v.optional(v.string()),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Project name is required");
    }
    await assertCanCreateProject(ctx, ctx.org);

    if (args.leadId) {
      const membership = await ctx.db
        .query("members")
        .withIndex("by_org_and_user", (q) =>
          q.eq("orgId", ctx.org._id).eq("userId", args.leadId!)
        )
        .unique();
      if (!membership) {
        throw new Error("Project lead must be a member of this organization");
      }
    }

    return await ctx.db.insert("projects", {
      orgId: ctx.org._id,
      name,
      description: args.description,
      status: args.status ?? "planned",
      leadId: args.leadId,
      targetDate: args.targetDate,
      color: args.color,
    });
  },
});

export const update = orgMutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    status: v.optional(projectStatusValidator),
    leadId: v.optional(v.union(v.id("users"), v.null())),
    targetDate: v.optional(v.union(v.number(), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
    githubRepos: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getOrgProject(ctx, ctx.org._id, args.projectId);

    const updates: Partial<Doc<"projects">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new Error("Project name is required");
      }
      updates.name = name;
    }
    if (args.description !== undefined) {
      updates.description = args.description ?? undefined;
    }
    if (args.status !== undefined) {
      updates.status = args.status;
    }
    if (args.leadId !== undefined) {
      if (args.leadId !== null) {
        const membership = await ctx.db
          .query("members")
          .withIndex("by_org_and_user", (q) =>
            q.eq("orgId", ctx.org._id).eq("userId", args.leadId!)
          )
          .unique();
        if (!membership) {
          throw new Error(
            "Project lead must be a member of this organization"
          );
        }
      }
      updates.leadId = args.leadId ?? undefined;
    }
    if (args.targetDate !== undefined) {
      updates.targetDate = args.targetDate ?? undefined;
    }
    if (args.color !== undefined) {
      updates.color = args.color ?? undefined;
    }
    if (args.githubRepos !== undefined) {
      const repos = [...new Set(args.githubRepos.map((r) => r.trim()))].filter(
        Boolean
      );
      for (const repo of repos) {
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
          throw new Error(`"${repo}" must look like owner/name`);
        }
      }
      updates.githubRepos = repos.length > 0 ? repos.sort() : undefined;
      updates.githubRepoConnectedBy =
        repos.length > 0 ? ctx.user._id : undefined;
      updates.githubRepo = undefined; // retire the legacy single-repo field
    }

    await ctx.db.patch(project._id, updates);
    return null;
  },
});

/** Delete a project and detach its issues (issues themselves are kept). */
export const remove = orgMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getOrgProject(ctx, ctx.org._id, args.projectId);

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    for (const issue of issues) {
      if (issue.orgId !== ctx.org._id) {
        continue;
      }
      await ctx.db.patch(issue._id, { projectId: undefined });
      await logActivity(ctx, {
        orgId: ctx.org._id,
        issueId: issue._id,
        actorId: ctx.user._id,
        type: "project_changed",
        field: "project",
        oldValue: project.name,
        newValue: undefined,
      });
    }

    await ctx.db.delete(project._id);
    return null;
  },
});
