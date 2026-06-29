# Repo Gaps — TASK Checklist

Scaffolding/quality gaps found in the repo. App logic (webhooks, rate limiting,
vector agent) is solid — these are the things missing around it.

## Real gaps

- [ ] **Add CI** — `.github/workflows/ci.yml` running `lint` + `tsc --noEmit` + `build` on push/PR
- [ ] **Add `.env.example`** — document required vars (no values):
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_FRONTEND_API_URL`
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL` / fallback redirect URLs
  - `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`
  - `CLERK_WEBHOOK_SECRET`, `NVIDIA_API_KEY`
- [ ] **Add `README.md`** — current setup/run instructions (only `OLD.README.md` exists)
- [ ] **Add Next.js error/loading/not-found UI** in `app/`:
  - [ ] `app/error.tsx` and/or `app/global-error.tsx`
  - [ ] `app/not-found.tsx`
  - [ ] `app/loading.tsx` (Suspense fallback for async routes)
- [ ] **Add `typecheck` script** — `tsc --noEmit` in `package.json`


## Cheap high-value wins (do first)

- [ ] `.env.example`
- [ ] `README.md`
- [ ] error/loading/not-found files
- [ ] minimal CI workflow