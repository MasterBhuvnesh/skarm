# CONTRIBUTING

Thanks for helping improve Skarm. By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## SETUP

```bash
npm install -g pnpm   # if you do not have pnpm
pnpm install
cp .env.example .env.local
pnpm dev              # Next.js and Convex in parallel
```

Every environment variable, plus Clerk, Convex, GitHub App, Figma, and SES setup, lives in [`.docs/CONFIGURE.md`](../.docs/CONFIGURE.md). Convex must be running for `convex/_generated` types to exist.

## BEFORE YOU OPEN A PR

```bash
pnpm lint
pnpm exec tsc --noEmit
```

Both must pass.

The test suite is being written. If your change touches code that already has tests, run them and say so in the PR. For anything not yet covered, state in the PR what you clicked through manually.

## BRANCHES AND COMMITS

- Branch off `main`. Never commit to `main` directly.
- Conventional Commits, one short sentence: `feat: add cycle burndown export`.
- Keep the PR focused. One concern per PR.

## CODE CONVENTIONS

- Reuse what is already here before writing something new. Smallest change that works.
- Every Convex function that touches org data goes through `orgQuery` / `orgMutation` in `convex/lib/customFunctions.ts`. That wrapper is the org scoping boundary, do not bypass it.
- `users`, `organizations`, and `members` are written by Clerk webhooks only. Never mutate them from app code.
- Plan gating in the UI (`has({ plan })`) is cosmetic. The real check belongs in the Convex mutation.
- Schema changes go in `convex/schema.ts` with the indexes the queries need. Never edit `convex/_generated`.
- Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- No em dashes, no emoji, ALL CAPS headings in markdown. See [`.docs/RULES.md`](../.docs/RULES.md).

## ISSUES

Bug reports: what you did, what happened, what you expected, plus browser and whether Convex dev was running. Feature ideas: describe the problem before the solution.

Never paste secrets, tokens, or `.env` contents into an issue or PR. For anything security related see [SECURITY.md](SECURITY.md).
