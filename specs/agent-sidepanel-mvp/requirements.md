---
id: PRD-ASM-001
title: "Agent Sidepanel MVP — Requirements"
stage: requirements
feature: agent-sidepanel-mvp
status: complete
owner: pm
inputs: [IDEA-ASM-001, RES-ASM-001]
created: 2026-05-14
updated: 2026-05-14
---

# PRD — Agent Sidepanel MVP (Increment 1)

## Overview

This PRD specifies Increment 1 of the Agent Sidepanel design brief (May 2026). It extends the shipped Claude CLI chat sidebar (`claude-cli-chat-sidebar`, REQ-CCS-001…028) along two axes: (1) a second transport — a `ClaudeSubprocessAdapter` that spawns the user's locally installed `claude` binary — so Claude.ai subscription holders without an `ANTHROPIC_API_KEY` are no longer locked out of the sidebar, and (2) trust-first write proposals — when the assistant wants to create a new file, it returns a structured JSON envelope which the UI surfaces as an explicit Accept / Reject proposal card before anything lands in the vault. Stage-aware prompting is added on top: the active feature's `workflow-state.md` is read at send-time and prepended via `--append-system-prompt` so the assistant's answers are shaped by the user's current lifecycle stage.

Everything that ships in the existing CCS PRD is reused as-is: the narrow port (now formally renamed `AgentPort` in design but the existing `ClaudeCliPort` shape is preserved for backward compatibility), the chat panel's degraded states, the 50 000-token context cap, the active-file auto-context behaviour, the file-menu "Add to chat context" action, the API-key settings field with Obsidian Sync disclosure, the plain-language error UI, and the mobile degradation. This PRD does not restate those requirements — it cites the relevant `REQ-CCS-NNN` IDs at the appropriate points and only introduces new requirements where ASM diverges from or extends CCS.

Deferred to later increments per the design brief and idea: autonomy dial UI, vault folder filter, streaming step log, redirect / stop controls (Increment 2); Tasks tab, Session tab, undo window (Increment 3); slash-command palette and PR lifecycle cards (Increment 4); stage tracker and lifecycle gate (Increment 5). Multi-turn agentic tool use server-side is also explicitly deferred — Increment 1 disables server-side tools and gates every vault write client-side through `VaultPort`.

## Glossary

| Term | Definition |
|---|---|
| **Transport** | The mechanism the plugin uses to reach Claude. Two transports exist: **SDK transport** (`ClaudeCliAdapter`, Agent SDK + `ANTHROPIC_API_KEY`) and **subprocess transport** (`ClaudeSubprocessAdapter`, `child_process.spawn` of the user's local `claude` binary). |
| **AgentPort** | The single ADR-008 narrow port both transports implement. Preserves the existing `ClaudeCliPort` shape; UI is transport-agnostic. |
| **Structured envelope** | The Zod-typed object the model returns for trust-first file proposals: `{ action: 'createFile', path, content, rationale?, folderHint? }`. Delivered via `--output-format json --json-schema '<schema>'`. |
| **Stage-aware system prompt** | A preamble assembled from the active feature's `specs/<slug>/workflow-state.md` and injected via `--append-system-prompt`. Tells the assistant which lifecycle stage the user is in. |
| **Session log** | A vault-local markdown file at `specs/<active-feature>/sessions/<session-id>.md` capturing the plugin-side record of one chat thread. Survives Obsidian restart and Obsidian Sync (REQ-CCS-028). Distinct from the CLI's own NDJSON under `~/.claude/projects/...`, which the plugin never reads. |
| **session_id** | The opaque string the CLI emits in the `system/init` event of its `stream-json` output. The plugin stores this and passes `--resume <session_id>` to continue a prior session. |
| **Subscription mode** | The runtime mode in which the subprocess transport is selected. Requires a discoverable `claude` binary and a logged-in CLI; no API key is read or transmitted. |
| **File-write proposal card** | The Vue component surfaced in the chat sidebar that renders a validated structured envelope and offers Accept / Reject controls. Vault writes only fire on Accept. |
| **Trust-first** | The constitutional posture that no model-proposed write reaches the vault without an explicit user gesture. Audit log is in-memory in Increment 1 (vault audit log deferred). |

---

## Functional requirements (EARS)

### Transport selection and subscription mode

#### REQ-ASM-001 — AgentPort interface preserved across two transports

- **Pattern:** ubiquitous
- **Statement:** The system shall expose exactly one domain-layer port (`AgentPort`, preserving the `ClaudeCliPort` shape from REQ-CCS-021) that both `ClaudeCliAdapter` (SDK transport) and `ClaudeSubprocessAdapter` (subprocess transport) implement, so UI and application code are transport-agnostic.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (constraints — two transports, one port); D-ASM-001

#### REQ-ASM-002 — Transport precedence at startup

- **Pattern:** event-driven
- **Statement:** WHEN `AgentPort.startup()` runs, the system shall select the transport in this order: (1) SDK transport if a non-empty `anthropicApiKey` is present in settings; (2) subprocess transport if a discoverable `claude` binary exists; (3) degraded state otherwise.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — deterministic precedence); D-ASM-006

#### REQ-ASM-003 — No mid-session transport switching

- **Pattern:** unwanted behaviour
- **Statement:** IF the active transport becomes unavailable mid-session, THEN the system shall surface a degraded state and require the user to reload the chat thread before a different transport is selected; the system shall not silently switch transports.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — no silent switching); D-ASM-006

#### REQ-ASM-004 — Claude CLI path Settings field

- **Pattern:** ubiquitous
- **Statement:** The system shall provide a Settings field labelled "Claude CLI path" that stores an absolute filesystem path, with a button that triggers autodetection via `sh -lc 'command -v claude'` on macOS/Linux and `where.exe claude` on Windows.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (constraints — PATH discovery); D-ASM-007

#### REQ-ASM-005 — Autodetect picks the first absolute path

- **Pattern:** event-driven
- **Statement:** WHEN the autodetect button is clicked and the discovery command returns multiple lines, the system shall take the first non-empty line and validate it with `path.isAbsolute` before storing it.
- **Priority:** must
- **Traces:** R-ASM-007 (Windows multi-path mitigation); D-ASM-007

#### REQ-ASM-006 — Subprocess MUST NOT pass `--bare`

- **Pattern:** unwanted behaviour
- **Statement:** IF the system spawns the `claude` binary in subscription mode, THEN it shall not include `--bare` in the argument list under any circumstances; the `--bare` flag is forbidden on the subprocess transport.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (constraints — no `--bare`); D-ASM-002

#### REQ-ASM-007 — No credential file reads

- **Pattern:** ubiquitous
- **Statement:** The system shall never open, read, copy, transmit, persist, or watch `~/.claude/.credentials.json`, any file under `~/.claude/` other than as part of the user's own CLI invocation, or any OAuth token from any source.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (constraints — Anthropic ToS); D-ASM-009; R-ASM-001

#### REQ-ASM-008 — Settings ToS disclosure copy

- **Pattern:** ubiquitous
- **Statement:** The system shall render a static Settings description under the "Claude CLI path" field reading "Specorator does not handle your Claude.ai credentials. The `claude` CLI you installed manages its own login."
- **Priority:** must
- **Traces:** D-ASM-009; R-ASM-001 (mitigation — disclosure copy)

#### REQ-ASM-009 — CLI-not-found degraded state

- **Pattern:** state-driven
- **Statement:** WHILE the subprocess transport is selected and the configured CLI path is missing or non-executable, the system shall display "Chat needs the Claude command-line tool." with a link to the Settings field, reusing the REQ-CCS-019 degraded-state pattern.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (research question — CLI-not-installed surface); D-ASM-007

#### REQ-ASM-010 — Subprocess lifecycle: short-lived per turn with `--resume` chaining

- **Pattern:** state-driven
- **Statement:** WHILE a chat thread is open in subscription mode, the system shall spawn a fresh short-lived `ChildProcess` for each turn (free-text or structured) — running `claude -p '<prompt>'` to completion — and preserve multi-turn context by forwarding `--resume <sessionId>` in the next turn's argv, where the session id is captured from the prior turn's `system/init` event and threaded through `ClaudeCliQueryOptions.resumeSessionId` by the caller.
- **Priority:** must
- **Traces:** R-ASM-003 (spawn latency mitigated by argv-level resume rather than long-lived process); F3 (process lifecycle); Codex P1 review on PR #325 (the original "long-lived per thread, reused across turns" formulation was incompatible with `claude -p` one-shot argv semantics; the prompt would never reach a reused subprocess).

---

### Stage-aware system prompt

#### REQ-ASM-011 — Active feature detection

- **Pattern:** event-driven
- **Statement:** WHEN the user submits a chat message, the system shall determine the active feature by reading the active editor file's vault-relative path and matching the `specs/<slug>/...` prefix; if matched, `<slug>` is the active feature.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — stage-aware preamble)

#### REQ-ASM-012 — workflow-state.md load

- **Pattern:** event-driven
- **Statement:** WHEN an active feature has been detected, the system shall read `specs/<slug>/workflow-state.md` via `VaultPort.readFile` and parse its YAML frontmatter to extract `stage`, `feature`, and `status`.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — stage-aware preamble); CLAUDE.md (ADR-005 schema)

#### REQ-ASM-013 — System prompt assembly

- **Pattern:** ubiquitous
- **Statement:** The system shall assemble a stage-aware system prompt containing the active feature's slug, current stage, and one sentence describing the responsibilities of that stage; the assembled string shall be passed verbatim to `--append-system-prompt`.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — stage-aware preamble); D-ASM-001 (F1 — `--append-system-prompt`)

#### REQ-ASM-014 — Graceful fallback when no active feature

- **Pattern:** unwanted behaviour
- **Statement:** IF no active feature can be detected (no active file, or active file is not under `specs/<slug>/`), THEN the system shall omit the `--append-system-prompt` argument entirely and proceed with chat assembly unchanged.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — graceful fallback)

#### REQ-ASM-015 — Graceful fallback when workflow-state is malformed

- **Pattern:** unwanted behaviour
- **Statement:** IF `workflow-state.md` cannot be parsed or its frontmatter is missing required keys, THEN the system shall log a warning via `LoggerPort.warn`, omit the stage preamble, and proceed; the user-visible UI shall not surface this condition.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — graceful fallback); CLAUDE.md (LoggerPort)

#### REQ-ASM-016 — System prompt excludes vault content

- **Pattern:** ubiquitous
- **Statement:** The system shall include only the slug, stage name, and a static one-sentence stage description in the system prompt; raw `workflow-state.md` body content shall not be transmitted.
- **Priority:** must
- **Traces:** Trust-first; NFR-ASM-005 (privacy)

#### REQ-ASM-017 — Stage descriptions sourced from FEATURE_STEPS

- **Pattern:** ubiquitous
- **Statement:** The system shall source the one-sentence stage description from the `FEATURE_STEPS` array in `src/domain/feature/FeatureStep.ts`; no stage description shall be hard-coded inside the prompt-assembly module.
- **Priority:** must
- **Traces:** CLAUDE.md (`FEATURE_STEPS` source of truth)

#### REQ-ASM-018 — Stage prompt applies to both transports

- **Pattern:** ubiquitous
- **Statement:** The system shall apply the stage-aware system prompt identically on the SDK transport and the subprocess transport; the assembly point is in the application layer above the port.
- **Priority:** must
- **Traces:** REQ-ASM-001 (transport-agnostic application layer)

#### REQ-ASM-019 — System prompt is cache-safe

- **Pattern:** ubiquitous
- **Statement:** The system shall recompute the stage-aware system prompt at each `send` invocation; no value shall be cached across messages, so a stage advance taking effect mid-thread is reflected immediately.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — current stage)

#### REQ-ASM-020 — System prompt length bounded

- **Pattern:** ubiquitous
- **Statement:** The system shall hard-cap the assembled stage preamble at 2 000 characters; if exceeded (because a stage slug or description is unexpectedly long), the preamble shall be truncated at a clean sentence boundary.
- **Priority:** must
- **Traces:** NFR-CCS-008 (hard-truncation discipline)

---

### Structured JSON output

#### REQ-ASM-021 — Structured output flag pair

- **Pattern:** event-driven
- **Statement:** WHEN the plugin needs a parseable response for a file-creation proposal, the system shall invoke the subprocess transport with `--output-format json --json-schema '<schema>'` and shall read the `.structured_output` field of the result.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (constraints — structured output); D-ASM-004

#### REQ-ASM-022 — Increment-1 schema

- **Pattern:** ubiquitous
- **Statement:** The system shall use the JSON Schema `{ action: 'createFile' (const), path: string (pattern ^[^/].*\\.md$), content: string (minLength 1), rationale?: string, folderHint?: string, additionalProperties: false }` for every structured proposal call in Increment 1.
- **Priority:** must
- **Traces:** D-ASM-008 (Increment-1 schema)

#### REQ-ASM-023 — Zod revalidation at the application boundary

- **Pattern:** event-driven
- **Statement:** WHEN a `.structured_output` payload is received from the subprocess transport, the system shall revalidate it against the Zod equivalent of the JSON Schema at the application boundary before passing it to the UI.
- **Priority:** must
- **Traces:** D-ASM-004 (Zod defence-in-depth); R-ASM-004

#### REQ-ASM-024 — Defensive parse fallback

- **Pattern:** unwanted behaviour
- **Statement:** IF `.structured_output` is absent or fails Zod validation, THEN the system shall attempt to extract the first balanced `{…}` block from `.result` (using brace-depth counting that correctly handles nested objects inside `content`, not a regex) and revalidate it against the Zod schema as a single defensive fallback.
- **Priority:** must
- **Traces:** F4 (defensive parse fallback)

#### REQ-ASM-025 — Parse failure surfaces to UI

- **Pattern:** event-driven
- **Statement:** WHEN both the structured-output payload and the defensive fallback fail Zod validation, the system shall return a `Result.error` with errorCode `STRUCTURED_PARSE_FAILED` and the chat panel shall display "Assistant returned an unexpected response. Please try again." without quoting raw output to the user.
- **Priority:** must
- **Traces:** REQ-CCS-016 (plain-language error pattern); NFR-CCS-012 (no jargon)

#### REQ-ASM-026 — System-prompt suffix for structured calls

- **Pattern:** ubiquitous
- **Statement:** The system shall append the literal string "Return only the JSON object — no commentary." to the system prompt for every structured-output call, in addition to the stage-aware preamble.
- **Priority:** must
- **Traces:** F4 (tight system-prompt suffix)

#### REQ-ASM-027 — Free-text chat uses stream-json, not json

- **Pattern:** ubiquitous
- **Statement:** The system shall invoke the subprocess transport with `--output-format stream-json --verbose --include-partial-messages` for free-text chat, and shall not pass `--json-schema` on these calls.
- **Priority:** must
- **Traces:** D-ASM-003 (free-text framing); F1

#### REQ-ASM-028 — Tools disabled in Increment 1

- **Pattern:** ubiquitous
- **Statement:** The system shall pass `--permission-mode dontAsk --disallowedTools "Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch"` on every subprocess invocation in Increment 1.
- **Priority:** must
- **Traces:** D-ASM-010 (trust-first; explicit denylist)

#### REQ-ASM-029 — NDJSON consumed via readline

- **Pattern:** ubiquitous
- **Statement:** The system shall consume the subprocess transport's stdout via Node's `readline.createInterface` over the child's stdout, parse each line as JSON, and dispatch events by `type` (`system/init`, `stream_event`, `tool_use`, `result`).
- **Priority:** must
- **Traces:** D-ASM-003 (readline is required for line-boundary safety); F3

#### REQ-ASM-030 — Streaming error events surface as Result.error

- **Pattern:** event-driven
- **Statement:** WHEN the subprocess transport emits a `result` event whose `is_error` field is `true` or terminates with a non-zero exit code, the system shall return `Result.error` mapped to a `ClaudeCliErrorCode` consistent with REQ-CCS-016.
- **Priority:** must
- **Traces:** REQ-CCS-016 (error mapping)

---

### Session persistence

#### REQ-ASM-031 — Capture session_id from system/init

- **Pattern:** event-driven
- **Statement:** WHEN the subprocess transport receives a `system/init` NDJSON event, the system shall extract the `session_id` field and store it on the chat-thread DTO in memory.
- **Priority:** must
- **Traces:** D-ASM-005 (session_id capture); F5

#### REQ-ASM-032 — Session log path resolution

- **Pattern:** ubiquitous
- **Statement:** The system shall write the per-thread session log to `specs/<active-feature>/sessions/<session-id>.md` when an active feature is known, and to `.specorator/sessions/<session-id>.md` (vault root) otherwise.
- **Priority:** must
- **Traces:** D-ASM-005 (vault-local placement); R-ASM-005 (fallback path)

#### REQ-ASM-033 — Session log format

- **Pattern:** ubiquitous
- **Statement:** The system shall format the session log as markdown with YAML frontmatter (`session_id`, `feature`, `transport`, `created`, `updated`) followed by a chronological sequence of `## user` / `## assistant` blocks.
- **Priority:** must
- **Traces:** D-ASM-005 (vault-portable for Obsidian Sync, REQ-CCS-028)

#### REQ-ASM-034 — Append on each turn

- **Pattern:** event-driven
- **Statement:** WHEN a turn completes successfully (user message sent and assistant response received), the system shall append both blocks to the session log via `VaultPort.writeFile` and update the `updated` frontmatter timestamp.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — conversation survives restart)

#### REQ-ASM-035 — Resume on thread re-open

- **Pattern:** event-driven
- **Statement:** WHEN the user re-opens a chat thread whose DTO carries a stored `session_id`, the system shall pass `--resume <session_id>` on the next subprocess invocation so the CLI continues that session.
- **Priority:** must
- **Traces:** D-ASM-005 (--resume); F1

#### REQ-ASM-036 — No reads from ~/.claude/

- **Pattern:** unwanted behaviour
- **Statement:** IF the plugin needs session history, THEN it shall reconstruct that history from its own session log only; it shall not read or parse any file under `~/.claude/` including `~/.claude/projects/*.jsonl` and `~/.claude/history.jsonl`.
- **Priority:** must
- **Traces:** D-ASM-009; REQ-ASM-007; F5

#### REQ-ASM-037 — Survive Obsidian restart

- **Pattern:** event-driven
- **Statement:** WHEN Obsidian is restarted, the system shall reload chat threads with their `session_id` and session log path persisted in the plugin data blob, so the conversation continues without manual re-creation.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — survive Obsidian restart)

#### REQ-ASM-038 — Sessions folder created on demand

- **Pattern:** event-driven
- **Statement:** WHEN the first session log for a feature is written, the system shall create `specs/<active-feature>/sessions/` via `VaultPort.createFolder` if it does not already exist.
- **Priority:** must
- **Traces:** CLAUDE.md (VaultPort.createFolder)

#### REQ-ASM-039 — Session log overwrite protection

- **Pattern:** unwanted behaviour
- **Statement:** IF a session log file already exists at the target path with a different `session_id` in its frontmatter, THEN the system shall not overwrite it; it shall log a warning via `LoggerPort.warn` and append a numeric suffix (`-2`, `-3`, …) to the file stem until a unique path is found.
- **Priority:** must
- **Traces:** Vault overwrite protection pattern (REQ-AVS-005 family); CLAUDE.md (overwrite protection)

#### REQ-ASM-040 — Session log writes are async-flushed

- **Pattern:** ubiquitous
- **Statement:** The system shall write session log updates asynchronously (fire-and-forget with error surfaced to `LoggerPort.error`) so the chat UI is never blocked on disk I/O.
- **Priority:** must
- **Traces:** NFR-ASM-002 (latency)

---

### File-write proposals

#### REQ-ASM-041 — Proposal card renders validated envelope

- **Pattern:** event-driven
- **Statement:** WHEN a structured envelope passes Zod validation (REQ-ASM-023), the system shall render a "Proposed new file" card in the chat panel showing `path`, the first 40 lines of `content` (truncated with a "show more" affordance), and the `rationale` if present.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (success criteria — proposal card)

#### REQ-ASM-042 — Accept / Reject controls

- **Pattern:** ubiquitous
- **Statement:** The system shall render two buttons on every proposal card: "Accept" (primary) and "Reject" (secondary); both shall be focusable, keyboard-activatable (Enter / Space), and labelled with `aria-label="Accept proposed file <path>"` / `aria-label="Reject proposed file <path>"`.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (constraints — Trust-first writes); NFR-ASM-007

#### REQ-ASM-043 — Vault write gated on Accept

- **Pattern:** event-driven
- **Statement:** WHEN the user clicks Accept on a proposal card, the system shall call `VaultPort.writeFile(path, content)` and only then mark the proposal as resolved in the session log.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (constraints — Trust-first); CLAUDE.md (VaultPort)

#### REQ-ASM-044 — Overwrite protection on Accept

- **Pattern:** unwanted behaviour
- **Statement:** IF the target path of an accepted proposal already exists in the vault, THEN the system shall surface a confirmation modal naming the path; the write shall proceed only on explicit confirmation, mirroring the REQ-AVS-005 overwrite-protection posture.
- **Priority:** must
- **Traces:** CLAUDE.md (REQ-AVS-005 overwrite protection); IDEA-ASM-001 (constraints — Trust-first)

#### REQ-ASM-045 — Reject leaves vault unchanged

- **Pattern:** event-driven
- **Statement:** WHEN the user clicks Reject on a proposal card, the system shall mark the proposal as rejected in the session log and shall not invoke `VaultPort.writeFile`, `VaultPort.createFolder`, or any other vault-mutating method for that proposal.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (constraints — Trust-first)

#### REQ-ASM-046 — Proposal audit log in session file

- **Pattern:** event-driven
- **Statement:** WHEN a proposal is accepted or rejected, the system shall append an entry to the active session log under a `## proposal` block recording `path`, `decision` (`accepted` | `rejected`), `decided_at` timestamp, and `rationale` if present.
- **Priority:** must
- **Traces:** IDEA-ASM-001 (constraints — Trust-first audit); D-ASM-008

#### REQ-ASM-047 — folderHint creates folder

- **Pattern:** event-driven
- **Statement:** WHEN a proposal carries a non-empty `folderHint` and the user clicks Accept, the system shall first call `VaultPort.createFolder(folderHint)` (idempotent) before `VaultPort.writeFile`; the hint shall be validated to be a non-absolute path and a prefix of `path`.
- **Priority:** must
- **Traces:** D-ASM-008 (folderHint semantics)

#### REQ-ASM-048 — Reject path-escape attempts

- **Pattern:** unwanted behaviour
- **Statement:** IF an envelope's `path` contains `..` segments, starts with `/`, or resolves outside the vault root, THEN the system shall treat validation as failed (REQ-ASM-025 path) and shall not render an Accept button.
- **Priority:** must
- **Traces:** Trust-first; security defence-in-depth

#### REQ-ASM-049 — One-shot proposal process

- **Pattern:** ubiquitous
- **Statement:** The system shall spawn a fresh short-lived `claude` subprocess for each structured-proposal call (independent of the thread's long-lived streaming process) so each proposal is self-contained.
- **Priority:** must
- **Traces:** F3 (process lifecycle — short-lived per structured call)

#### REQ-ASM-050 — Proposal can be retried

- **Pattern:** event-driven
- **Statement:** WHEN a proposal card is rendered, the system shall expose a "Retry" affordance that resubmits the prior user turn with the same context but a fresh structured-proposal call; previous proposals remain in the audit trail unchanged.
- **Priority:** should
- **Traces:** IDEA-ASM-001 (success criteria — explicit accept gesture)

---

### Active-file auto-context (reused from CCS)

#### REQ-ASM-051 — Reuse active-file auto-context

- **Pattern:** ubiquitous
- **Statement:** The system shall reuse REQ-CCS-005 unchanged (active file is added to the chat store's auto context slot when the active editor leaf changes).
- **Priority:** must
- **Traces:** REQ-CCS-005

#### REQ-ASM-052 — Reuse active-file clear behaviour

- **Pattern:** ubiquitous
- **Statement:** The system shall reuse REQ-CCS-006 unchanged (auto context slot is cleared when no markdown file is active).
- **Priority:** must
- **Traces:** REQ-CCS-006

#### REQ-ASM-053 — Reuse file-menu add-to-context

- **Pattern:** ubiquitous
- **Statement:** The system shall reuse REQ-CCS-009, REQ-CCS-010, REQ-CCS-011 unchanged (file-menu "Add to chat context" with no-duplicate and remove behaviour).
- **Priority:** must
- **Traces:** REQ-CCS-009, REQ-CCS-010, REQ-CCS-011

#### REQ-ASM-054 — Reuse context preamble + token cap

- **Pattern:** ubiquitous
- **Statement:** The system shall reuse REQ-CCS-025, REQ-CCS-026, REQ-CCS-027 unchanged (context preamble format and 50 000-token cap with LIFO manual removal and auto-file floor). The stage-aware preamble (REQ-ASM-013) is prepended *before* the CCS context preamble; the resulting concatenation is what feeds `buildPrompt()`.
- **Priority:** must
- **Traces:** REQ-CCS-025, REQ-CCS-026, REQ-CCS-027

#### REQ-ASM-055 — Reuse error UI and degraded-state copy patterns

- **Pattern:** ubiquitous
- **Statement:** The system shall reuse REQ-CCS-016, REQ-CCS-017, REQ-CCS-018, REQ-CCS-019, REQ-CCS-020 unchanged (plain-language error mapping, userText retained on error, API-key-missing / SDK-unavailable / mobile degraded states). The CLI-not-found degraded state (REQ-ASM-009) follows the same pattern.
- **Priority:** must
- **Traces:** REQ-CCS-016, REQ-CCS-017, REQ-CCS-018, REQ-CCS-019, REQ-CCS-020

---

## Non-functional requirements

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-ASM-001 | performance | Subprocess spawn for the first turn of a chat thread (cold start) | p95 ≤ 3 000 ms on macOS signed builds (R-ASM-003); p95 ≤ 800 ms on Linux / Windows |
| NFR-ASM-002 | performance | Streaming latency between NDJSON `stream_event` arrival on stdout and visible UI update | p95 ≤ 100 ms |
| NFR-ASM-003 | performance | Stage-aware prompt assembly (workflow-state read + parse + concatenate) | p95 ≤ 20 ms on warm vault cache; never blocks `send` button > 100 ms |
| NFR-ASM-004 | security | No reads, opens, copies, transmits, or persists of `~/.claude/.credentials.json`, any OAuth token, or any file under `~/.claude/` other than via the user's own CLI invocation | Enforced by ESLint `no-restricted-imports` on `fs` paths in subprocess adapter and verified by integration test |
| NFR-ASM-005 | security / privacy | No secrets, API keys, OAuth tokens, file paths under user home (`~`), or full vault paths appear in `LoggerPort` output at any level | Verified by log-redaction unit tests; extends NFR-CCS-005 |
| NFR-ASM-006 | reliability | Graceful degradation when `claude` binary is missing, non-executable, or fails to start | REQ-ASM-009 degraded state renders within 500 ms of `startup()`; chat panel never enters an unhandled-error state |
| NFR-ASM-007 | accessibility | Proposal card and Accept / Reject controls keyboard navigable | Tab order: card heading → path → content → rationale → Accept → Reject; Enter / Space activates; `aria-label` per REQ-ASM-042 |
| NFR-ASM-008 | accessibility | Streaming response area announces updates to assistive tech without flooding | `aria-live="polite"` on the response container; updates batched at ≤ 5 Hz |
| NFR-ASM-009 | internationalization | No AI/SDK/methodology jargon in user-facing copy | Inherits NFR-CCS-012; adds "subprocess", "OAuth", "session_id", "stream-json", "schema", "Zod", "envelope" to the forbidden-strings list for user-visible copy |
| NFR-ASM-010 | cross-platform | PATH discovery works on macOS, Windows, Linux | macOS / Linux: `sh -lc 'command -v claude'`; Windows: `where.exe claude`; Linux: documented AppArmor / userns workaround (R-ASM-002) surfaced as `CLI_LAUNCH_FAILED` error |
| NFR-ASM-011 | trust-first | No vault write fires without an explicit user gesture | Every `VaultPort.writeFile` call originating from a model proposal in Increment 1 is preceded by a user Accept click; verified by integration test |
| NFR-ASM-012 | observability | Subprocess transport telemetry (no PII / vault paths) | `LoggerPort.debug` records `{ transport, sessionId: redacted, durationMs, exitCode }`; gated by `logLevel = debug` setting (default `warn`) |

---

## Acceptance criteria

Every requirement is verifiable against the criterion below.

| Requirement | Acceptance criterion |
|---|---|
| REQ-ASM-001 | Static import audit on `src/domain/ports/AgentPort.ts` finds no `obsidian` / SDK imports; both adapter classes satisfy the interface via `implements`. |
| REQ-ASM-002 | Unit test: set `anthropicApiKey` only → SDK selected. Unset key + CLI path present → subprocess selected. Both absent → degraded state. |
| REQ-ASM-003 | Integration test: kill the long-lived subprocess mid-thread → degraded state appears, send button disabled, no SDK call fires. |
| REQ-ASM-004 | Settings UI test: field is present; autodetect button populates field; manual edit persists across plugin reload. |
| REQ-ASM-005 | Unit test: discovery returns `"/usr/local/bin/claude\n/opt/homebrew/bin/claude"` → stored value is `/usr/local/bin/claude`. |
| REQ-ASM-006 | Unit test on argument builder: `buildArgs({ subscription: true, ... })` never contains the string `--bare`. |
| REQ-ASM-007 | ESLint custom rule fails any literal `~/.claude/.credentials.json` or `.credentials.json` in `src/**`; integration test asserts adapter never opens these paths. |
| REQ-ASM-008 | Settings render test: description text matches the literal in REQ-ASM-008. |
| REQ-ASM-009 | Component test: configure non-existent CLI path → "Chat needs the Claude command-line tool." heading visible; settings link present. |
| REQ-ASM-010 | Adapter test: send three turns on one thread → exactly one `spawn()` for streaming; structured-proposal call observes a separate short-lived spawn. |
| REQ-ASM-011 | Unit test: active editor at `specs/foo/idea.md` → `getActiveFeatureSlug()` returns `foo`. Active editor at `README.md` → returns `null`. |
| REQ-ASM-012 | Unit test using `fakeModulePorts()`: pre-seed `workflow-state.md` → parsed `{stage, feature, status}` returned. |
| REQ-ASM-013 | Unit test: assembled prompt contains slug + stage + one-sentence description; subprocess is invoked with `--append-system-prompt <assembled>`. |
| REQ-ASM-014 | Unit test: no active feature → `--append-system-prompt` flag absent from argv. |
| REQ-ASM-015 | Unit test: malformed YAML → `LoggerPort.warn` called once; `--append-system-prompt` absent; no notification fires. |
| REQ-ASM-016 | Unit test: body of `workflow-state.md` containing the word "TopSecret" → that string never appears in the assembled prompt. |
| REQ-ASM-017 | Static import test: prompt-assembly module imports `FEATURE_STEPS` from `src/domain/feature/FeatureStep.ts`; no string literals containing stage names live in the prompt module. |
| REQ-ASM-018 | Unit test: assembly produces identical preamble regardless of which transport the chat session uses. |
| REQ-ASM-019 | Unit test: change `workflow-state.md` between two sends → second send's `--append-system-prompt` reflects the new stage. |
| REQ-ASM-020 | Unit test: synthetic 5 000-character stage description → assembled preamble length ≤ 2 000 chars, ends at a sentence boundary. |
| REQ-ASM-021 | Adapter test: a `createFile` request invokes `claude` with `--output-format json --json-schema '<schema>'` and reads `.structured_output`. |
| REQ-ASM-022 | Schema test: the JSON Schema string matches the literal in REQ-ASM-022 byte-for-byte (snapshot test). |
| REQ-ASM-023 | Unit test: `.structured_output` with extra unknown field → Zod rejects (`additionalProperties: false`); UI receives `Result.error`. |
| REQ-ASM-024 | Unit test: `.structured_output` missing, `.result` contains "Some preamble: { ... } trailing" → fallback extracts the `{…}` block and Zod validates. |
| REQ-ASM-025 | Unit test + component test: validation failure → `errorCode === 'STRUCTURED_PARSE_FAILED'`; chat panel shows "Assistant returned an unexpected response. Please try again." with no raw output. |
| REQ-ASM-026 | Argument-builder test: structured calls include the literal suffix string at the end of `--append-system-prompt`. |
| REQ-ASM-027 | Adapter test: free-text chat invokes `claude` with `--output-format stream-json --verbose --include-partial-messages` and no `--json-schema`. |
| REQ-ASM-028 | Argument-builder test: both call modes include the literal `--permission-mode dontAsk --disallowedTools "Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch"`. |
| REQ-ASM-029 | Adapter test: arbitrary chunked stdout (split mid-line) → `readline` reassembles; events dispatched by `type`. |
| REQ-ASM-030 | Adapter test: `result` event with `is_error: true` → `Result.error` with mapped code; non-zero exit code → `Result.error{ errorCode: 'QUERY_FAILED' }`. |
| REQ-ASM-031 | Adapter test: emit `{type:'system/init', session_id:'abc-123'}` → `chatThread.sessionId === 'abc-123'`. |
| REQ-ASM-032 | Path-resolver test: active feature `foo` → `specs/foo/sessions/<id>.md`; no active feature → `.specorator/sessions/<id>.md`. |
| REQ-ASM-033 | Session-log writer test: written file parses as valid YAML frontmatter with the named keys; body alternates `## user` / `## assistant` blocks. |
| REQ-ASM-034 | Integration test: send a turn → `VaultPort.writeFile` called once with appended content; `updated` frontmatter newer than `created`. |
| REQ-ASM-035 | Adapter test: thread DTO carries `sessionId = 'abc-123'` → next spawn argv contains `--resume abc-123`. |
| REQ-ASM-036 | ESLint custom rule + integration test: adapter never calls `fs.readFile`, `app.vault.adapter.read`, etc. on paths under `~/.claude/`. |
| REQ-ASM-037 | Integration test: restart `MockBridge` → thread list rehydrates with `sessionId`, log path, and prior message count from plugin data blob. |
| REQ-ASM-038 | Integration test: first write under `specs/foo/sessions/` → `VaultPort.createFolder` called once with `specs/foo/sessions`. |
| REQ-ASM-039 | Integration test: pre-seed a session file with conflicting `session_id` → write goes to `<id>-2.md`; warning logged. |
| REQ-ASM-040 | Performance test: send latency from `send` click to UI update is independent of session-log write latency (mocked 1 000 ms write does not block UI). |
| REQ-ASM-041 | Component test: validated envelope → card renders with `path`, truncated content (≤ 40 lines), rationale; "show more" reveals full content. |
| REQ-ASM-042 | Component test: both buttons keyboard-focusable; `aria-label` matches REQ-ASM-042; Enter and Space both activate. |
| REQ-ASM-043 | Component test: click Accept → `VaultPort.writeFile(path, content)` called exactly once with the validated values. |
| REQ-ASM-044 | Component test: `fileExists` returns true → confirmation modal appears; only on confirm does `writeFile` fire. |
| REQ-ASM-045 | Component test: click Reject → no `VaultPort` write/create methods called; session log records `decision: rejected`. |
| REQ-ASM-046 | Session-log test: accept/reject → `## proposal` block appended with the four named fields. |
| REQ-ASM-047 | Component test: `folderHint = 'specs/foo'`, `path = 'specs/foo/idea.md'` → `createFolder('specs/foo')` precedes `writeFile`; mismatched hint rejected at validation. |
| REQ-ASM-048 | Validation test: paths containing `..`, leading `/`, or escaping vault root → Zod rejects; Accept button is not rendered. |
| REQ-ASM-049 | Adapter test: structured-proposal call spawns a fresh process distinct from the thread's long-lived streamer; process exits cleanly after `result` event. |
| REQ-ASM-050 | Component test: "Retry" button is present on every proposal card and re-issues the prior user turn unchanged. |
| REQ-ASM-051 | Inherits REQ-CCS-005 acceptance unchanged. |
| REQ-ASM-052 | Inherits REQ-CCS-006 acceptance unchanged. |
| REQ-ASM-053 | Inherits REQ-CCS-009 / 010 / 011 acceptance unchanged. |
| REQ-ASM-054 | Inherits REQ-CCS-025 / 026 / 027 acceptance; additional test asserts the stage preamble is prepended before the CCS context preamble. |
| REQ-ASM-055 | Inherits REQ-CCS-016 / 017 / 018 / 019 / 020 acceptance unchanged. |

---

## Out of scope (reaffirms Increment 1 boundary)

The following are explicitly deferred:

- **Autonomy dial UI** (Increment 2) — no slider / mode toggle for read-only vs propose vs apply behaviour.
- **Vault folder filter UI** (Increment 2) — no per-folder allowlist surface.
- **Streaming step log** (Increment 2) — only the final assistant text and proposal cards render; no tool-use stream visualisation.
- **Redirect / Stop controls** (Increment 2) — no mid-stream cancel button beyond closing the chat panel.
- **Tasks tab** (Increment 3) — no in-panel task-list surface.
- **Session tab** (Increment 3) — session log is on disk only; no history-browsing UI.
- **Undo window** (Increment 3) — no time-bounded revert after Accept.
- **Slash-command palette** (Increment 4) — no `/spec:*` etc. surface inside the sidebar.
- **PR lifecycle cards** (Increment 4) — no PR draft / merge surface.
- **Stage tracker** (Increment 5) — no visual lifecycle indicator in the sidebar.
- **Lifecycle gate** (Increment 5) — no enforcement of stage prerequisites at chat-time.
- **Multi-turn server-side tool use** — `--disallowedTools` covers Read/Edit/Write/Bash/Glob/Grep/WebFetch/WebSearch; expansion deferred.
- **`createFile` beyond markdown** — schema requires `.md` extension; binary / code files deferred.
- **Edit / delete proposals** — only `action: 'createFile'` in Increment 1; `editFile` / `deleteFile` deferred to Increment 2.
- **Vault audit log file** — proposal decisions live in the session log only; a separate `audit.md` is deferred.
- **In-product Agent-SDK credit metering** (R-ASM-006) — onboarding note only.

---

## Coverage table

Every functional requirement traces upward to idea.md success criteria / constraints and research decisions / risks; downward traceability to spec / tasks / tests will be filled in by `/spec:specify` and `/spec:tasks`.

| Req ID | Upstream sources |
|---|---|
| REQ-ASM-001 | IDEA-ASM-001 §Constraints (two transports, one port); RES-ASM-001 D-ASM-001, F2 |
| REQ-ASM-002 | IDEA-ASM-001 §Success criteria (deterministic precedence); D-ASM-006, OQ4 |
| REQ-ASM-003 | IDEA-ASM-001 §Success criteria (no silent switching); D-ASM-006 |
| REQ-ASM-004 | IDEA-ASM-001 §Constraints (PATH discovery); D-ASM-007, F3 |
| REQ-ASM-005 | R-ASM-007 (Windows multi-path); D-ASM-007 |
| REQ-ASM-006 | IDEA-ASM-001 §Constraints (no `--bare`); D-ASM-002, F1 |
| REQ-ASM-007 | IDEA-ASM-001 §Constraints (Anthropic ToS); D-ASM-009, R-ASM-001, F6 |
| REQ-ASM-008 | D-ASM-009; R-ASM-001 mitigation |
| REQ-ASM-009 | IDEA-ASM-001 §Research questions (CLI-not-installed); D-ASM-007, OQ5 |
| REQ-ASM-010 | RES-ASM-001 F3 (process lifecycle); R-ASM-003 |
| REQ-ASM-011 | IDEA-ASM-001 §Success criteria (stage-aware preamble) |
| REQ-ASM-012 | IDEA-ASM-001 §Success criteria; CLAUDE.md ADR-005 schema |
| REQ-ASM-013 | IDEA-ASM-001 §Success criteria; D-ASM-001 (F1 `--append-system-prompt`) |
| REQ-ASM-014 | IDEA-ASM-001 §Success criteria (graceful fallback) |
| REQ-ASM-015 | IDEA-ASM-001 §Success criteria; CLAUDE.md (LoggerPort) |
| REQ-ASM-016 | Trust-first; NFR-ASM-005 |
| REQ-ASM-017 | CLAUDE.md (`FEATURE_STEPS` source of truth) |
| REQ-ASM-018 | REQ-ASM-001 (transport-agnostic) |
| REQ-ASM-019 | IDEA-ASM-001 §Success criteria (current stage) |
| REQ-ASM-020 | NFR-CCS-008 (hard-truncation discipline) |
| REQ-ASM-021 | IDEA-ASM-001 §Constraints (structured output); D-ASM-004, F4 |
| REQ-ASM-022 | D-ASM-008 (Increment-1 schema) |
| REQ-ASM-023 | D-ASM-004; R-ASM-004 |
| REQ-ASM-024 | F4 (defensive parse fallback) |
| REQ-ASM-025 | REQ-CCS-016 (error pattern); NFR-CCS-012 |
| REQ-ASM-026 | F4 (system-prompt suffix mitigation) |
| REQ-ASM-027 | D-ASM-003 (free-text framing); F1 |
| REQ-ASM-028 | D-ASM-010 (trust-first; explicit denylist) |
| REQ-ASM-029 | D-ASM-003; F3 |
| REQ-ASM-030 | REQ-CCS-016 (error mapping) |
| REQ-ASM-031 | D-ASM-005; F5 |
| REQ-ASM-032 | D-ASM-005; R-ASM-005 (fallback) |
| REQ-ASM-033 | D-ASM-005; REQ-CCS-028 (Sync portability) |
| REQ-ASM-034 | IDEA-ASM-001 §Success criteria (survive restart) |
| REQ-ASM-035 | D-ASM-005; F1 |
| REQ-ASM-036 | D-ASM-009; REQ-ASM-007; F5 |
| REQ-ASM-037 | IDEA-ASM-001 §Success criteria |
| REQ-ASM-038 | CLAUDE.md (VaultPort.createFolder) |
| REQ-ASM-039 | REQ-AVS-005 family (overwrite protection) |
| REQ-ASM-040 | NFR-ASM-002 (latency) |
| REQ-ASM-041 | IDEA-ASM-001 §Success criteria (proposal card) |
| REQ-ASM-042 | IDEA-ASM-001 §Constraints (Trust-first); NFR-ASM-007 |
| REQ-ASM-043 | IDEA-ASM-001 §Constraints (Trust-first); CLAUDE.md (VaultPort) |
| REQ-ASM-044 | CLAUDE.md (REQ-AVS-005 overwrite protection) |
| REQ-ASM-045 | IDEA-ASM-001 §Constraints (Trust-first) |
| REQ-ASM-046 | IDEA-ASM-001 §Constraints (audit log); D-ASM-008 |
| REQ-ASM-047 | D-ASM-008 (folderHint semantics) |
| REQ-ASM-048 | Trust-first; defence-in-depth |
| REQ-ASM-049 | F3 (process lifecycle) |
| REQ-ASM-050 | IDEA-ASM-001 §Success criteria (explicit accept gesture) |
| REQ-ASM-051 | REQ-CCS-005 (reused) |
| REQ-ASM-052 | REQ-CCS-006 (reused) |
| REQ-ASM-053 | REQ-CCS-009, REQ-CCS-010, REQ-CCS-011 (reused) |
| REQ-ASM-054 | REQ-CCS-025, REQ-CCS-026, REQ-CCS-027 (reused) + stage-preamble prepend |
| REQ-ASM-055 | REQ-CCS-016, REQ-CCS-017, REQ-CCS-018, REQ-CCS-019, REQ-CCS-020 (reused) |

---

## Quality gate

- [x] Every functional requirement uses EARS and has an ID.
- [x] Reused CCS requirements are cited, not duplicated.
- [x] Every requirement traces to an idea.md success criterion / constraint and / or a research decision / risk.
- [x] NFRs listed with concrete targets.
- [x] Acceptance criteria stated for every requirement.
- [x] Out-of-scope reaffirms the Increment 1 boundary from the design brief.
- [x] Coverage table present.
