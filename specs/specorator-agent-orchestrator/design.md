---
id: DESIGN-SAO-001
title: Specorator Agent Orchestrator — architecture design
stage: design
feature: specorator-agent-orchestrator
status: draft
owner: architect
source: docs/superpowers/specs/2026-05-09-specorator-agent-orchestrator-design.md
created: 2026-05-09
updated: 2026-05-09
---

## Summary

Symphony-inspired orchestration subsystem for Specorator. Continuous agent dispatch with three triggers, isolated git worktrees per feature, Claude Code CLI subprocess model, two new narrow ports, and exponential-backoff retry. Requires formal requirements stage before implementation gate opens.

---

## 1. Overview

**Specorator Agent Orchestrator (SAO)** polls the vault for features in active stages, dispatches isolated Claude Code CLI processes into per-feature git worktrees, and advances the feature's workflow stage on successful completion.

SAO is distinct from the Claude CLI chat sidebar. The sidebar is a conversational surface — "ask and receive." SAO is the automation engine — "set it and dispatch." Both consume the same `ClaudeCliPort` seam.

**Reference:** [OpenAI Symphony SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)

---

## 2. Components

| Component | Class | Role |
|---|---|---|
| Workflow Loader | `AgentWorkflowLoader` | Reads per-stage prompt templates from `templates/agent-stages/{stage}.md`; optional per-feature override at `specs/{slug}/AGENT.md` |
| Config Layer | `PluginSettings.agentOrchestrator` | Typed getters with defaults; dynamic reload on settings change |
| Feature Tracker | `FeatureTrackerAdapter` | Wraps `MetadataCachePort` + `VaultPort` to list active features and read `workflow-state.md` |
| Orchestrator | `AgentOrchestrator` | Poll loop, state machine, dispatch decisions, retry schedule |
| Workspace Manager | `WorktreeManager` | Creates/reuses `git worktree add` per feature slug; lifecycle hooks |
| Agent Runner | `ClaudeAgentRunner` | Forks `claude` CLI subprocess in worktree dir; streams output; reuses `ClaudeCliPort` |
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

**"Issue" mapping:** a `Feature` at an active, un-drafted stage is a dispatchable candidate.
**Terminal states:** `archived`, `abandoned` — never dispatched.

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

### Dispatch triggers (priority order)

1. **Background poller** — configurable interval (default 60 s); reconciles stalled runs, dispatches up to `maxConcurrentAgents`
2. **Stage-advance hook** — `AdvanceFeatureStageUseCase` emits event; orchestrator claims immediately
3. **Manual dispatch** — "Run agent" command/button; bypasses poll, claims + dispatches directly

### Dispatch eligibility (all must pass)

- Feature in active (non-terminal) state
- Stage artifact file absent (consistent with REQ-AVS-005 overwrite protection)
- Feature not already claimed or running
- Global concurrency slot available
- No non-terminal blockers

---

## 5. Workspace Management

Each feature gets one git worktree, created once and reused across retries:

```bash
git worktree add .worktrees/{slug} HEAD
```

**`WorktreeManager`:**
- `ensureWorktree(slug)` — idempotent; creates if absent
- `removeWorktree(slug)` — `git worktree remove --force` on release
- Path containment invariant enforced; slug sanitized to `[A-Za-z0-9._-]`

**Lifecycle hooks** (shell scripts in `templates/agent-hooks/`):

| Hook | When | Failure |
|---|---|---|
| `after_create` | New worktree only | Abort dispatch |
| `before_run` | Before each attempt | Abort attempt |
| `after_run` | After each attempt | Log + ignore |
| `before_remove` | Before removal | Log + ignore |

**New port:** `WorktreePort` (ADR-008) — wraps `child_process` in `ObsidianBridge`; stub in `MockBridge`.

---

## 6. Agent Runner + Prompt Templates

**`ClaudeAgentRunner`** forks per attempt:

```bash
claude --dangerously-skip-permissions --output-format stream-json
```

**Thread continuity:** first attempt creates thread; retries resume same `sessionId`.

**Prompt templates:**

- Global: `templates/agent-stages/{stage-slug}.md`
- Override: `specs/{slug}/AGENT.md` (optional)
- Variables: `{{ feature.slug }}`, `{{ feature.title }}`, `{{ stage }}`, `{{ attempt }}`
- Strict variable checking — unknown vars fail dispatch
- Empty body → minimal default prompt

**Success:** agent exits 0 AND stage artifact file exists in worktree → merge to originating branch (captured at dispatch time) → `AdvanceFeatureStageUseCase` → `Unclaimed`.

---

## 7. Error Handling & Recovery

| Class | Example | Recovery |
|---|---|---|
| Config/template | Unknown template variable | Skip dispatch; warn + notify |
| Workspace | `git worktree add` fails | Abort dispatch; release claim |
| Hook | `before_run` non-zero | Abort attempt; queue retry |
| Agent | CLI exits non-zero or times out | Queue retry; exponential backoff |
| Tracker | `MetadataCachePort` read fails | Skip tick; retain state |
| Reconciliation | Stall detection fails | Retain workers; retry next tick |

**Retry formula:**
```
delay = min(10_000 * 2^(attempt - 1), maxRetryBackoffMs)
```
Default max: 3 attempts, 300 000 ms backoff cap. Exhaustion → `Released` + sticky `NotificationPort` error.

**Restart recovery:** no persistent DB. On plugin load — scan worktrees, cross-reference vault state, re-claim features with absent artifacts, remove orphaned worktrees.

---

## 8. Ports, Observability & Settings

### New narrow ports (ADR-008)

```ts
interface WorktreePort {
  ensureWorktree(slug: Slug): Promise<Result<WorktreeHandle>>
  removeWorktree(slug: Slug): Promise<Result<void>>
  runHook(hook: HookName, worktreePath: string, timeoutMs: number): Promise<Result<void>>
}

interface OrchestratorPort {
  dispatch(slug: Slug): Promise<Result<void>>
  cancel(slug: Slug): Promise<Result<void>>
  getStatus(): OrchestrationSnapshot
}

interface OrchestrationSnapshot {
  running: Array<{ slug: string; stage: string; attempt: number; tokens: TokenCount }>
  retryQueue: Array<{ slug: string; dueAt: Date; lastError: string }>
  totalTokens: TokenCount
  uptimeSeconds: number
}
```

### Settings additions

```ts
agentOrchestrator: {
  enabled: boolean            // default: false
  pollingIntervalMs: number   // default: 60_000
  maxConcurrentAgents: number // default: 2
  maxAttempts: number         // default: 3
  maxRetryBackoffMs: number   // default: 300_000
  worktreeRoot: string        // default: '.worktrees'
}
```

Dynamic reload: changes apply to future ticks without plugin restart.

---

## Open Decisions

| # | Question | Owner |
|---|---|---|
| 1 | Per-feature `AGENT.md` override: MVP or deferred? | pm |
| 2 | Merge strategy after agent success: cherry-pick vs. `git merge --no-ff`? | architect |
| 3 | `WorktreePort` flat in `src/domain/ports/` vs. sub-namespace `src/domain/ports/worktree/`? | architect |
