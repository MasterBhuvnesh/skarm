# Repo Gaps — TASK Checklist

Scaffolding/quality gaps found in the repo. App logic (webhooks, rate limiting,
vector agent) is solid — these are the things missing around it.

## Real gaps

- [ ] **Add CI** — `.github/workflows/ci.yml` running `lint` + `tsc --noEmit` + `build` on push/PR
- [ ] **Add `README.md`** — current setup/run instructions (only `OLD.README.md` exists)
- [ ] **Add Next.js error/loading/not-found UI** in `app/`:
  - [ ] `app/error.tsx` and/or `app/global-error.tsx`
  - [ ] `app/not-found.tsx`
  - [ ] `app/loading.tsx` (Suspense fallback for async routes)
- [ ] **Add `typecheck` script** — `tsc --noEmit` in `package.json`


## Cheap high-value wins (do first)

- [ ] `README.md`
- [ ] error/loading/not-found files
- [ ] minimal CI workflow