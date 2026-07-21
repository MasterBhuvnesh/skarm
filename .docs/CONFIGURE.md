# Configuring Skarm

Everything needed to get a Skarm deployment running: app setup (Clerk +
Convex + env vars) first, then the GitHub integration.

## App setup

### Prerequisites

- Node.js 18+ and pnpm
- Accounts on [Clerk](https://clerk.com), [Convex](https://convex.dev), and an [OpenAI](https://platform.openai.com) API key

### 1. Install

```bash
pnpm install
```

### 2. Environment variables

Create `.env.local` in the project root (see `.env.example`):

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://your-instance.clerk.accounts.dev

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/onboarding
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding

CONVEX_DEPLOYMENT=dev:your-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site
```

Never commit `.env.local`.

### 3. Configure Clerk

1. Create a Clerk application and copy the keys into `.env.local`
2. Enable Organizations
3. Create a JWT template named exactly `convex` with these claims:

```json
{
  "org_id": "{{org.id}}",
  "org_slug": "{{org.slug}}",
  "org_role": "{{org.role}}"
}
```

4. Set up Billing with three organization plans: `free_org`, `pro`, `enterprise`
5. Attach features to the paid plans: `ai_agent`, `unlimited_projects`, `unlimited_issues`, `unlimited_seats`, `unlimited_ai`, `priority_support`
6. Copy your plan IDs into [`lib/plans.ts`](../lib/plans.ts)

### 4. Configure Convex

Run `npx convex dev` to create or link a project, then set env vars on the deployment:

```bash
npx convex env set CLERK_FRONTEND_API_URL https://your-instance.clerk.accounts.dev
npx convex env set CLERK_WEBHOOK_SECRET whsec_...
npx convex env set OPENAI_API_KEY sk-...
```

### 5. Configure Clerk webhooks

1. In Clerk, create a webhook endpoint pointing to `https://your-deployment.convex.site/clerk-webhook` (note `.convex.site`, not `.convex.cloud`)
2. Subscribe to `user.*`, `organization.*`, `organizationMembership.*`, and all `subscription.*` / `subscriptionItem.*` events
3. Copy the signing secret into the Convex env var `CLERK_WEBHOOK_SECRET`

### 6. Run

```bash
pnpm dev
```

Runs Next.js and Convex in parallel. Open [http://localhost:3000](http://localhost:3000), sign up, create an organization, and you are in.

### Deployment

1. Deploy the frontend to [Vercel](https://vercel.com) and add all `.env.local` variables
2. Run `npx convex deploy` and set `CLERK_FRONTEND_API_URL`, `CLERK_WEBHOOK_SECRET`, and `OPENAI_API_KEY` on the production Convex deployment
3. Point the Clerk webhook at the production Convex HTTP URL and switch to production Clerk keys
4. Test end to end: sign up, create org, create issue, upgrade plan, AI chat

### Troubleshooting

| Problem                                  | Fix                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| "Not authenticated" errors from Convex   | JWT template must be named exactly `convex`; set `CLERK_FRONTEND_API_URL` on Convex  |
| Org pages 404 or redirect to onboarding  | JWT template needs `org_id` / `org_slug` / `org_role` claims and an active org       |
| Webhook returns 400                      | Signing secret must match `CLERK_WEBHOOK_SECRET` (not `CLERK_SECRET_KEY`)            |
| User missing in Convex after sign-up     | Webhook URL must end with `/clerk-webhook` on the `.convex.site` domain              |
| Plan not updating after checkout         | Subscribe to all `subscription.*` and `subscriptionItem.*` webhook events            |
| AI chat errors immediately               | Set `OPENAI_API_KEY` on the Convex deployment                                        |
| Convex types not updating                | Keep `npx convex dev` running                                                        |

---

## GitHub integration

Skarm's GitHub integration is a [GitHub App](https://docs.github.com/en/apps).
Creating the app is a one-time step per deployment; after that, every
workspace connects itself with one click (Settings → Integrations → Connect)
and picks which repositories to grant.

### 1. Create the GitHub App

GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**.

Your Convex site URL is the `NEXT_PUBLIC_CONVEX_SITE_URL` value in
`.env.local` (e.g. `https://your-deployment.convex.site` — note `.site`,
not `.cloud`).

| Field | Value |
| --- | --- |
| GitHub App name | `Skarm` (any unique name works — only the slug matters) |
| Description | see below |
| Homepage URL | your app URL, e.g. `http://localhost:3000` |
| Callback URL | leave empty (no OAuth identity is requested) |
| Request user authorization (OAuth) during installation | unchecked |
| Enable Device Flow | unchecked |
| Setup URL | `<convex-site-url>/github-setup` |
| Redirect on update | **unchecked** (repo changes sync via webhook) |
| Webhook → Active | checked |
| Webhook URL | `<convex-site-url>/github-webhook` |
| Webhook secret | a long random string — you set the same value on Convex below |
| Repository permissions | **Pull requests: Read-only** (Metadata read is added automatically) |
| Subscribe to events | **Pull request** (installation events are delivered automatically) |
| Where can this app be installed? | "Only on this account" is fine; "Any account" if other GitHub orgs need it |

Suggested description:

> Skarm is an AI-native issue tracker for teams that plan, track, and ship
> together. This app links pull requests to Skarm issues: mention an issue
> key like ENG-42 in a branch name, PR title, or description and Skarm
> attaches the PR to that issue and keeps its status in sync — opened PRs
> move issues to In Review, merged PRs mark them Done.

Generate a webhook secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For GitHub **Issues** sync (creating issues in repos from Skarm), also add
under Repository permissions: **Issues: Read and write**. Then, on the app
page after creation, note the **App ID** and generate a **private key**
("Private keys" → Generate) — a `.pem` file downloads.

For **two-way sync** (GitHub → Skarm: edits, close/reopen, and comments on
the linked GitHub issue reflected back), additionally subscribe to the
**Issues** and **Issue comment** events. Events from bots (including the
app itself) are ignored to prevent echo loops.

---

## Figma integration

Lets members paste Figma file/frame links on issues; Skarm fetches the
design's name and a rendered thumbnail via the Figma REST API.

1. Create an OAuth app at [figma.com/developers/apps](https://www.figma.com/developers/apps)
   with redirect URI `<convex-site-url>/figma-callback`, and under the app's
   **OAuth scopes** enable `file_content:read`, `file_metadata:read`,
   `file_comments:write`, `file_versions:read`, and
   `file_dev_resources:write` (Skarm requests exactly these). Changing
   scopes later requires clicking Connect again to mint a new token.
2. Set the credentials on Convex:

```bash
npx convex env set FIGMA_CLIENT_ID <client id>
npx convex env set FIGMA_CLIENT_SECRET <client secret>
```

3. In Skarm: Settings → Integrations → Figma → **Connect** (workspace
   admins only). Figma asks for read-only file access and redirects back.
4. On any issue: sidebar → Figma → **+** → paste a link (or just paste a
   figma.com URL into a description or comment — it auto-attaches). The
   name, thumbnail, and "edited Xh ago" freshness stamp fill in a moment
   later; OAuth tokens are refreshed automatically when they expire.

What the integration does once connected:

- **Previews**: design name, rendered thumbnail, and last-edited time on
  each link card (↻ in the panel header re-fetches).
- **Comment to Figma**: the issue comment composer gains an "Also post to
  Figma" checkbox; the comment lands on the linked design (pinned to the
  frame for node links) as "Name via Skarm ENG-42: …".
- **Dev Mode resources**: frame links push a resource onto the frame in
  Figma Dev Mode — "ENG-42 · In Progress · Title" linking back to the
  Skarm issue — renamed automatically when the status/title changes and
  removed when the link is removed. Requires `SITE_URL` to be set for the
  link to point at your app.

### 2. Set Convex environment variables

The app slug is in the app page URL: `github.com/settings/apps/<slug>`.

```bash
npx convex env set GITHUB_APP_SLUG <slug>
npx convex env set GITHUB_WEBHOOK_SECRET <webhook secret from step 1>
# For GitHub Issues sync (issue creation from Skarm):
npx convex env set GITHUB_APP_ID <numeric app id>
# Production only — where /github-setup redirects users after install.
# Defaults to http://localhost:3000 when unset.
npx convex env set SITE_URL https://your-app.example.com
```

The private key is multiline and shells tend to truncate multiline env
values, so store it base64-encoded (the backend accepts raw PEM, \n-escaped
PEM, or base64):

```powershell
# PowerShell
npx convex env set GITHUB_PRIVATE_KEY ([Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\key.pem")))
```

```bash
# bash
npx convex env set GITHUB_PRIVATE_KEY "$(base64 -w0 path/to/key.pem)"
```

Keep the `.pem` outside the repo — especially never in `public/`, which is
served verbatim by Next.js.

### 3. Connect a workspace

In Skarm: Settings → Integrations → **Connect** (workspace admins only).
GitHub opens its install screen where you select one, several, or all
repositories, then redirects you back to the settings page. The granted
repositories appear as chips and can be changed any time from the GitHub
App's installation settings — the list re-syncs automatically.

### How it works

- **Connect** mints a single-use nonce (valid 15 minutes) bound to your
  workspace and user, and sends you to
  `github.com/apps/<slug>/installations/new?state=<nonce>`.
- After you pick repositories, GitHub redirects to
  `<convex-site>/github-setup?installation_id=…&state=<nonce>`. Skarm
  verifies the nonce and stores the installation id against the workspace —
  that's the entire binding; no tokens or private keys are stored.
- GitHub then delivers webhooks (HMAC-signed with the app secret) to
  `<convex-site>/github-webhook`:
  - `installation` / `installation_repositories` events keep the granted
    repository list in sync (and disconnect the workspace if the app is
    uninstalled on GitHub).
  - `pull_request` events are scanned for issue identifiers (`ENG-42`) in
    the branch name, PR title, and body. Each referenced issue gets the PR
    attached (visible on the issue's detail sidebar), and statuses move:
    opened/reopened PR → **In Review** (from backlog/todo/in progress),
    merged PR → **Done**. Every transition writes the activity log and
    notifies the issue's creator and assignee in their inbox.
- The enable/disable switch in Settings → Integrations pauses event
  processing without disconnecting; Disconnect removes the binding but
  keeps already-linked PRs on their issues.
- **Projects ↔ repositories**: a project's Properties panel lists connected
  repositories (owner, name, Public/Private) and a picker fetched live from
  the installation. Connection is optional.
- **Issue sync**: when a new issue's project has connected repositories,
  the create dialog offers "Also create this issue on GitHub" with a repo
  choice. The issue is always created in Skarm first; a scheduled action
  then creates the GitHub twin (via an app JWT → installation token) and
  records the link, which appears in the issue's GitHub panel and activity
  timeline.
- **System actor**: all automated events (issue sync, PR-driven status
  changes) appear in timelines and the inbox as **GitHub** with the GitHub
  logo — never as a workspace user. Failures are recorded on the timeline
  too ("couldn't sync this issue to GitHub").

## AI models (chat + embeddings)

Every model the AI features use is declared in **one file**:
[`convex/agent/models.ts`](../convex/agent/models.ts). Nothing else in the
codebase names a model.

```ts
const nvidia = createOpenAI({
  apiKey: process.env.NVIDIA_API_KEY,        // provider API key
  baseURL: "https://integrate.api.nvidia.com/v1", // provider endpoint
});
export const CHAT_MODEL_ID = "nvidia/nemotron-3-ultra-550b-a55b";
export const EMBEDDING_MODEL_ID = "nvidia/nv-embed-v1"; // 4096 dims
```

### Changing the chat model

Edit `CHAT_MODEL_ID` (and, for a different provider, the `createOpenAI`
`baseURL` + the env var it reads). Deploy with `npx convex dev --once`.
That's it — the chat model powers the agent chat, AI drafting, triage
suggestions, and reports; none of them care which model responds.

### Changing the embedding model — read this first

The embedding model powers semantic search and duplicate detection, and it
has one hard constraint: **the vector index must declare exactly the number
of dimensions the model outputs.**

1. `EMBEDDING_MODEL_ID` in `convex/agent/models.ts` — the model.
2. `dimensions:` in the issues table's `by_embedding` vector index in
   [`convex/schema.ts`](../convex/schema.ts) — must equal the model's
   output size (nv-embed-v1 → 4096, OpenAI text-embedding-3-small → 1536,
   etc. — check the model card).

If they disagree, every duplicate check fails at runtime with
`Expected a vector with dimensions X, received Y` (this exact bug shipped
once: the index said 1536 while nv-embed-v1 emits 4096). Setting up a fresh
deployment does NOT fix it — the mismatch is in the code.

**After switching models, stored embeddings are stale.** Vectors from the
old model aren't comparable to vectors from the new one (even at the same
dimension), and wrong-length vectors silently drop out of the index. Clear
them so the backfill re-embeds everything:

```ts
// One-off internal mutation (add temporarily, run from the dashboard, delete):
export const clearEmbeddings = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const issues = await ctx.db
      .query("issues")
      .filter((q) => q.neq(q.field("embedding"), undefined))
      .take(500);
    for (const issue of issues) {
      await ctx.db.patch(issue._id, { embedding: undefined });
    }
    return issues.length; // re-run until 0
  },
});
```

`ensureOrgEmbeddings` (called automatically when AI surfaces mount) then
re-embeds every issue in batches — no further action needed.

### Provider notes

- The provider client is OpenAI-compatible (`createOpenAI` from
  `@ai-sdk/openai`); any OpenAI-compatible endpoint works by swapping
  `baseURL` and the API-key env var (`NVIDIA_API_KEY` today — set it with
  `npx convex env set NVIDIA_API_KEY <key>`).
- NVIDIA-specific request extras (`input_type`, `truncate`) live in
  `embedText` in [`convex/agent/embeddings.ts`](../convex/agent/embeddings.ts);
  remove or adapt them when leaving NVIDIA.
- `isAiConfigured()` / `assertAiConfigured()` in `models.ts` gate every AI
  entry point on the API key env var — update them if the env var name
  changes.
