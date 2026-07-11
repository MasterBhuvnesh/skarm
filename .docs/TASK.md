# Ideas to build on top of the base app.

### ADVANCED FEATURES
- [x] Search bar in issues to search the entire issue body, not just the title
- [x] Inbox and notifications: in-app feed for mentions, assignments, and status changes
- [x] Cycle analytics: burndown charts, velocity, and scope-change tracking
- [x] Issue templates and recurring issues: standardize bug reports and rituals

### AI IMPROVEMENTS

- [x] AI issue drafting: turn a one-line idea into a fully specced issue with acceptance criteria
- [ ] Backlog grooming agent: suggest stale issues to close and duplicates to merge
- [ ] Voice standup: speech-to-text standup notes summarized into a cycle report
- [x] GitHub integration: link PRs to issues and update statuses on merge

### INFRASTRUCTURE AND SCALING

- [ ] Pagination: cursor-based pagination for orgs with tens of thousands of issues
- [x] Public issue sharing: read-only public links for individual issues,like preview card on sharing link and export as pdf 
- [ ] Import/export: bring in issues from CSV, Jira, or Linear export format

### MONETIZATION

- [ ] Per-seat metering: track active seats and surface usage on the billing page
- [ ] Add-on features: sell the AI agent as a standalone add-on with Clerk features
- [ ] Trials: time-boxed Pro trials for new organizations

### NEXT DIRECTIONS

Extensions of what's already built:

- [ ] Automations builder: node-canvas "when X → if Y → do Z" flows composed by users (React Flow is installed; triggers/actions exist as primitives)
- [ ] Two-way GitHub sync: closing/renaming/commenting on GitHub reflects back into Cohere via issues + issue_comment webhook events
- [ ] Dependency graph upgrades: critical-path highlighting, circular-dependency warnings, filter by assignee
- [ ] Email notifications: daily digest / instant mention emails via the Convex Resend component
- [ ] Graph filter and grouping by team or assignee

Boring but valuable (do before pushing to production):

- [ ] CI: GitHub Actions running tsc, lint, and build on push/PR
- [ ] Convex tests (convex-test) for plan limits, authz checks, webhook handlers, relations normalization
- [ ] Mobile responsiveness pass on board and issue detail