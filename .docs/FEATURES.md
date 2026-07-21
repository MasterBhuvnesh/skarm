# Top 25 Features to Add

A prioritized wishlist for Cohere, curated against what's already shipped
(search, inbox, templates/recurring, cycle analytics, AI drafting, two-way
GitHub, Figma, public sharing, dependency graph). Complements the shorter
checklist in `TASK.md`. Effort: S (≤1 day), M (a few days), L (a week+).

## Core workflow

1. **Automations builder** - user-composed "when X → if Y → do Z" rules
   (trigger: status change/label/cron/GitHub event; action: assign, label,
   notify, comment). React Flow canvas is already installed; every
   trigger/action exists as a primitive. The single highest-leverage
   feature. (L)
2. **Bulk edit & multi-select** - shift-click / checkbox selection on list
   and board with a floating bar (status, assignee, label, project, delete).
   Everyday power-user friction today. (M)
3. **Custom workflow statuses per team** - teams define their own status
   columns (e.g. QA, Blocked) instead of the fixed six; needed by any team
   with a review pipeline. (L)
4. **Custom fields** - per-team typed fields (select, number, date, URL) on
   issues, shown in properties and filterable. (L)
5. **Milestones inside projects** - group project issues into ordered
   checkpoints with per-milestone progress. (M)
6. **Mark-as-duplicate flow** - one action that closes an issue as duplicate,
   links it, and redirects watchers; pairs with existing duplicate
   detection. (S)
7. **Cycle auto-rollover** - when a cycle ends, unfinished issues move to the
   next cycle automatically (with an activity entry); cycles create
   themselves on a cadence. (M)
8. **Watchers / subscribe** - follow an issue without being assignee and get
   inbox notifications on its activity. (M)

## Views & navigation

9. **My Issues dashboard** - one personal view of assigned / created /
   subscribed / recently viewed, the daily landing page. (M)
10. **Board swimlanes & group-by** - group the board rows by assignee,
    priority, project, or label, not just status columns. (M)
11. **Roadmap / timeline view (v2)** - Gantt-style projects-over-time view;
    first attempt was rolled back, needs a design pass with the user's
    preferred reference. (M)
12. **Pagination / virtualization** - cursor-based queries + virtualized
    lists so 10k-issue orgs stay fast (currently `.take(500)` caps). (M)

## Collaboration

13. **Rich text editor** - slash commands, headings, image paste-upload,
    code blocks in descriptions/comments (Streamdown renders; authoring is
    still a plain textarea). (L)
14. **Realtime co-editing on descriptions** - Convex prosemirror-sync
    component gives Google-Docs-style editing on the issue body. (L)
15. **Comment reactions & threads** - emoji reactions and one level of
    replies on comments. (M)
16. **Guest collaborators** - invite external users scoped to a single team
    or project (client/agency workflows). (L)
17. **Notification preferences** - per-type toggles (mentions, assignments,
    status changes, GitHub/Figma events) and per-issue mute. (M)

## AI

18. **Backlog grooming agent** - weekly sweep that flags stale issues,
    proposes closures, and pairs near-duplicates using the existing
    embeddings; report lands in the inbox. (M)
19. **Semantic search** - "find issues about auth token expiry" via the
    vector index, blended into the existing search UI. (S–M)
20. **Duplicate warning at creation** - as you type a title in the create
    dialog, surface likely duplicates before the issue exists. (S)
21. **AI weekly report / changelog** - one click turns a cycle or project's
    activity into a shareable stakeholder update. (M)

## Platform & integrations

22. **Slack integration** - issue notifications to channels, unfurled links,
    and create-issue from a Slack message. (L)
23. **Public API + outbound webhooks** - personal access tokens, REST
    endpoints, and org-defined webhooks so customers can build on Cohere
    (prerequisite for a real integrations ecosystem). (L)
24. **Import from CSV / Jira / Linear** - adoption depends on bringing data
    in; `insertIssue` is the single creation path, so this is mostly
    parsing + mapping UI. (M)

## Enterprise & scale

25. **SSO/SAML + org audit log + SCIM** - the enterprise checklist that
    unlocks the Enterprise tier being sold on the pricing page (Clerk
    provides much of SSO; audit log needs an org-wide activity surface). (L)

---

Quick wins to slot between big rocks: #6, #19, #20.
Biggest compounding bets: #1 (automations), #23 (API), #13 (editor).
