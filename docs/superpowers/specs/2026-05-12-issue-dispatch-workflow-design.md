# Issue → Dispatch → PR Review Workflow — Design

**Date:** 2026-05-12  
**Status:** approved  
**Supersedes:** `specs/workflow-navigation-ui/` (IDEA-WNU-001 archived)  
**Related specs:** `specs/claude-cli-chat-sidebar/` (ClaudeCliPort dependency), `specs/specorator-agent-orchestrator/` (future orchestrator seam)

---

## 1. Problem

Users need a single, cohesive surface to open an issue, triage it into tasks, dispatch tasks to Claude CLI agents, review the agent's proposed work, and close the issue — without leaving Obsidian or juggling terminals. The current plugin has no issue concept, no dispatch loop, and no PR review boundary.

---

## 2. Scope

**In scope:**
- `Issue`, `Task`, `PrArtifact` domain aggregates + state machines
- Vault schema: `issues/<slug>/`, `tasks/<slug>.md`
- `IssueRepository` + `IssuePort`
- Three agent dispatch flows: triage, task dispatch, improve re-dispatch
- 3-panel Obsidian UI: left issue/PR list, main detail view, right AI panel
- Use cases: `CreateIssue`, `TriageIssue`, `DispatchTask`, `ReviewPrArtifact`, `CloseIssue`
- Prompt templates: `triage.md`, `task-dispatch.md`, `task-improve.md`

**Out of scope (this increment):**
- GitHub issue/PR sync
- Git worktree isolation for agent runs (deferred to SAO)
- Actual code file writes by agents (agents write PR description artifacts only)
- Conversation history persistence
- Multi-agent orchestration (SAO)

---

## 3. Architecture

Follows ADR-001 (DDD layered architecture). Import direction: domain ← application ← infrastructure ← ui.

### 3.1 New domain entities (`src/domain/issue/`)

| Entity | Aggregate root | Vault file |
|---|---|---|
| `Issue` | yes | `issues/<slug>/issue.md` |
| `Task` | yes | `tasks/<task-slug>.md` |
| `PrArtifact` | yes | `issues/<slug>/prs/<pr-slug>.md` |

All aggregates expose mutations returning `Result<T, E>` (ADR-004). No cross-aggregate mutation.

### 3.2 New port (`src/domain/ports/IssuePort.ts`)

```ts
interface IssuePort {
  readIssue(slug: string): Promise<Result<IssueFile>>
  writeIssue(slug: string, content: string): Promise<Result<void>>
  listIssues(): Promise<Result<string[]>>
  readTask(slug: string): Promise<Result<TaskFile>>
  writeTask(slug: string, content: string): Promise<Result<void>>
  listTasks(issueSlug: string): Promise<Result<string[]>>
  readPrArtifact(issueSlug: string, prSlug: string): Promise<Result<PrArtifactFile>>
  writePrArtifact(issueSlug: string, prSlug: string, content: string): Promise<Result<void>>
}
```

InjectionKey: `ISSUE_PORT`. Composable: `useIssuePort()`.  
Agent execution reuses `ClaudeCliPort` (from CCS spec) — no new agent port.

### 3.3 New application use cases (`src/application/issue/`)

- `CreateIssueUseCase` — writes `issues/<slug>/issue.md`, status `open`
- `TriageIssueUseCase` — dispatches triage agent via `ClaudeCliPort`; on success reads produced task files, updates issue status to `triaged`
- `DispatchTaskUseCase` — dispatches task agent; on exit reads PR artifact, transitions task to `reviewing`
- `ReviewPrArtifactUseCase` — accept / decline / improve; transitions issue, task, PR artifact states accordingly
- `CloseIssueUseCase` — guards all tasks `done` or `rejected`; sets issue `closed`

### 3.4 New repository (`src/infrastructure/issue/IssueRepository.ts`)

Implements `IssuePort` via `VaultPort`. Owns:
- YAML frontmatter parse/serialize for all three schemas
- Slug collision guard (appends `-2`, `-3` etc. on conflict)
- Malformed frontmatter returns `Result.err` — never throws
- All user-sourced path components (issue slug, task slug, PR slug) pass through `normalizeVaultPath` (`src/infrastructure/vault/VaultPath.ts`) before forwarding to `VaultPort` — ADR-008 appendix invariant

---

## 4. Vault Schema

### `issues/<slug>/issue.md`

```yaml
---
id: ISS-<slug>
title: ""
status: open | triaged | in-progress | reviewing | closed | abandoned
tasks: []          # task slug refs
prs: []            # pr slug refs
created: ISO8601
updated: ISO8601
---
```

Body: free-form markdown (user-authored issue description).

### `tasks/<task-slug>.md`

```yaml
---
id: TSK-<slug>
issue: <issue-slug>
title: ""
status: open | dispatched | reviewing | done | rejected
pr: ""             # pr slug, set when dispatched
created: ISO8601
updated: ISO8601
---
```

Body: task scope + acceptance criteria (agent-authored on triage).

### `issues/<slug>/prs/<pr-slug>.md`

```yaml
---
id: PR-<slug>
issue: <issue-slug>
task: <task-slug>
status: draft | pending-review | accepted | declined | improving
revision: 1
created: ISO8601
updated: ISO8601
---
```

Body: agent-authored description of work done + file references (paths + line ranges).

`issuesFolder` and `tasksFolder` are new `PluginSettings` keys (defaults: `issues`, `tasks`).

---

## 5. State Machines

### Issue

```
open → triaged → in-progress → reviewing → closed
                                         ↘ abandoned
```

| Transition | Trigger |
|---|---|
| `open → triaged` | `TriageIssueUseCase` succeeds; task files written |
| `triaged → in-progress` | First task dispatched |
| `in-progress → reviewing` | At least one PR artifact reaches `pending-review` |
| `reviewing → in-progress` | PR declined or sent to improve |
| `reviewing → closed` | All tasks `done`; all PRs `accepted` |
| any → `abandoned` | User explicitly closes with no resolution |

### Task

```
open → dispatched → reviewing → done
                  ↘ rejected
       (improve)  ↗
reviewing → open
```

| Transition | Trigger |
|---|---|
| `open → dispatched` | `DispatchTaskUseCase` fires agent subprocess |
| `dispatched → reviewing` | Agent exits cleanly; PR artifact written |
| `reviewing → done` | User accepts PR artifact |
| `reviewing → open` | User sends PR to improve (re-dispatchable) |
| `reviewing → rejected` | User declines PR artifact |

### PrArtifact

```
draft → pending-review → accepted
                       ↘ declined
                       ↘ improving → pending-review (loop)
```

| Transition | Trigger |
|---|---|
| `draft → pending-review` | Agent subprocess exits; artifact written |
| `pending-review → accepted` | `ReviewPrArtifactUseCase(decision: accept)` |
| `pending-review → declined` | `ReviewPrArtifactUseCase(decision: decline)` |
| `pending-review → improving` | `ReviewPrArtifactUseCase(decision: improve)` |
| `improving → pending-review` | Re-dispatch agent exits; artifact updated |

---

## 6. UI Layout

Three Obsidian surfaces registered on plugin load.

### Left panel — `specorator-issues` leaf

Two stacked sections:

**Issues** — grouped by status (`open` → `triaged` → `in-progress` → `reviewing` → `closed`). Each row: status icon + title + task count badge. Click → main view (issue mode).

**Active PRs** — only `pending-review` artifacts. Each row: status icon + PR title + parent issue name. Click → main view (PR artifact mode).

### Main view — `SpecoratorIssueView`

**Issue mode:** rendered markdown of `issue.md` body + metadata header (status, task count, dates). Read-only.

**PR artifact mode:** rendered markdown of `prs/<pr-slug>.md` body. Accept / Decline / Improve buttons inline at top.

### Right panel — `specorator-agent` leaf

Four zones top-to-bottom:

1. **Stage progress bar** — horizontal stepper: `open → triaged → in-progress → reviewing → closed`. Highlights active state.
2. **Task list** — one row per task; status icon (`open` / `dispatched` / `reviewing` / `done` / `rejected`). Click row to select for single-task dispatch.
3. **Action bar** — context-driven:
   - Issue `open`: **Triage** only
   - Issue `triaged`: **Dispatch all** + **Dispatch selected** (requires row selection)
   - Issue `reviewing`: **Accept** / **Decline** / **Improve** per open PR
4. **Agent chat** — free-form input scoped to active issue. Sends issue + tasks + active PR context to `ClaudeCliPort`. Response streams into chat area above input.

---

## 7. Agent Dispatch

All agents execute via `ClaudeCliPort`. Fire-and-watch: stdout streams into `agentStreamStore` (Pinia); state transition fires on process exit.

### Triage agent

Input: issue body + metadata + `templates/agent-prompts/triage.md`  
Output: N `tasks/<slug>.md` files + updated issue frontmatter (`tasks: [...]`, `status: triaged`)

### Task dispatch agent

Input: task file + parent issue body + any linked design/plan artifacts + `templates/agent-prompts/task-dispatch.md`  
Output: `issues/<slug>/prs/<pr-slug>.md` (description + file references) + task frontmatter updated (`status: reviewing`, `pr: <slug>`)

### Improve re-dispatch agent

Input: task dispatch base + existing PR artifact body + user feedback text + `templates/agent-prompts/task-improve.md`  
Output: overwrites PR artifact body; frontmatter `status → pending-review`; `revision` incremented

---

## 8. Data Flow

```
User action (Vue component)
  → composable → use case
      ├── IssueRepository (IssuePort → VaultPort) → vault files
      └── ClaudeCliPort → agent subprocess
            └── stdout → agentStreamStore (Pinia) → chat area
  → on agent exit: use case reads artifact, transitions state
  → IssueRepository persists new state
  → Pinia store updated (plain DTOs)
  → Vue reactive UI update
```

Use cases own all state transitions. Vue components never mutate domain objects directly.

---

## 9. Error Handling

| Scenario | Handling |
|---|---|
| Agent subprocess times out | Task stays `dispatched`; retry button in action bar; `NotificationPort.showError` |
| Agent writes malformed frontmatter | `IssueRepository.parse` returns `err`; `NotificationPort.showError`; state unchanged |
| Slug collision on write | Append `-2`, `-3` suffix until unique |
| Issue closed mid-dispatch | `DispatchTaskUseCase` guards on issue status; returns `err("issue-not-active")` |
| `ClaudeCliPort` unavailable | Action bar replaces dispatch buttons with install prompt; chat disabled |
| User declines PR during active stream | `ClaudeCliPort.abort()`; task reset to `open` |

---

## 10. Testing

- **Domain:** unit tests for all state machine transitions and guards. No vault, no Claude.
- **Use cases:** `fakeModulePorts()` (ADR-009) with fake `IssuePort` + `ClaudeCliPort` stub. One test per transition path.
- **Repository:** `IssueRepository` against `MockBridge` — round-trip serialize/deserialize, collision guard, malformed-frontmatter parse.
- **UI:** PageObject pattern (ADR-009), `data-testid` only. Covers: left panel grouping, action bar context correctness, stream text in chat area.
- **Coverage gate:** existing 80/70/80/80 thresholds apply to all new `src/domain/issue/` and `src/application/issue/` code.
