<div align="center">

<img src="../public/cohere.png" alt="Cohere logo" width="80" />

# COHERE

A modern issue tracker for teams that plan, track, and ship together. Multi-tenant workspaces, real-time boards, B2B billing, and an AI agent, built with Next.js 16, Convex, and Clerk.

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
- Command palette (Cmd+K) and single-key shortcuts

### COLLABORATION

- Comments with @mentions and a full activity feed per issue
- Inbox with in-app notifications for @mentions, assignments, and status changes, with a live unread badge in the sidebar
- Sub-issues and issue relations (blocks, blocked by, related, duplicate of)
- File attachments via Convex storage
- Live presence: see who is viewing the same issue
- Public issue sharing: read-only links with an OG preview card for unfurls and print-to-PDF export; revocable instantly

### PROJECTS AND CYCLES

- Projects group issues across teams with statuses, leads, target dates, and live progress
- Cycles are time-boxed sprints per team, auto-numbered with current-cycle tracking
- Cycle analytics: burndown chart with ideal guideline, velocity across recent cycles, and scope-change tracking (added/removed points), reconstructed from the activity log
- Unlimited teams per organization, each with its own board and cycles

### GITHUB INTEGRATION

- One-click connect via a GitHub App: users pick repositories on GitHub's install screen, no manual webhook setup per workspace
- Projects connect one or more repos (live-fetched picker with Public/Private badges, shows who connected)
- "Also create this issue on GitHub" at creation; edits, status changes, and attachments mirror to the GitHub twin (merged PR → Done closes it)
- PRs link to issues via `ENG-42` in branch names, titles, or bodies; opened PRs move issues to In Review, merged PRs to Done
- All automated events appear in the timeline and inbox as a dedicated GitHub system actor, never as a user

### AI AGENT (PRO AND ENTERPRISE)

- Workspace-aware chat with org-scoped tools: create, update, and search issues, summarize cycles, report project status
- AI issue drafting: one-line idea → full spec with acceptance criteria, priority, estimate, labels, sub-issues, and relations to real existing issues — with prompt guidance, length control (short → thorough), rephrase, and discard
- Duplicate detection via 1536-dim vector embeddings on every issue
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
    GitHub[GitHub App] -->|"HMAC webhooks: installs, PRs"| GHHTTP["Convex HTTP /github-webhook"]
    GHHTTP --> Convex
    Convex -->|"Issue sync via installation tokens"| GitHub
    Convex -->|"Agent tools + embeddings"| OpenAI[OpenAI]
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

- **App setup** — `.env.local`, Clerk (JWT template, billing plans, webhooks), Convex env vars, deployment, and a troubleshooting table
- **GitHub integration** — creating the GitHub App (webhook + setup URLs, permissions), `GITHUB_APP_SLUG` / `GITHUB_WEBHOOK_SECRET` / `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` (base64) env vars, and how the install → webhook → sync flow works

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
| comments                 | Issue discussions                | `issueId`, `authorId`, `body`, `mentions[]`                            |
| notifications            | In-app inbox feed                | `userId`, `actorId`, `issueId`, `type`, `read`                         |
| activity                 | Audit trail per issue            | `issueId`, `actorId`, `type`, `oldValue`, `newValue`                   |
| projects                 | Cross-team initiatives           | `orgId`, `status`, `leadId`, `targetDate`                              |
| cycles                   | Sprints per team                 | `teamId`, `number`, `startDate`, `endDate`                             |
| attachments              | Files on issues                  | `issueId`, `storageId`, `fileName`                                     |
| issueTemplates           | Templates + recurring schedules  | `teamId`, `titlePrefix`, `priority`, `cadence`, `nextRunAt`            |
| integrations             | GitHub App connection per org    | `orgId`, `installationId`, `repositories[]`, `enabled`                 |
| pullRequests             | PRs linked to issues             | `issueId`, `repo`, `number`, `state`                                   |
| githubIssues             | Synced GitHub issue twins        | `issueId`, `repo`, `number`, `url`                                     |
| issueShares              | Public read-only share links     | `issueId`, `token`, `createdBy`                                        |
| views                    | Saved filter configurations      | `creatorId`, `filters`, `shared`                                       |

## PROJECT STRUCTURE

| Path                            | Purpose                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `app/(marketing)/`              | Landing and pricing pages (public)                          |
| `app/(app)/[orgSlug]/`          | The workspace: boards, issues, projects, cycles, AI, settings |
| `app/onboarding/`               | Create-or-join-organization flow                            |
| `convex/schema.ts`              | Tables, indexes, search and vector indexes                  |
| `convex/http.ts`, `convex/webhooks.ts` | Clerk webhook endpoint and sync logic                |
| `convex/lib/customFunctions.ts` | `orgQuery` / `orgMutation` wrappers                         |
| `convex/lib/limits.ts`          | Free-plan limit enforcement                                 |
| `convex/agent/`                 | AI agent: chat, tools, embeddings, triage, rate limiting    |
| `components/`                   | UI: shell, board, issues, issue detail, billing, AI         |
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

Both covered in [`.docs/CONFIGURE.md`](../.docs/CONFIGURE.md) — Vercel + `npx convex deploy` steps, production env vars, and a table of common failures (JWT template naming, webhook secrets, missing env vars).
