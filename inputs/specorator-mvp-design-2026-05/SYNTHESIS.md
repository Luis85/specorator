# Specorator MVP — Multi-perspective synthesis

Cross-review consensus distilled from four parallel reviews (product/UX, architecture, frontend, QA) of the design package landed on 2026-05-14. This file is the source of truth for the GitHub issue breakdown that follows.

## TL;DR

The MVP is a three-panel Vue/Pinia workspace inside Obsidian. Architecture fit is good (existing DDD layers absorb the new entities cleanly), but the design package implies **four new domain aggregates** (Issue, Task, Proposal, Agent), **two new narrow ports** (GitHub, AgentRuntime), and a **vault-backed proposal persistence layer**. Two HIGH user stories (US-002 Triage, US-015 Break Down) depend on a live agent runtime that is *not* in scope for MVP — defer them. GitHub PAT onboarding is a real prerequisite, not a side issue. We can ship a tight ~22-story MVP if we cut the agent-driven AI features and the visual nice-to-haves.

## Cross-cutting decisions to record as ADRs before coding

Numbered ADR slots (final numbers assigned by `/adr:new`):

1. **MVP scope** — confirm the 22-story cut-line; explicitly defer agent-orchestration features (US-002, US-015).
2. **New domain aggregates** — Issue, Task, Proposal, Agent live in `src/domain/{issue,task,proposal,agent}/` with private constructors + repositories, parallel to the existing Feature aggregate. Status transitions enforced by the aggregate (e.g. Task `todo → in-progress → done`, Proposal `pending → accepted | rejected` one-way).
3. **GitHubPort (new narrow port)** — methods for issues, PRs, CI checks, activity, review actions. Lives at `src/domain/ports/GitHubPort.ts`. Implementations: `GitHubAdapter` (REST/GraphQL via PAT) + `MockGitHubAdapter` (prototype fixtures). Per ADR-008 — narrow, not an aggregate facade.
4. **AgentRuntimePort (new narrow port)** — listAgents, subscribe (WebSocket/SSE), assignTask, sendMessage. Implementations: `AgentRuntimeAdapter` (real WS) + `MockAgentRuntimeAdapter` (scripted fixtures). MVP can ship with mock-only and a clear "agent runtime: not yet connected" empty state.
5. **VaultPort proposal extensions** — `listProposals`, `getProposal`, `saveProposal`, `deleteProposal`. Persisted as a single `.specorator/proposals.json` in the vault. Proposal acceptance is **one-way and immutable** (no un-accept).
6. **Pinia store granularity** — three stores: `useAppStateStore` (route-transient: main, right, issueId, taskId, agentId, prId, prevMain), `useEntitiesStore` (issues, PRs, tasks, proposals — DTOs, not domain instances), `useLiveStreamStore` (agents + messages + activity feed). Per ADR-003, only DTOs cross the store boundary.
7. **Routing** — new `/workspace/*` routes with hash history. Path drives main view (`/workspace/issue/191`, `/workspace/pr/45`, `/workspace/task/t0`, `/workspace/activity`). Right-panel state via query param (`?right=tasks|agents|agent|pr`). Breadcrumb back-nav uses `prevMain` in store, not browser history (so closing/reopening the plugin restores a sane default).
8. **PR merge gate enforcement** — gate (`reviewStatus === 'approved'` AND `checks === 'passing'`) is re-checked **inside `MergePullRequestUseCase`** before calling `GitHubPort.mergePullRequest`, not only in the template. UI hides/disables the button as a usability aid, but the gate lives in the application layer.

## MVP scope cut (22 of 52 stories)

Ship:
- **Left Sidebar (5):** US-001 Activity feed entry · US-003 New Issue modal · US-005 Issue nav · US-010 PR nav · US-012 New-PR appears live
- **Main view (10):** US-013 Breadcrumb · US-014 Actbar (without Triage / Break Down) · US-016 Read issue spec · US-017 Add context · US-018 Edit issue · US-020 Accept proposal · US-021 Reject proposal · US-026 Diff from issue · US-028 Diff from PR · US-031 Comment / reply
- **Main view — navigation (3):** US-023 Assign task to agent · US-024 Task detail nav · US-029 PR ↔ linked issue
- **Right sidebar (3):** US-039 Quick-add task · US-043 Agent chat log + send · US-044 Agent chat from task
- **PR workflow (4):** US-037 Activity event nav · US-040 Agents panel nav · US-046 Approve PR · US-047 Merge gated by approval · US-048 Mark draft as ready (treat as 4 + 1)

Cut from MVP (defer to Phase 2):
- US-002 Triage, US-004 Collapse Actions, US-006 Collapse Issues, US-008 Filter (My/Created), US-009 Sidebar issue number polish, US-011 Draft PR distinction polish, US-015 Break Down (agent-driven), US-019, US-022, US-025, US-027, US-030, US-032 — US-052 — all remaining MED/LOW polish.

Conditional blockers (must resolve before the relevant story ships):
- **GitHub PAT auth** — gates US-003 + every read/write story
- **Agent WebSocket/SSE** — gates US-043, US-044 (mock-first acceptable for MVP)
- **Proposal persistence** — gates US-020, US-021 (proposals must survive Obsidian restart)

## Component / port inventory

### New domain
- Aggregates: `Issue`, `Task`, `Proposal`, `Agent`
- Repositories: `IssueRepository`, `TaskRepository`, `ProposalRepository` (vault-backed JSON), `AgentRepository` (in-memory, sourced from AgentRuntimePort)
- Use cases (application layer, all returning `Result<T, E>`):
  - Issues: `GetIssuesUseCase`, `GetIssueDetailsUseCase`, `UpdateIssueUseCase`, `CreateIssueUseCase`
  - Proposals: `ListProposalsUseCase`, `AcceptProposalUseCase`, `RejectProposalUseCase`
  - Tasks: `ListTasksUseCase`, `CreateTaskUseCase`, `UpdateTaskStatusUseCase`, `AssignTaskToAgentUseCase`
  - PRs: `GetPullRequestUseCase`, `ApprovePullRequestUseCase`, `MergePullRequestUseCase` (gate-enforcing), `MarkDraftReadyUseCase`
  - Agents: `GetAgentsUseCase`, `SendAgentMessageUseCase`, `SubscribeToAgentMessagesUseCase`
  - Activity: `GetActivityFeedUseCase`, `SubscribeToActivityFeedUseCase`

### New infrastructure
- `GitHubAdapter` + `MockGitHubAdapter` — implements `GitHubPort`
- `AgentRuntimeAdapter` + `MockAgentRuntimeAdapter` — implements `AgentRuntimePort`
- `ProposalRepository` — vault-backed `.specorator/proposals.json`
- Existing `MockBridge` + `LocalStorageBridge` + `ObsidianBridge` gain no new responsibilities; the new ports get their own adapter classes.

### UI (Vue 3 + Pinia + vue-router)
- Reusable atoms: `StatusPill`, `Avatar`, `ProgressBar`, `IconButton`, `Toast`, `ModalShell`, `Dropdown`, `DiffViewer`, `TypedAvatar`, `ActivityEventRow`
- Left sidebar: `LeftSidebar`, `ActionRow`, `IssueRow`, `PRRow`, `CollapsibleSection`
- Main shell: `Topbar`, `Breadcrumb`, `Actbar`
- Main view: `IssueWorkspace`, `IssueHeader`, `ProposalCard`, `TaskCard` (3 variants), `BreakdownCard` *(deferred)*, `RelatedFiles`, `PRHeader`, `ChangedFiles`, `ActivityTimeline`, `TaskDetail`, `ActivityFeed`
- Right sidebar: `TasksPanel`, `QuickAddForm`, `AgentsList`, `AgentChat`, `PRPanel` (Linked Issues + CI Checks + Review & Merge), `ContextualAIInput`
- Modals: `NewIssueModal`, `EditIssueModal`, `DiffModal`, `AgentPicker`

### Theme
- New CSS file `src/ui/styles/specorator-tokens.css` maps prototype tokens → Obsidian variables (`var(--background-primary, …)`, `var(--text-normal, …)`, etc.). No Google Fonts at runtime.

## Known design ambiguities (escalate during enrichment)

1. **AI footer vs. agent chat input** — same component or different? Design Brief shows AI Footer only on Tasks + PR panels; Agents panel has its own input. Resolution: two distinct components (`ContextualAIInput` for issue/PR-scoped queries; `AgentChat`'s own textarea for direct agent messaging).
2. **Sidebar active-row sync** — Handoff explicitly warns about a past bug. Resolution: drive `.active` from `useAppStateStore.issueId` exclusively; no `getElementById` patterns.
3. **Proposal persistence sequencing** — when is `.specorator/proposals.json` written? Resolution: every `Accept`/`Reject` use case writes-through immediately; reload-on-init pulls into `useEntitiesStore`.
4. **Task list scroll on agent switch** — preserve per-agent or reset? Resolution: reset to top on agent switch (simpler MVP default).
5. **Breakdown card 700ms delay** — arbitrary in prototype; if we ship a UI shell without the agent runtime, the Breakdown card is cut entirely for MVP.

## Cross-cutting concerns confirmed by ≥2 reviewers

- **Empty / error / offline states** — design package shows only populated layouts. MVP must add empty states for issues, proposals, tasks, agents, activity feed; error states for GitHub auth failures, rate limits, agent disconnects.
- **A11y** — focus traps on modals, ARIA roles (`role="listitem"`, `aria-selected`, `aria-current="page"`, `aria-live="polite"` on agent chat), keyboard nav (Tab order, Esc closes top modal LIFO, Enter submits, Shift+Enter newline), reduced-motion respect.
- **Test fixtures** — canonical structure under `tests/__fixtures__/` mirroring the prototype's hardcoded data (issues, PRs, tasks, agents, proposals, activity events, code tokens). Factory helpers `createIssue(overrides)`, `createTask(overrides)`, etc.
- **Performance** — sidebar virtualization for large issue lists; activity-feed append-only updates (no full re-render).

## Recommended issue breakdown

The breakdown below is the source of truth for the GitHub issues created by this orchestration. Each issue is a parallel-implementable plan on its own; cross-issue dependencies are explicit in the `Depends on` field of each issue body.

**Foundation layer (5 issues — partially serial):**

- **F1 — Spec-first foundation:** ADR pack (8 ADRs above) + `specs/specorator-mvp-workspace/` entry with `idea.md`, `research.md`, `requirements.md` (EARS), `design.md` (component breakdown), `workflow-state.md`. Unlocks every other issue.
- **F2 — Domain layer:** Issue / Task / Proposal / Agent aggregates with invariants; repositories; `Result<T, E>` boundaries. No infra wiring; pure domain. Unblocks F3 and the use cases referenced by V-issues.
- **F3 — Ports + mock adapters:** `GitHubPort` + `AgentRuntimePort` interfaces; `MockGitHubAdapter` + `MockAgentRuntimeAdapter` using the prototype's fixture data so `npm run dev` works end-to-end against in-memory data; `VaultPort` proposal extensions. Production adapters deferred to X1.
- **F4 — UI shell:** Pinia stores, `/workspace/*` routes, theme tokens, reusable atoms (StatusPill, Avatar, ProgressBar, IconButton, Toast, ModalShell, Dropdown, DiffViewer, TypedAvatar, ActivityEventRow), test fixtures + factory helpers.
- **F5 — GitHub auth + settings:** PAT entry UI, repo selector, settings persistence, error handling for auth failures. Conditional gate for several stories.

**Vertical slices (8 issues — parallelizable after F1–F4):**

- **V1 — Left Sidebar:** Actions row, Issues section (collapsible), PRs section (collapsed by default), active-row sync to `useAppStateStore.issueId`.
- **V2 — Main shell:** Topbar + Breadcrumb (with `prevMain` back-nav) + Actbar (visible on issue/PR only). Actbar buttons for Edit Issue + Create PR; Triage / Break Down cut.
- **V3 — Issue Workspace:** Issue Header (with context block + progress bar), Proposal Cards (pending/accepted/rejected lifecycle), Task sections (In Progress / Up Next / Completed), Related Files (aggregated from PRs + proposals).
- **V4 — PR Detail:** PR Header (with diff stats bar), Changed Files (clickable → DiffModal), Activity Timeline (events, commits, CI, comments, reviews).
- **V5 — Task Detail + Activity Feed:** Task Detail meta grid + subtask checkboxes; Global Activity Feed grouped by day with event-row navigation.
- **V6 — Tasks Panel:** Right-sidebar Tasks Panel header (`◉ Agents` + `+ Add Task`), Quick-add form, grouped Task list (issue vs. backlog), Contextual AI Input footer.
- **V7 — Agents Panel + Agent Chat:** Agents list (Running / Queued), Agent Chat with 4 message types (sys / agent / tool / user), typing indicator, textarea (Enter sends, Shift+Enter newline), back-nav to Tasks.
- **V8 — PR Panel + Merge Gate:** Right-sidebar PR Panel — Linked Issues, CI Checks (collapsed by default), unified Review & Merge with gate enforcement (use case re-checks gate), Mark-as-Ready for draft PRs, PR-scoped AI input.
- **V9 — Modals + AgentPicker:** `NewIssueModal`, `EditIssueModal`, `DiffModal` (proposal + PR-file variants), `AgentPicker` dropdown.

**Cross-cutting (3 issues):**

- **X1 — Proposal persistence layer:** `.specorator/proposals.json` schema + write-through on Accept/Reject + reload on plugin init. Acceptance is immutable.
- **X2 — E2E flows + a11y pass:** 5 critical Storybook+Playwright flows (proposal lifecycle, PR merge gate, multi-issue nav, task→agent chat, activity feed nav) + a11y audit (focus traps, ARIA roles, keyboard nav).
- **X3 — Performance + production adapters:** Sidebar virtualization, append-only activity feed updates, production `GitHubAdapter` (real GitHub API) + production `AgentRuntimeAdapter` (WebSocket/SSE).

Total: 1 epic + 5 foundation + 9 verticals + 3 cross-cutting = **18 issues** (epic counted separately).
