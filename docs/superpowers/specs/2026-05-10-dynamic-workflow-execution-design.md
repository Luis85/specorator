# Dynamic Workflow Execution — Design

**Date:** 2026-05-10
**Author:** Luis Mendez (brainstorm session with Claude)
**Status:** Proposed — paired with REQ-0005
**Requirement:** `requirements/intake/REQ-0005-dynamic-workflow-execution.md`
**Depends on:** `claude-cli-chat-sidebar` (Phase 4)

---

## 1. Overview

Execute an Obsidian Canvas as an ordered linear chain of SKILL.md notes. Plugin parses the `.canvas` JSON, topologically sorts a single-path graph, and sequentially invokes each skill through a narrow `AgentExecutionPort` backed by the Claude CLI sidebar bridge. Each step's input and output is persisted as markdown under `{workflowRunsFolder}/{run-id}/` — where `workflowRunsFolder` is a configurable `PluginSettings` field (default `specs/workflow-runs`).

MVP is linear-only. Branching DAGs, conditionals, loops, and sub-workflows are explicit follow-up REQs.

---

## 2. Components

| Component | Layer | Role |
|---|---|---|
| `Workflow` aggregate | domain | Parses canvas JSON + skill notes; enforces graph constraints; produces ordered step list |
| `WorkflowRun` aggregate | domain | Tracks run-id, current step, scratch paths, terminal status |
| `CanvasParser` | domain | Pure function: `parse(json) → Result<WorkflowGraph>` |
| `SkillNote` value object | domain | Frontmatter (`name`, `description`, optional `triggers`, `tags`) + body |
| `AgentExecutionPort` | domain port | `runSkill(prompt, contextFiles) → Promise<Result<{ outputPath }>>` |
| `ClockPort` | domain port | `now() → Date` — deterministic run-id slugs (reuse if exists, else add) |
| `ExecuteWorkflowUseCase` | application | Orchestrates run: validate → create dir → loop steps → return `Result<WorkflowRun>` |
| Claude CLI bridge | infrastructure | Implements `AgentExecutionPort` — provided by `claude-cli-chat-sidebar` |
| Sidebar slash-command handler | UI | Parses `/workflow <canvas-path> <input>`; renders step progress |

---

## 3. Domain Model

**Location:** `src/domain/workflow/`

```ts
type WorkflowStep = {
  index: number              // 1-based
  skillPath: string          // vault path to SKILL.md
  skill: SkillNote
  scratchOutputName: string  // e.g. "02-rewrite-tests.md"
}

type WorkflowGraph = {
  steps: WorkflowStep[]      // ordered linear chain
  canvasPath: string
}

type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

type WorkflowRun = {
  runId: string              // {YYYY-MM-DD-HHmmss}-{canvas-basename}[-{NN}]
  runDir: string             // {workflowRunsFolder}/{runId}/  — workflowRunsFolder from PluginSettings
  graph: WorkflowGraph
  currentStepIndex: number   // 0 = pre-input
  status: WorkflowRunStatus
  startedAt: Date
  finishedAt: Date | null
  failure: WorkflowFailure | null
}

type WorkflowFailure =
  | { kind: 'CanvasNotFound'; path: string }
  | { kind: 'CanvasParseError'; reason: string }
  | { kind: 'UnsupportedCanvasNode'; nodeId: string; nodeType: string; detail?: string }
  | { kind: 'SkillNotFound'; path: string }
  | { kind: 'InvalidSkillFormat'; path: string; reason: string }
  | { kind: 'UnsupportedGraph'; reason: 'branch' | 'join' | 'multi-source' | 'multi-sink' | 'disconnected-node' | 'empty' }
  | { kind: 'CycleDetected' }
  | { kind: 'StepOutputMissing'; stepIndex: number }
  | { kind: 'AgentExecutionFailed'; stepIndex: number; stderr: string }
  | { kind: 'Cancelled'; stepIndex: number }
```

All domain mutations and use-case `execute` return `Result<T, WorkflowFailure>` per ADR-004.

---

## 4. Sequence

```
User                Sidebar           ExecuteWorkflowUseCase    AgentExecutionPort    VaultPort
 |                    |                       |                         |                  |
 | /workflow X.canvas "input"                 |                         |                  |
 |------------------->|                       |                         |                  |
 |                    | execute(canvasPath, input)                      |                  |
 |                    |---------------------->|                         |                  |
 |                    |                       | readFile(canvasPath) -------------------->|
 |                    |                       |<------------------- json -----------------|
 |                    |                       | parse + validate (linear)                  |
 |                    |                       |                         |                  |
 |                    |   ── pre-flight ──    | for each step i:        |                  |
 |                    |                       |   readFile(skillPath) ------------------->|
 |                    |                       |   parse + validate frontmatter             |
 |                    |                       | (any failure → Result.error, no agent call)|
 |                    |                       |                         |                  |
 |                    |                       | allocate runDir under {workflowRunsFolder} |
 |                    |                       |   (try base, then -2, -3 …) ------------->|
 |                    |                       | createFolder(runDir) -------------------->|
 |                    |                       | writeFile(00-input.md) ------------------>|
 |                    |                       |                         |                  |
 |                    |   ── execution ──     | for each step i:        |                  |
 |                    |                       | render prompt(pre-loaded body + prior      |
 |                    |                       |   scratch refs)                            |
 |                    |                       | runSkill(prompt, ctx) ->|                  |
 |                    |<-- step started ------|                         | (CLI subprocess) |
 |<-- progress line --|                       |                         | writes scratch --|
 |                    |                       |<------- Result.ok ------|                  |
 |                    |                       | verify scratch exists -------------------->|
 |                    |   end loop                                                          |
 |                    |<----------------- Result.ok(WorkflowRun) -------|                  |
 |<-- final output ---|                       |                         |                  |
```

Cancellation: sidebar's `Stop` button cancels the in-flight `runSkill` promise, which signals the CLI subprocess; the use case sets `status = 'cancelled'`, sets `failure = { kind: 'Cancelled', stepIndex }`, and returns. Partial scratch files are preserved.

---

## 5. Canvas JSON Contract

Obsidian's `.canvas` format is JSON with `nodes[]` (each `{ id, type, file? }`) and `edges[]` (each `{ id, fromNode, toNode }`). The parser:

1. Validates every entry in `nodes` is `type === 'file'` with `file` ending in `.md`. Any other node type (`text`, `link`, `group`, sub-`canvas`, etc.) or a `file` node pointing at a non-`.md` path fails the run with `UnsupportedCanvasNode { nodeId, nodeType }`. The parser does **not** silently drop non-SKILL nodes — extra nodes on the canvas always produce an explicit failure so authoring mistakes surface immediately.
2. Builds adjacency lists from `edges`.
3. Validates: exactly one source (in-degree 0), exactly one sink (out-degree 0), single linear path from source to sink (each non-sink node has out-degree 1, each non-source node has in-degree 1), no cycles, and no nodes outside that path (`disconnected-node`). A 1-node graph is valid: the single node is both source and sink, the chain has length 1, and the workflow runs as a 1-step workflow. The `disconnected-node` rejection only fires in multi-node graphs.
4. Returns ordered `WorkflowStep[]` from source to sink.

Snapshot fixtures live under `tests/__fixtures__/canvas/` covering: 1-node (accept), 3-node linear (accept), branch (reject), join (reject), cycle (reject), disconnected-node in a multi-node graph (reject), unsupported-node-type (reject — e.g. a text card mixed in with file nodes), file-node-non-md (reject — file node pointing at `.png`), empty (reject).

---

## 6. Prompt Rendering

```
<SKILL.md body>

---

Context from prior workflow steps:
- {workflowRunsFolder}/{runId}/00-input.md
- {workflowRunsFolder}/{runId}/01-extract-context.md

Write your output to: {workflowRunsFolder}/{runId}/02-rewrite-tests.md
```

The literal paths are produced by substituting the configured `workflowRunsFolder` setting (default `specs/workflow-runs`) and the allocated `runId` at render time. `AgentExecutionPort.runSkill` receives the rendered prompt and the explicit `contextFiles` array (which the Claude CLI bridge can pass as `--file` arguments or analogous attachments — bridge-internal detail).

---

## 7. Error Handling

- All validation runs **before** any agent call. Pre-flight covers: canvas read + parse, every node-type check (`UnsupportedCanvasNode` rejects non-`.md` file nodes and non-file node types), graph shape, every SKILL.md read + frontmatter validation. Pre-flight failures return `Result.error` with no side effects (no `runDir`, no scratch files).
- Runtime failures preserve `runDir` and any scratch files written so far for inspection.
- `NotificationPort.showError` surfaces failures with a sticky notice naming the offending node or step.
- No retries in MVP. Re-running a workflow allocates a fresh `runId`.

---

## 8. Settings

Add to `PluginSettings`:

```ts
workflowRunsFolder: string  // default 'specs/workflow-runs'
```

Settings tab gains a single text input under a new "Workflows" section (deferred to follow-up if scope creep).

---

## 9. Testing

- **Domain:** `CanvasParser` against fixture canvases; `Workflow.fromCanvas` golden-path + every rejection class.
- **Application:** `ExecuteWorkflowUseCase` against `fakeModulePorts()` + a fake `AgentExecutionPort` that writes deterministic scratch output; cases cover 1-step, 3-step, mid-run failure, missing scratch output, cancellation.
- **Infrastructure:** Claude CLI `AgentExecutionPort` impl unit-tested with a spawn mock; the real CLI is exercised manually, not in CI.
- **UI:** sidebar slash-command parser unit-tested; component test for step-progress list with class-based PageObject and `data-testid` per ADR-009.
- **Coverage:** stays within 80/70/80/80 thresholds.

---

## 10. Out of Scope (Post-MVP)

- Branching DAG execution (parallel fan-out, fan-in joins)
- Conditional edges (`if/else` on prior output)
- Loops / iteration
- Sub-workflow nodes (canvas referencing canvas)
- Live re-run from a failed step
- Scratch-file templating / structured output schemas
- Auto-detect canvas attachments in chat (Approach B from brainstorm)
- Workflow scheduling, recurrence, or background runs

Each becomes its own REQ when usage informs the contract.

---

## 11. Open Questions for Design Intake

- Does a `ClockPort` already exist in the codebase, or does this REQ introduce it?
- Is `specs/workflow-runs/` the right home, or should it live under a top-level `workflow-runs/` parallel to `specs/`?
- Should the `Stop` button on a running step also delete partial scratch files, or always preserve them?
- Does the `AgentExecutionPort` belong in `src/domain/ports/` (matching ADR-008's port placement) or in `src/application/ports/` (since it's an external-process boundary)?
