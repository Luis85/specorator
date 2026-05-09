# Specorator Agent Orchestrator — Design

**Date:** 2026-05-09
**Author:** Luis Mendez (brainstorm session with Claude)
**Status:** Approved — ready for spec + plan
**Depends on:** `agent-interaction-placeholder`, `claude-cli-chat-sidebar`

---

## 1. Overview

**Specorator Agent Orchestrator (SAO)** is a Symphony-inspired subsystem that continuously manages autonomous agent runs against Specorator features. It polls the vault for features in active stages, dispatches isolated Claude Code CLI processes into per-feature git worktrees, and advances the feature's workflow stage on successful completion.

SAO is distinct from the Claude CLI chat sidebar (`claude-cli-chat-sidebar`). The sidebar is a conversational surface — "ask and receive." SAO is the automation engine — "set it and dispatch." Both consume the same `ClaudeCliPort` seam.

**Reference:** [OpenAI Symphony SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md) — the architecture and vocabulary (orchestrator, workspace manager, agent runner, hooks, retry formula) are adapted directly for Specorator's DDD/narrow-ports stack.

---

## 2. Components

| Component | Class | Role |
|---|---|---|
| Workflow Loader | `AgentWorkflowLoader` | Reads per-stage prompt templates from `templates/agent-stages/{stage}.md` or per-feature override `specs/{slug}/AGENT.md` |
| Config Layer | `PluginSettings.agentOrchestrator` | Typed getters with defaults; dynamic reload on settings change |
| Feature Tracker | `FeatureTrackerAdapter` | Wraps `MetadataCachePort` + `VaultPort` to list active features and read `workflow-state.md` |
| Orchestrator | `AgentOrchestrator` | Poll loop, state machine, dispatch decisions, retry schedule |
| Workspace Manager | `WorktreeManager` | Creates/reuses `git worktree add` per feature slug; lifecycle hooks |
| Agent Runner | `ClaudeAgentRunner` | Forks `claude` CLI subprocess in worktree dir; streams output; second consumer of `ClaudeCliPort` |
| Status Surface | `AgentStatusPanel.vue` | Sidebar panel showing per-feature run state + token count |
| Logging | `LoggerPort` | Structured events with `session_id` + `feature_slug` context |

---

## 3. Domain Model

**Location:** `src/domain/orchestrator/`

```ts
type OrchestrationState =
  | 'unclaimed'
  | 'claimed'
  | 'running'
  | 'retry-queued'
  | 'released'

interface AgentRun {
  featureSlug: Slug
  stage: FeatureStep
  worktreePath: string
  state: OrchestrationState
  attempt: number
  sessionId: string        // Claude Code thread id
  startedAt: Date | null
  tokenCount: TokenCount
}

interface RetryEntry {
  featureSlug: Slug
  attempt: number
  dueAt: Date
  lastError: string
}

interface WorktreeHandle {
  slug: Slug
  path: string
  createdAt: Date
}

interface TokenCount {
  input: number
  output: number
}
```

**"Issue" mapping:** A `Feature` at an active, un-drafted stage is a dispatchable candidate.
**Terminal states:** `archived`, `abandoned` — never dispatched.
**Eligible condition:** active stage + stage artifact file absent.

---

## 4. Orchestration State Machine + Polling

### State transitions

```
Unclaimed   → Claimed      (dispatch preflight passes)
Claimed     → Running      (worktree ready, agent forked)
Running     → Unclaimed    (agent succeeded + stage advanced)
Running     → RetryQueued  (agent failed, retry budget remains)
RetryQueued → Claimed      (retry timer fires)
Any         → Released     (feature terminal, removed from vault, or max retries exceeded)
```

### Three dispatch triggers (priority order)

1. **Background poller** — configurable interval (default 60 s); reconciles stalled runs, fetches candidates, dispatches up to `maxConcurrentAgents` slots
2. **Stage-advance hook** — `AdvanceFeatureStageUseCase` emits an event; orchestrator immediately claims new stage without waiting for the next poll tick
3. **Manual dispatch** — user presses "Run agent" in sidebar or command palette; bypasses poll, directly claims + dispatches

### Dispatch eligibility (all must pass)

- Feature is in an active (non-terminal) state
- Current stage artifact file is absent (no overwrite protection consistent with REQ-AVS-005)
- Feature not already claimed or running
- Global concurrency slot available (`maxConcurrentAgents`)
- No non-terminal blockers

---

## 5. Workspace Management

Each feature gets one git worktree, created once and reused across retries:

```bash
git worktree add .worktrees/{slug} HEAD
```

**`WorktreeManager`** responsibilities:
- `ensureWorktree(slug)` — idempotent; creates if absent, returns absolute path
- `removeWorktree(slug)` — `git worktree remove --force`; called on release
- Path containment invariant: all paths must remain under `agentWorktreeRoot`
- Slug sanitized to `[A-Za-z0-9._-]` before use as directory name

**Lifecycle hooks** (configurable timeouts; shell scripts in `templates/agent-hooks/`):

| Hook | When | Failure |
|---|---|---|
| `after_create` | New worktree only | Abort dispatch |
| `before_run` | Before each attempt | Abort current attempt |
| `after_run` | After each attempt | Log + ignore |
| `before_remove` | Before removal | Log + ignore |

**New port:** `WorktreePort` (ADR-008) — `ensureWorktree`, `removeWorktree`, `runHook`. Wraps `child_process` in `ObsidianBridge`; stub returns success in `MockBridge`.

---

## 6. Agent Runner + Prompt Templates

**`ClaudeAgentRunner`** forks one subprocess per attempt inside the worktree directory:

```bash
claude --dangerously-skip-permissions --output-format stream-json
```

**Thread continuity:** first attempt creates a new Claude Code thread (`sessionId`); retries resume the same thread.

**Prompt templates** (Symphony's `WORKFLOW.md` equivalent):

- Global templates at `templates/agent-stages/{stage-slug}.md`
- Per-feature override at `specs/{slug}/AGENT.md` (optional; same YAML frontmatter + Markdown body pattern as Symphony's `WORKFLOW.md`)
- Variables: `{{ feature.slug }}`, `{{ feature.title }}`, `{{ stage }}`, `{{ attempt }}` (null on first run)
- Strict variable checking — unknown variables fail dispatch
- Empty body → minimal default prompt (fallback)

**Success condition:** agent exits 0 AND stage artifact file now exists in the worktree. On success: merge worktree changes to originating branch (captured at dispatch time) → call `AdvanceFeatureStageUseCase` → transition to `Unclaimed`.

---

## 7. Error Handling & Recovery

### Failure classes

| Class | Example | Recovery |
|---|---|---|
| Config/template | Unknown template variable | Skip dispatch; warn + notify |
| Workspace | `git worktree add` fails | Abort dispatch; release claim |
| Hook | `before_run` non-zero exit | Abort attempt; queue retry |
| Agent | Claude CLI exits non-zero or times out | Queue retry with exponential backoff |
| Tracker | `MetadataCachePort` read fails | Skip current tick; retain state |
| Reconciliation | Stall detection fails | Retain current workers; retry next tick |

### Retry formula (direct from Symphony)

```
delay = min(10_000 * 2^(attempt - 1), maxRetryBackoffMs)
```

Default `maxRetryBackoffMs`: 300 000 ms (5 min). Default `maxAttempts`: 3. Exceeding max → `Released` + sticky error notice via `NotificationPort`.

### Restart recovery

No persistent DB. On plugin load:
1. Scan all worktrees under `agentWorktreeRoot`
2. Cross-reference vault feature states via `MetadataCachePort`
3. Re-claim features whose stage artifact is still absent
4. Remove orphaned worktrees (feature gone from vault)

---

## 8. Ports, Observability & Settings

### New narrow ports (ADR-008)

**`WorktreePort`**
```ts
interface WorktreePort {
  ensureWorktree(slug: Slug): Promise<Result<WorktreeHandle>>
  removeWorktree(slug: Slug): Promise<Result<void>>
  runHook(hook: HookName, worktreePath: string, timeoutMs: number): Promise<Result<void>>
}
```

**`OrchestratorPort`**
```ts
interface OrchestratorPort {
  dispatch(slug: Slug): Promise<Result<void>>
  cancel(slug: Slug): Promise<Result<void>>
  getStatus(): OrchestrationSnapshot
}
```

### `OrchestrationSnapshot`

```ts
interface OrchestrationSnapshot {
  running: Array<{ slug: string; stage: string; attempt: number; tokens: TokenCount }>
  retryQueue: Array<{ slug: string; dueAt: Date; lastError: string }>
  totalTokens: TokenCount
  uptimeSeconds: number
}
```

### Settings additions

```ts
// src/domain/settings/PluginSettings.ts
agentOrchestrator: {
  enabled: boolean            // default: false (explicit opt-in)
  pollingIntervalMs: number   // default: 60_000
  maxConcurrentAgents: number // default: 2
  maxAttempts: number         // default: 3
  maxRetryBackoffMs: number   // default: 300_000
  worktreeRoot: string        // default: '.worktrees'
}
```

**Dynamic reload:** changes to `PluginSettings.agentOrchestrator` apply to future ticks without plugin restart (mirrors Symphony's WORKFLOW.md reload contract).

---

## Dependencies & Constraints

- `ClaudeCliPort` (from `claude-cli-chat-sidebar`) must be implemented before SAO's `ClaudeAgentRunner` can be wired up. SAO depends on it; it does not reimplement it.
- `agent-interaction-placeholder`'s `IAgentBridge` typed seam should be evolved to expose `OrchestratorPort` — SAO is the v2.0 implementation that satisfies that interface.
- `WorktreePort` implementation must not be available in `LocalStorageBridge` (GitHub Pages); SAO is disabled when `WorktreePort` is absent.
- All agent subprocess execution stays isolated to the worktree directory — no access to the main Obsidian vault process.
- `enabled: false` by default — users opt in explicitly.

---

## Open Questions

1. Should the per-feature `AGENT.md` template override be a Phase 4 stretch goal, or required for MVP?
2. Should `WorktreePort` live in `src/domain/ports/` alongside the existing five, or in a new `src/domain/ports/worktree/` sub-namespace?
3. Merge strategy after agent success: cherry-pick vs. `git merge --no-ff`? Cherry-pick is cleaner but loses merge commit context.
