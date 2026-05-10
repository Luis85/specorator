---
id: REQ-0005
status: proposed
summary: "Execute Obsidian Canvas workflows of linked SKILL.md notes by sequencing them through the Claude CLI sidebar with vault-backed scratch artifacts"
owner: "Luis85"
created: 2026-05-10
last_updated: 2026-05-10
source_issue: "#251"
related_design: "#253"
tags: [requirements, intake, workflow, canvas, agent, sidebar]
priority: medium
risk: medium
verification:
  - "Domain unit tests: `Workflow.fromCanvas(json)` covers happy path, cycle, branch (rejected in MVP), missing source/sink, empty graph"
  - "Application unit tests: `ExecuteWorkflowUseCase` against `fakeModulePorts()` and a fake `AgentExecutionPort`; cases cover 1-step, 3-step, mid-run failure, missing scratch output, cancellation"
  - "Vue component test asserts step-progress list via class-based PageObject and `data-testid` selectors per ADR-009"
  - "Manual smoke: dev vault recipe authoring 3 SKILL.md notes linked on a `.canvas`, executed via `/workflow` slash command, asserting deterministic scratch dir contents under `specs/workflow-runs/{run-id}/`"
  - "ESLint port-import boundaries remain green; Vue components do not import `obsidian` directly"
statement: "The system SHALL execute an Obsidian Canvas file as an ordered linear chain of SKILL.md notes by topologically sorting the canvas graph, sequentially invoking each skill through a narrow `AgentExecutionPort` backed by the Claude CLI sidebar, persisting per-step inputs and outputs as markdown scratch artifacts under a per-run directory in the vault, and surfacing run progress and terminal status in the sidebar UI. Branching DAGs, conditional edges, loops, and sub-workflows are out of scope for this requirement."
rationale: "Specorator's value compounds when users can compose reusable agent skills into repeatable, auditable workflows without leaving Obsidian. Canvas is already the native graph surface in Obsidian and SKILL.md is an established markdown contract; combining them lets users assemble pipelines visually and execute them through the same Claude CLI bridge that powers the sidebar chat. A vault-backed run directory makes every step's input and output inspectable and version-controllable, which matches Specorator's spec-first ethos. Constraining MVP to a linear chain keeps the first cut shippable and pushes branching/conditional semantics into follow-up REQs once real usage informs the contract."
acceptance_criteria:
  - "A `Workflow` domain aggregate parses an Obsidian `.canvas` JSON file, resolves each node to a vault SKILL.md path, validates frontmatter (`name`, `description`), and produces an ordered list of skill references when the graph is a non-empty linear chain."
  - "A graph that is not a linear chain is rejected with a `Result.error` carrying the offending shape and no agent call is made. Rejection cases are: branch (any node with out-degree > 1), join (any node with in-degree > 1), cycle, multiple sources, multiple sinks, and disconnected node (any node not reachable along the single source-to-sink path in a multi-node graph). A single-node graph is valid: that one node is both the source and the sink, the chain has length 1, and the workflow runs as a 1-step workflow."
  - "A new narrow domain port `AgentExecutionPort` exposes at minimum `runSkill(prompt: string, contextFiles: string[]): Promise<Result<{ outputPath: string }>>` and is implemented by the Claude CLI bridge introduced by the `claude-cli-chat-sidebar` spec."
  - "An application-layer `ExecuteWorkflowUseCase` orchestrates a `WorkflowRun`: reads and validates every referenced SKILL.md in a pre-flight pass (failing the whole run with no agent call on `SkillNotFound` or `InvalidSkillFormat`), creates `{workflowRunsFolder}/{run-id}/` (where `workflowRunsFolder` is the configured setting), writes `00-input.md`, then for each step renders the pre-loaded SKILL.md body plus prior scratch file references as a prompt, invokes `AgentExecutionPort.runSkill`, and verifies the named scratch file exists; missing output aborts the run."
  - "Run directory naming is deterministic and collision-resistant: the primary id is `{YYYY-MM-DD-HHmmss}-{canvas-basename}` produced from a clock port at second resolution; if that directory already exists, the use case appends a `-{NN}` suffix (starting at `-2`) and retries until a free path is found. Tests assert exact paths by fixing both the clock port and the vault state."
  - "Per-step scratch files use the contract `{NN}-{skill-slug}.md` where `NN` is the 1-based zero-padded step index and `{skill-slug}` is derived from the SKILL.md frontmatter `name`."
  - "Each skill prompt MUST instruct the agent to write its output to the named scratch file; the use case fails the step with `StepOutputMissing` if the file is absent after the agent turn."
  - "Cancellation through the sidebar Stop control aborts the active step's CLI process, marks the run `cancelled`, and preserves all scratch files written up to that point."
  - "Validation errors (`CanvasNotFound`, `CanvasParseError`, `SkillNotFound`, `InvalidSkillFormat`, `UnsupportedGraph`, `CycleDetected`) and runtime errors (`StepOutputMissing`, `AgentExecutionFailed`, `Cancelled`) are returned as `Result.error` and surfaced via `NotificationPort.showError` naming the offending node or step."
  - "A new sidebar slash command `/workflow <canvas-path> <input>` is the only invocation surface in MVP; auto-detection of canvas attachments in chat messages is explicitly out of scope and tracked as a follow-up REQ."
  - "A new setting `workflowRunsFolder` (default `specs/workflow-runs`) is added to `PluginSettings` and consumed by the use case."
  - "Coverage stays within the existing 80/70/80/80 thresholds enforced by `npm run test:coverage`."
  - "ESLint `no-restricted-imports` rules and ADR-008 port boundaries remain green; no Vue component imports `obsidian` directly."
traceability:
  upstream:
    - "ADR-003 — Vue conventions"
    - "ADR-005 — vault structure"
    - "ADR-008 — narrow ports"
    - "ADR-009 — testing conventions"
    - "Phase 4 spec: claude-cli-chat-sidebar (hard dependency)"
  downstream:
    - "#253 — design intake (open)"
    - "<task issues — domain Workflow aggregate, AgentExecutionPort, ExecuteWorkflowUseCase, sidebar slash command, settings>"
---

## Notes

- **Hard dependency:** `claude-cli-chat-sidebar` Phase 4 spec must ship first; it owns the Claude CLI subprocess bridge and the sidebar UI shell. The `AgentExecutionPort` declared by this REQ is implemented by that bridge — coordinate naming and ownership during design.
- **Canvas surface:** an Obsidian `.canvas` is JSON inside the vault. No new Obsidian API method is needed — `VaultPort.readFile` plus a domain-side parser is sufficient. The canvas JSON shape is an undocumented public surface of Obsidian; parse defensively and add snapshot tests against sample canvases checked into `tests/__fixtures__/`.
- **Skill note shape:** superpowers-style `SKILL.md` with YAML frontmatter (`name`, `description`, optional `triggers`, optional `tags`) plus body. Body is the prompt fragment used at step execution. Plain Obsidian markdown notes without this frontmatter are rejected with `InvalidSkillFormat`.
- **MVP graph constraints:** exactly one source node and exactly one sink node (which collapse to the same node in a 1-node graph), a single linear source-to-sink path, no cycles, and no nodes disconnected from that path. A 1-node graph is the smallest valid workflow. Branching DAGs, conditionals, loops, and sub-workflows are explicit follow-up REQs.
- **Scratch dir layout:**
  ```
  specs/workflow-runs/
    2026-05-10-143015-refactor-flow/        # first run
      00-input.md
      01-extract-context.md
      02-rewrite-tests.md
      03-summarize.md
    2026-05-10-143015-refactor-flow-2/      # second run within the same second → suffix
      00-input.md
      ...
  ```
- **Step contract:** every skill MUST end its turn by writing the named scratch file. The plugin renders each prompt with an explicit instruction line `Write your output to: <path>` and a list of prior scratch file references. No retries in MVP; re-running a workflow allocates a new run directory.
- **Invocation surface:**
  - **MVP:** `/workflow <canvas-path> <initial-input>` slash command in the sidebar. Explicit, parseable, test-friendly.
  - **Follow-up REQ (out of scope here):** auto-detect when a user drops a `.canvas` link into the sidebar chat with intent to execute. Deferred until the explicit path proves the contract.
- **Cancellation:** the sidebar `Stop` button aborts the active step's CLI process and marks the run `cancelled`; partial scratch files are preserved for inspection.
- **Out of scope (post-MVP follow-ups):** branching DAG execution, conditional edges, loops, sub-workflow nodes (canvas referencing canvas), live re-run from a failed step, scratch-file templating, structured output schema validation, auto-detection of canvas attachments in chat.
- **Risk:** medium. Touches domain, application, infrastructure, and UI layers; depends on the unshipped `claude-cli-chat-sidebar` spec; relies on an undocumented Obsidian JSON surface. Mitigated by narrow-port boundaries (ADR-008), snapshot tests against canvas fixtures, and explicit MVP scope.
