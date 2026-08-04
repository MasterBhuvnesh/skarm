# SECURITY POLICY

## REPORTING A VULNERABILITY

Do not open a public issue.

Report privately through [GitHub Security Advisories](https://github.com/MasterBhuvnesh/skarm/security/advisories/new), or email bhuvenshverma2904@gmail.com with `SECURITY` in the subject.

Include: what the flaw is, steps to reproduce, affected route or Convex function, and the impact you can demonstrate. A proof of concept helps.

Expect an acknowledgement within 5 days and a status update within 14. Please give a fix a reasonable window before disclosing publicly.

## SCOPE

Only the latest `main` is supported. There are no maintained older releases.

Most interesting to us:

- Org scoping breaks: any path where one workspace can read or write another workspace's data
- Missing enforcement in a Convex mutation or query that the UI merely hides
- Plan limits bypassed server side (seats, projects, issues, AI usage)
- Webhook signature verification gaps on the Clerk, GitHub, or Figma endpoints
- Token or secret leakage: GitHub installation tokens, Figma OAuth tokens, SES credentials
- Public issue share links exposing more than the shared issue

Out of scope: findings that require an already compromised machine or account, missing hardening headers with no demonstrated impact, rate limiting on unauthenticated marketing pages, and automated scanner output with no working proof of concept.

## FOR CONTRIBUTORS

- Never commit credentials, API keys, tokens, or `.env` files.
- Authorization is enforced in Convex, not in the UI. `orgQuery` / `orgMutation` resolve the caller's org from the Clerk JWT, and every org scoped function must go through them.
- Verify signatures on every inbound webhook before acting on the payload.
- Do not log tokens, JWTs, or full webhook bodies.
