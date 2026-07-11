import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Shared validators — import these from feature code instead of redefining.
 * The schema is FROZEN for parallel track work: coordinate before editing this file.
 */
export const issueStatusValidator = v.union(
  v.literal("backlog"),
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("in_review"),
  v.literal("done"),
  v.literal("canceled")
);

export const issuePriorityValidator = v.union(
  v.literal("none"),
  v.literal("urgent"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low")
);

export const planValidator = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("enterprise")
);

export const memberRoleValidator = v.union(
  v.literal("admin"),
  v.literal("member")
);

export const projectStatusValidator = v.union(
  v.literal("backlog"),
  v.literal("planned"),
  v.literal("in_progress"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("canceled")
);

export const issueRelationTypeValidator = v.union(
  v.literal("blocks"),
  v.literal("blocked_by"),
  v.literal("related"),
  v.literal("duplicate_of")
);

export const templateCadenceValidator = v.union(
  v.literal("daily"),
  v.literal("weekdays"),
  v.literal("weekly"),
  v.literal("monthly")
);

export const notificationTypeValidator = v.union(
  v.literal("mention"),
  v.literal("assigned"),
  v.literal("status_changed")
);

export default defineSchema({
  // ── Synced from Clerk via webhooks ─────────────────────────────────────
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
  }).index("by_clerk_id", ["clerkId"]),

  organizations: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    plan: planValidator,
    subscriptionStatus: v.optional(v.string()),
  })
    .index("by_clerk_org_id", ["clerkOrgId"])
    .index("by_slug", ["slug"]),

  members: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    role: memberRoleValidator,
    clerkMembershipId: v.string(),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_org_and_user", ["orgId", "userId"])
    .index("by_clerk_membership_id", ["clerkMembershipId"]),

  // ── Workspace structure ────────────────────────────────────────────────
  teams: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    /** Issue prefix, e.g. "ENG" → ENG-123 */
    key: v.string(),
    description: v.optional(v.string()),
    /** Per-team issue number sequence */
    nextIssueNumber: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_key", ["orgId", "key"]),

  issues: defineTable({
    orgId: v.id("organizations"),
    teamId: v.id("teams"),
    /** Per-team sequence number, displayed as KEY-number */
    number: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    status: issueStatusValidator,
    priority: issuePriorityValidator,
    assigneeId: v.optional(v.id("users")),
    creatorId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    cycleId: v.optional(v.id("cycles")),
    parentIssueId: v.optional(v.id("issues")),
    estimate: v.optional(v.number()),
    /** Due date as ms since epoch */
    dueDate: v.optional(v.number()),
    /** Fractional ranking for board/list ordering */
    sortOrder: v.number(),
    /** Embedding for semantic duplicate detection (Track D fills this) */
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_org", ["orgId"])
    .index("by_team", ["teamId"])
    .index("by_team_and_number", ["teamId", "number"])
    .index("by_team_and_status", ["teamId", "status"])
    .index("by_assignee", ["orgId", "assigneeId"])
    .index("by_project", ["projectId"])
    .index("by_cycle", ["cycleId"])
    .index("by_parent", ["parentIssueId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["orgId", "teamId"],
    })
    .searchIndex("search_description", {
      searchField: "description",
      filterFields: ["orgId", "teamId"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["orgId"],
    }),

  labels: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    /** Hex color, e.g. "#5e6ad2" */
    color: v.string(),
  }).index("by_org", ["orgId"]),

  issueLabels: defineTable({
    issueId: v.id("issues"),
    labelId: v.id("labels"),
  })
    .index("by_issue", ["issueId"])
    .index("by_label", ["labelId"]),

  issueRelations: defineTable({
    issueId: v.id("issues"),
    relatedIssueId: v.id("issues"),
    type: issueRelationTypeValidator,
  })
    .index("by_issue", ["issueId"])
    .index("by_related", ["relatedIssueId"]),

  comments: defineTable({
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    authorId: v.id("users"),
    body: v.string(),
    /** User ids @mentioned in the body */
    mentions: v.optional(v.array(v.id("users"))),
  }).index("by_issue", ["issueId"]),

  integrations: defineTable({
    orgId: v.id("organizations"),
    /** Integration kind; only GitHub today */
    type: v.literal("github"),
    enabled: v.boolean(),
    connectedBy: v.id("users"),
    /** GitHub App installation id (set once install completes) */
    installationId: v.optional(v.number()),
    /** Repos the installation grants ("owner/name"), synced from webhooks */
    repositories: v.optional(v.array(v.string())),
    /** Legacy manual-webhook secret; superseded by the app-level secret */
    webhookSecret: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_installation", ["installationId"]),

  /** Single-use nonces binding a GitHub App install back to org + user. */
  githubInstallStates: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    nonce: v.string(),
  }).index("by_nonce", ["nonce"]),

  pullRequests: defineTable({
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    /** "owner/name" */
    repo: v.string(),
    number: v.number(),
    title: v.string(),
    url: v.string(),
    state: v.union(v.literal("open"), v.literal("merged"), v.literal("closed")),
    /** GitHub username of the PR author */
    authorLogin: v.string(),
  })
    .index("by_issue", ["issueId"])
    .index("by_org_repo_number", ["orgId", "repo", "number"]),

  /** GitHub comments mirroring Cohere attachments, so removal can delete them. */
  githubAttachmentComments: defineTable({
    orgId: v.id("organizations"),
    attachmentId: v.id("attachments"),
    /** "owner/name" */
    repo: v.string(),
    /** GitHub comment id */
    commentId: v.number(),
  }).index("by_attachment", ["attachmentId"]),

  /** Saved node positions for the dependency graph, one doc per scope. */
  graphLayouts: defineTable({
    orgId: v.id("organizations"),
    /** "project:<id>" or "cycle:<id>" */
    scopeKey: v.string(),
    positions: v.array(
      v.object({ issueId: v.id("issues"), x: v.number(), y: v.number() })
    ),
  }).index("by_org_scope", ["orgId", "scopeKey"]),

  /** Public read-only share links for individual issues. */
  issueShares: defineTable({
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    /** Unguessable public token; the whole secret of the share URL. */
    token: v.string(),
    createdBy: v.id("users"),
  })
    .index("by_issue", ["issueId"])
    .index("by_token", ["token"]),

  /** Cohere issue ↔ GitHub issue sync links (created by the sync layer). */
  githubIssues: defineTable({
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    /** "owner/name" */
    repo: v.string(),
    /** GitHub issue number */
    number: v.number(),
    url: v.string(),
  })
    .index("by_issue", ["issueId"])
    .index("by_org_repo_number", ["orgId", "repo", "number"]),

  notifications: defineTable({
    orgId: v.id("organizations"),
    /** Recipient */
    userId: v.id("users"),
    /** Absent for automated events — see systemActor */
    actorId: v.optional(v.id("users")),
    /** Automated actor (e.g. the GitHub integration) */
    systemActor: v.optional(v.literal("github")),
    issueId: v.id("issues"),
    type: notificationTypeValidator,
    /** New status value, for status_changed */
    newValue: v.optional(v.string()),
    /** Source comment, for mentions */
    commentId: v.optional(v.id("comments")),
    read: v.boolean(),
  })
    .index("by_user", ["orgId", "userId"])
    .index("by_user_read", ["orgId", "userId", "read"]),

  activity: defineTable({
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    /** Absent for automated events — see systemActor */
    actorId: v.optional(v.id("users")),
    /** Automated actor (e.g. the GitHub integration) */
    systemActor: v.optional(v.literal("github")),
    /** e.g. "created" | "status_changed" | "assigned" | "labeled" | "commented" */
    type: v.string(),
    field: v.optional(v.string()),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
  })
    .index("by_issue", ["issueId"])
    .index("by_org", ["orgId"]),

  projects: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    status: projectStatusValidator,
    leadId: v.optional(v.id("users")),
    /** Target date as ms since epoch */
    targetDate: v.optional(v.number()),
    color: v.optional(v.string()),
    /** Legacy single repo — superseded by githubRepos */
    githubRepo: v.optional(v.string()),
    /** Connected GitHub repos, "owner/name" */
    githubRepos: v.optional(v.array(v.string())),
    /** Who last changed the connected repos */
    githubRepoConnectedBy: v.optional(v.id("users")),
  }).index("by_org", ["orgId"]),

  cycles: defineTable({
    orgId: v.id("organizations"),
    teamId: v.id("teams"),
    /** Per-team cycle sequence: Cycle 1, Cycle 2, ... */
    number: v.number(),
    name: v.optional(v.string()),
    startDate: v.number(),
    endDate: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_number", ["teamId", "number"]),

  attachments: defineTable({
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    uploadedBy: v.id("users"),
  }).index("by_issue", ["issueId"]),

  issueTemplates: defineTable({
    orgId: v.id("organizations"),
    teamId: v.id("teams"),
    creatorId: v.id("users"),
    /** Template name shown in pickers, e.g. "Bug report" */
    name: v.string(),
    /** Prefilled issue title (or title prefix for recurring issues) */
    titlePrefix: v.string(),
    /** Prefilled markdown description body */
    description: v.optional(v.string()),
    priority: issuePriorityValidator,
    labelIds: v.array(v.id("labels")),
    // ── Recurring schedule (rituals) ──
    cadence: v.optional(templateCadenceValidator),
    /** 0 (Sun) – 6 (Sat), for weekly cadence */
    weekday: v.optional(v.number()),
    /** 1–28, for monthly cadence */
    dayOfMonth: v.optional(v.number()),
    /** Next auto-creation time (ms). Set only while recurrence is enabled. */
    nextRunAt: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_team", ["teamId"])
    .index("by_next_run", ["nextRunAt"]),

  views: defineTable({
    orgId: v.id("organizations"),
    creatorId: v.id("users"),
    name: v.string(),
    /** JSON-serialized filter configuration (owned by Track A) */
    filters: v.string(),
    shared: v.boolean(),
  })
    .index("by_org", ["orgId"])
    .index("by_creator", ["creatorId"]),
});
