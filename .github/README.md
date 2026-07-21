<div align="center">

<img src="../public/skarm-tile.svg" alt="Skarm logo" width="80" />

# SKARM

A modern issue tracker for teams that plan, track, and ship together. Multi-tenant workspaces, real-time boards, B2B billing, an AI agent, a dependency graph, and two-way GitHub + Figma sync, built with Next.js 16, Convex, and Clerk.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Convex](https://img.shields.io/badge/Convex-Backend-ff6b35?logo=convex)](https://convex.dev)
[![Clerk](https://img.shields.io/badge/Clerk-Auth%20%2B%20Billing-6c47ff?logo=clerk)](https://clerk.com)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind%20CSS-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript)](https://www.typescriptlang.org/)

</div>

## FEATURES

### ISSUES AND BOARDS

- Full issue tracking: statuses, five priority levels, assignees, estimates, due dates, labels
- Team-scoped issue keys (`ENG-42`, `DESIGN-7`) with per-team sequences
- Kanban board with drag and drop (@dnd-kit) and fractional sort ordering; moves sync to all clients instantly
- Full-text search over issue titles AND descriptions, with search bars on the issues list and board views showing why a result matched
- Issue templates per team (prefilled title, description, priority, labels) and recurring issues: rituals like weekly standups created automatically on a daily/weekdays/weekly/monthly cadence
- Duplicate warning at creation: typing a title live-searches the whole workspace and surfaces similar issues before you file a twin
- Built to scale: cursor-paginated issue queries (auto-loading list, per-column board pagination) and CSS content-visibility virtualization keep 10k-issue orgs fast
- My Issues dashboard on the workspace home: assigned to you grouped by status, created by you, with a closed-issues toggle
- Command palette (Cmd+K) and single-key shortcuts

### COLLABORATION

- Comments with @mentions, emoji reactions (👍 ❤️ 😄 🎉 👀 🚀 with who-reacted tooltips), one-level reply threads, and a full activity feed per issue
- Inbox with tabs (All / Mentions / Assigned / Status / GitHub), unread counts per tab, and a live unread badge in the sidebar
- Notification preferences: per-channel switches (mentions, assignments, status changes, GitHub activity) enforced at the single server-side notification choke point
- Email digests via AWS SES: each member picks morning/evening delivery, daily/weekly/custom weekdays, and content sections (assigned, in progress, mentions, needs-focus); empty digests are skipped and delivery follows the member's local timezone
- Sub-issues and issue relations (blocks, blocked by, related, duplicate of)
- File attachments via Convex storage
- Live presence: see who is viewing the same issue
- Public issue sharing: read-only links with an OG preview card for unfurls and print-to-PDF export; revocable instantly

### PROJECTS AND CYCLES

- Projects group issues across teams with statuses, leads, target dates, and live progress
- Cycles are time-boxed sprints per team, auto-numbered with current-cycle tracking
- Cycle analytics: burndown chart with ideal guideline, velocity across recent cycles, and scope-change tracking (added/removed points), reconstructed from the activity log
- Dependency graph: a React Flow canvas mapping a project or cycle's issues as nodes with their blocks/related/duplicate relations as directed edges; drag issues in, draw links, auto-arrange by blocking depth, and layouts persist per scope
- Unlimited teams per organization, each with its own board and cycles

### INTEGRATIONS

**GitHub** (GitHub App, per-org OAuth-style install)

- One-click connect: users pick repositories on GitHub's install screen; the repo list is pulled from the API, no manual webhook setup per workspace
- Projects connect one or more repos (live-fetched picker with Public/Private badges, shows who connected)
- "Also create this issue on GitHub" at creation; edits, status changes, and attachments mirror to the GitHub twin (merged PR → Done closes it)
- Two-way sync: editing, closing/reopening, or commenting on the linked GitHub issue reflects back into Skarm; bot echoes are filtered to avoid loops
- PRs link to issues via `ENG-42` in branch names, titles, or bodies; opened PRs move issues to In Review, merged PRs to Done
- All automated events appear in the timeline and inbox as a dedicated GitHub system actor, never as a user

**Figma** (OAuth, granular scopes)

- Connect once per workspace; attach designs to issues by pasting a Figma link (or it auto-detects figma.com URLs in descriptions and comments)
- Live preview: design name, rendered thumbnail, and an "edited Xh ago" freshness stamp fetched via the Figma REST API
- Post issue comments to the linked design; frame links push a "ENG-42 · Status · Title" resource into Figma Dev Mode that links back and stays in sync

### AI AGENT (PRO AND ENTERPRISE)

- Workspace-aware chat with org-scoped tools: create, update, and search issues, summarize cycles, report project status
- AI issue drafting: one-line idea → full spec with acceptance criteria, priority, estimate, labels, sub-issues, and relations to real existing issues - with prompt guidance, length control (short → thorough), rephrase, and discard
- Duplicate detection via 4096-dim vector embeddings (NVIDIA NV-Embed) on every issue
- Triage assist: AI-suggested priority and labels for new issues
- Chat and drafting share one allowance: 50 messages/user/day on Pro, unlimited on Enterprise

### BILLING AND MULTI-TENANCY

- Every workspace is a Clerk organization; users, memberships, and subscriptions sync to Convex via Svix-verified webhooks
- Clerk B2B billing handles checkout, plan changes, and invoices
- Two-layer plan gating: `has({ plan })` in the UI is cosmetic, Convex mutations are the real enforcement
- Free-tier limits (seats, projects, issues) enforced server-side with upgrade prompts in the UI

## PRICING TIERS

|                  | Free | Pro ($20/mo)         | Enterprise ($99/mo) |
| ---------------- | ---- | -------------------- | ------------------- |
| Members          | 3    | 10 (+$10/seat)       | Unlimited           |
| Projects         | 2    | Unlimited            | Unlimited           |
| Issues           | 100  | Unlimited            | Unlimited           |
| AI agent         | No   | 50 msgs/user/day     | Unlimited           |
| Priority support | No   | No                   | Yes                 |

## ARCHITECTURE

```mermaid
flowchart TB
    Browser[Next.js Frontend] -->|"useQuery / useMutation"| Convex[Convex Backend]
    Convex -->|"Real-time sync"| Browser
    Clerk[Clerk Auth + Orgs + Billing] -->|"Svix Webhooks"| ConvexHTTP["Convex HTTP /clerk-webhook"]
    ConvexHTTP -->|"Sync users, orgs, members, subscriptions"| Convex
    GitHub[GitHub App] -->|"HMAC webhooks: installs, PRs, issues"| GHHTTP["Convex HTTP /github-webhook"]
    GHHTTP --> Convex
    Convex -->|"Issue + repo sync via installation tokens"| GitHub
    Convex <-->|"OAuth: previews, comments, dev resources"| Figma[Figma REST API]
    Convex -->|"Agent tools + embeddings"| NVIDIA[NVIDIA NIM]
    Convex -->|"Email digests via SMTP"| SES[AWS SES]
    Convex -->|"File storage"| Storage[Convex Storage]
    Browser -->|"proxy.ts middleware"| Clerk
```

Key concepts:

- `orgQuery` / `orgMutation` wrappers resolve the user, org, and membership from the Clerk JWT and enforce org scoping on every Convex function (the Convex answer to RLS)
- Clerk is the source of truth: `users`, `organizations`, and `members` tables are only written by webhooks
- Route groups: `(marketing)` is the public site, `(app)/[orgSlug]` is the authenticated workspace
- `proxy.ts` replaces `middleware.ts` in Next.js 16 for route protection

## GETTING STARTED

```bash
pnpm install
pnpm dev   # runs Next.js and Convex in parallel
```

Full setup lives in [`.docs/CONFIGURE.md`](../.docs/CONFIGURE.md):

- **App setup** - `.env.local`, Clerk (JWT template, billing plans, webhooks), Convex env vars, deployment, and a troubleshooting table
- **GitHub integration** - creating the GitHub App (webhook + setup URLs, permissions), `GITHUB_APP_SLUG` / `GITHUB_WEBHOOK_SECRET` / `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` (base64) env vars, and how the install → webhook → sync flow works
- **Figma integration** - creating the Figma OAuth app (redirect URI, granular scopes) and the `FIGMA_CLIENT_ID` / `FIGMA_CLIENT_SECRET` env vars
- **Email digests** - SES SMTP env vars (`SES_SMTP_USER/PASSWORD/HOST`, `SES_FROM_EMAIL`, `APP_URL`), sandbox caveats, and the hourly delivery sweep
- **AI models** - where the chat + embedding models live (`convex/agent/models.ts`) and the vector-index dimension rule for swapping embedding models

Once configured: open [http://localhost:3000](http://localhost:3000), sign up, create an organization, and you are in.

## DATABASE SCHEMA

All tables are defined in [`convex/schema.ts`](../convex/schema.ts).

| Table                    | Purpose                          | Key fields                                                             |
| ------------------------ | -------------------------------- | ---------------------------------------------------------------------- |
| users                    | Synced from Clerk via webhooks   | `clerkId`, `name`, `email`, `imageUrl`                                 |
| organizations            | Synced from Clerk Organizations  | `clerkOrgId`, `slug`, `plan`, `subscriptionStatus`                     |
| members                  | Org membership with roles        | `orgId`, `userId`, `role`                                              |
| teams                    | Teams within an org              | `orgId`, `name`, `key`, `nextIssueNumber`                              |
| issues                   | The core entity                  | `teamId`, `number`, `status`, `priority`, `sortOrder`, `embedding`     |
| labels / issueLabels     | Labels, many-to-many             | `name`, `color` / `issueId`, `labelId`                                 |
| issueRelations           | Links between issues             | `issueId`, `relatedIssueId`, `type`                                    |
| comments                 | Issue discussions                | `issueId`, `authorId`, `body`, `mentions[]`, `parentId`, `reactions[]` |
| notifications            | In-app inbox feed                | `userId`, `actorId`, `issueId`, `type`, `read`                         |
| notificationPrefs        | Per-member notification channels | `orgId`, `userId`, `mention`, `assigned`, `statusChanged`, `github`    |
| emailDigests             | Email digest schedule + content  | `userId`, `timeOfDay`, `frequency`, `days[]`, `sections`, `lastSentDay` |
| activity                 | Audit trail per issue            | `issueId`, `actorId`, `type`, `oldValue`, `newValue`                   |
| projects                 | Cross-team initiatives           | `orgId`, `status`, `leadId`, `targetDate`                              |
| cycles                   | Sprints per team                 | `teamId`, `number`, `startDate`, `endDate`                             |
| attachments              | Files on issues                  | `issueId`, `storageId`, `fileName`                                     |
| issueTemplates           | Templates + recurring schedules  | `teamId`, `titlePrefix`, `priority`, `cadence`, `nextRunAt`            |
| integrations             | GitHub / Figma connection per org | `orgId`, `type`, `installationId`, `repositories[]`, figma tokens     |
| pullRequests             | PRs linked to issues             | `issueId`, `repo`, `number`, `state`                                   |
| githubIssues             | Synced GitHub issue twins        | `issueId`, `repo`, `number`, `url`                                     |
| figmaLinks               | Figma designs attached to issues | `issueId`, `fileKey`, `nodeId`, `thumbnailUrl`, `devResourceId`        |
| graphLayouts             | Saved dependency-graph positions | `orgId`, `scopeKey`, `positions[]`                                     |
| issueShares              | Public read-only share links     | `issueId`, `token`, `createdBy`                                        |
| views                    | Saved filter configurations      | `creatorId`, `filters`, `shared`                                       |

## PROJECT STRUCTURE

| Path                            | Purpose                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `app/(marketing)/`              | Landing and pricing pages (public)                          |
| `app/(app)/[orgSlug]/`          | The workspace: boards, issues, projects, cycles, AI, settings |
| `app/onboarding/`               | Create-or-join-organization flow                            |
| `convex/schema.ts`              | Tables, indexes, search and vector indexes                  |
| `convex/http.ts`, `convex/webhooks.ts` | Clerk + GitHub + Figma webhook/OAuth endpoints and sync |
| `convex/lib/customFunctions.ts` | `orgQuery` / `orgMutation` wrappers                         |
| `convex/lib/limits.ts`          | Free-plan limit enforcement                                 |
| `convex/agent/`                 | AI agent: chat, drafting, embeddings, triage, rate limiting (models in `agent/models.ts`) |
| `convex/emailDigests.ts`, `convex/email/` | Digest settings/content + SES SMTP delivery and HTML template |
| `convex/github/`, `convex/figma.ts` | GitHub (transport/sync split) and Figma integration    |
| `convex/graph.ts`               | Dependency-graph data and saved layouts                     |
| `components/`                   | UI: shell, board, issues, issue detail, graph, billing, AI  |
| `lib/plans.ts`                  | Single source of truth for Clerk plan IDs and pricing       |
| `proxy.ts`                      | Clerk middleware for route protection                       |

## COMMANDS

| Command                  | What it does                              |
| ------------------------ | ----------------------------------------- |
| `pnpm dev`               | Start Next.js and Convex in parallel      |
| `pnpm build`             | Production build                          |
| `pnpm lint`              | Run ESLint                                |
| `pnpm exec tsc --noEmit` | Type-check the project                    |
| `npx convex dev`         | Convex dev server (generates types)       |
| `npx convex deploy`      | Deploy Convex to production               |

## DEPLOYMENT AND TROUBLESHOOTING

Both covered in [`.docs/CONFIGURE.md`](../.docs/CONFIGURE.md) - Vercel + `npx convex deploy` steps, production env vars, and a table of common failures (JWT template naming, webhook secrets, missing env vars).
