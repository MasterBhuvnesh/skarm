# Cohere — Linear Clone Design

Date: 2026-06-12
Status: Approved (brainstormed + planned in chat; foundation built)

## Product

Cohere is a B2B multi-tenant Linear clone: organizations (workspaces) contain teams; teams contain issues with Linear-grade workflow features, realtime collaboration, and a plan-gated AI agent.

## Stack

- **Next.js 16** (App Router, React 19, Tailwind 4, shadcn/ui, next-themes — dark default + light mode)
- **Convex** — database, realtime queries, file storage, HTTP actions, components (Agent, Rate Limiter, Presence)
- **Clerk** — authentication, organizations (multi-tenancy), AND billing (org subscription plans, checkout, seat-based Pro plan)
- **OpenAI** via AI SDK inside Convex actions (Track D)

## Tenancy model

- Clerk **Organization = workspace**. Org slugs enabled; app routes live at `/[orgSlug]/...`.
- **Teams** inside an org each have an issue prefix (ENG → ENG-123) and per-team issue numbering, boards, cycles.
- Clerk default roles: `org:admin`, `org:member` (mirrored as `admin`/`member`).
- Members invited via Clerk; seat caps: Free enforced app-side (3), Pro enforced by Clerk seat-based billing (max 10), Enterprise unlimited.

## Architecture (Approach A — webhook sync)

Clerk is the source of truth for identity/membership/subscriptions, mirrored into Convex for indexed joins and enforcement:

- Svix-verified webhook endpoint: Convex HTTP action `/clerk-webhook` → `convex/webhooks.ts` internal mutation.
- Synced tables: `users`, `organizations` (with `plan`), `members`.
- Subscription events (`subscription.*`, `subscriptionItem.*` - Clerk event names) update `organizations.plan` (`free` | `pro` | `enterprise`).
- JWT template `convex` carries `org_id`/`org_slug`/`org_role` claims; Convex functions resolve + verify membership against synced tables via custom wrappers (`orgQuery`/`orgMutation`/`orgAdminMutation`).

## Billing

- Plans (org-payer): Free ($0; 3 seats, 2 projects, 100 issues, no AI), Pro ($20/mo base + $10/seat after first, seat-based, max 10 members; AI included, 50 AI msgs/user/day), Enterprise ($99/mo flat; unlimited seats/AI, priority support). Annual pricing configured.
- Features attached to plans: `ai_agent`, `unlimited_projects`, `unlimited_issues`, `unlimited_seats`, `unlimited_ai`, `priority_support`.
- **Custom pricing table** (not `<PricingTable />`): shadcn cards + `<CheckoutButton>`/`<PlanDetailsButton>`/`<SubscriptionDetailsButton>` from `@clerk/nextjs/experimental` with custom child buttons for full design control.
- Enforcement is dual: Clerk `has()` in UI (cosmetic) + `organizations.plan` checks in Convex (`convex/lib/limits.ts`) (authoritative).

## Data model (all org-scoped; see `convex/schema.ts`)

`users`, `organizations`, `members`, `teams`, `issues` (status/priority/assignee/estimate/dueDate/parent/project/cycle/sortOrder/embedding + search & vector indexes), `labels`, `issueLabels`, `issueRelations`, `comments` (with mentions), `activity` (append-only event log), `projects`, `cycles`, `attachments`, `views` (saved filters).

## Feature scope

- Issues: CRUD, board (Kanban, dnd-kit) + list views, labels, filters, saved views, full-text search, sub-issues, relations, attachments, @mentions, due dates, estimates.
- Projects (org-level) and cycles (team-level, auto-numbered).
- Comments + activity feed; presence (online/viewing indicators).
- Keyboard-first UX: Cmd+K command palette + single-key shortcuts (registry pattern).
- AI agent (Pro/Enterprise): chat with workspace context, tool-calling (create/update/search issues, reports), triage assist (label/priority suggestions), semantic duplicate detection (embeddings + vector index), cycle/standup reports. Rate-limited on Pro.
- Marketing: landing page + custom pricing page; Clerk-hosted auth components at /sign-in, /sign-up; /onboarding org selection.

## Build strategy: foundation + parallel tracks

Foundation (built sequentially on `main`) contains everything shared: all npm deps, frozen schema, Convex components registration, auth wrappers, webhook sync, plan limits, app shell, shared UI primitives, command/slot registries, and a working vertical slice (teams + issues list/detail).

Six parallel tracks then run in git worktrees, each owning disjoint directories with one-line registry additions as the only shared-file touches (see `AGENTS.md` for the contract and per-track briefs):
A board/views · B projects/cycles · C issue-detail collab · D AI agent · E billing · F landing.

Merge order suggestion: A → C → B → E → D → F.

## Verification

- Foundation: sign-up → org creation → webhook sync → team creation → issue create/edit, realtime across browsers.
- Tracks: `tsc --noEmit` + `pnpm lint` in worktrees; functional verification after merge (only main runs `npx convex dev`).
- Billing: dev-gateway checkout; `has({ plan: 'pro' })` and synced `org.plan` unlock AI.
