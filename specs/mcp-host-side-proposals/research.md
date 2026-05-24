---
id: RESEARCH-MHP-001
title: Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX
stage: research
feature: mcp-host-side-proposals
status: complete
owner: analyst
inputs:
  - IDEA-MHP-001
created: 2026-05-24
updated: 2026-05-24
---

# Research — Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX

## Research questions

Carried forward from `specs/mcp-host-side-proposals/idea.md`. Each is answered in the dedicated section below; this table is the index.

| ID | Question | Status |
|---|---|---|
| Q1 | Tier-policy thresholds — which writes auto-accept vs prompt? (CLAR-MHP-002) | answered (defaults proposed; user signoff still required at /spec:design) |
| Q2 | Webviewer scope — include here or carve out? (CLAR-MHP-003) | answered (carve out — separate spec + own ADR) |
| Q3 | DevTools opt-in threat model (CLAR-MHP-004) | answered (per-tool threat paragraphs drafted; seeds ADR-019) |
| Q4 | Audit-log format + rotation policy | answered (JSONL fields + size-based rotation recommended) |
| Q5 | MCP-tool naming for proposal operations | answered (`workflow_proposal_*` recommended) |
| Q6 | Sidepanel-agent system-prompt addendum | answered (safer of two drafts recommended) |
| Q7 | DevTools settings-tab ergonomics | answered (grouped warning section required; existing primitives sufficient as building blocks) |

---

## Q1 — Tier-policy thresholds (CLAR-MHP-002)

**Scope clarification.** This feature only ships the proposal **pipeline** (list / get / accept / reject + audit log + system-prompt addendum) plus Tier-A reads, the `.mcp.json` migration, and the DevTools opt-in surface. Tier-B write tools (`obsidian_cli_file_create`, `file_rename`, `property_set`, `property_remove`, `daily_append`, `daily_prepend`, `history_restore`, `template_insert`, `task_toggle`) are explicitly **out of scope** here per `specs/mcp-host-side-proposals/idea.md` §"Out of scope". The only auto-accept default that needs to land in this spec is the **active-feature appends** rule, because that rule shapes the proposal schema (the schema must be able to record *why* a proposal was auto-accepted so the audit log is meaningful even for the in-scope writes that ride the pipeline today: `vault_write_note`, `vault_append_to_note`, `obsidian_cli_append_note`, `canvas_*`).

For everything else in this section: **the thresholds are drafted now so the PM can lift them into requirements**, but the design-stage signoff (CLAR-MHP-002) lives with the Tier-B follow-up spec. Recording them here prevents drift between specs.

### Per-class defaults (recommended)

Derived from `discovery/obsidian-cli-mcp-expansion/ux.md` §1 (four tool classes by blast radius) and `discovery/obsidian-cli-mcp-expansion/critique.md` §5 (auto-accept only for appends inside `specs/{slug}/`).

| Class | Default policy | Rationale |
|---|---|---|
| **Read** | Always-allow, no proposal | Pure reads have no blast radius; gating them creates the "low-risk fatigue" RAT-2 predicts will be the first thing PKM Tinkerers disable (`user-research.md` §2 H2). |
| **Safe-write** | Proposal queued; per-tool auto-accept toggle, default OFF except the active-feature-append carve-out below | Matches `ux.md` §1 ("Safe-write … Per-tool auto-accept toggle") and the critic's tighter framing in `critique.md` §5 (only `specs/{slug}/` appends auto-accept). |
| **Risky-write** | Proposal queued; **never** auto-accept; requires `intent` field on the proposal payload | `ux.md` §1 ("Risky-write requires the agent to also include a one-sentence `intent` field"). Enforcement of `intent` is Tier-B per `idea.md` §"Out of scope", but the schema carries the field from day one (see Q4). |
| **Interactive** (DevTools) | Always proposal-gated; default off behind DevTools master toggle; per-tool toggle for the high-risk subset | See Q3. Even auto-accepted DevTools invocations write an audit row, per issue #430 acceptance criteria. |

### The one auto-accept default that ships in this feature

**Auto-accept rule (active-feature appends).** A proposal auto-accepts iff **all** of the following hold:

1. The tool is one of `vault_append_to_note` or `obsidian_cli_append_note` (other writes in scope — `vault_write_note`, `canvas_*` — are creates/replaces, not appends).
2. The target vault-relative path matches `^specs/{active_slug}/.*\.md$`, where `{active_slug}` is read from `specs/<slug>/workflow-state.md` `status: active` discovery (the same lookup the orchestrator already does).
3. The user has not toggled "Require explicit accept for all writes" in settings (a Q7 ergonomic).

Every other proposal — including appends outside `specs/{active}/`, all `vault_write_note`, all `canvas_*` creates — stays queued.

This rule is the strictest interpretation that still solves the immediate user pain ("sidepanel agent confabulates success on `pending` responses while spec scaffolding"). It also matches the critic's recommendation verbatim (`critique.md` §5: "Auto-accept: append to `specs/{slug}/*.md` for the active feature only").

### Per-tool defaults to carry into the Tier-B follow-up spec

Documented here as **input** to the next spec, not as requirements in this one. From `ux.md` §1 + `critique.md` §5 + `SYNTHESIS.md` §"Phase 3":

| Tier-B tool | Recommended default | Source of recommendation |
|---|---|---|
| `obsidian_cli_task_toggle` | Auto-accept (low stakes; single-line write) | `SYNTHESIS.md` Phase 3 + `ux.md` §1 |
| `obsidian_cli_property_set` | Proposal w/ diff; auto-accept only when value ≤ 80 chars **and** scoped to active feature | `ux.md` §1 ("`property:set` ON when value length ≤ 80 chars") tightened by `critique.md` §5 (folder scope) |
| `obsidian_cli_file_create` | Auto-accept inside `specs/{active}/`; queued elsewhere | `SYNTHESIS.md` Phase 3 |
| `obsidian_cli_daily_append` / `daily_prepend` | Proposal; never auto-accept | `SYNTHESIS.md` Phase 3 (no folder-scope hook for daily notes) |
| `obsidian_cli_file_rename` | Proposal w/ diff; never auto-accept (link-updating side effects) | `SYNTHESIS.md` Phase 3 |
| `obsidian_cli_history_restore` | Proposal w/ full diff; never auto-accept | `critique.md` Risk R12 |
| `obsidian_cli_property_remove` | Proposal; never auto-accept | `critique.md` Risk R8 |
| `obsidian_cli_template_insert` | Proposal; never auto-accept | `SYNTHESIS.md` Phase 3 |

**Open item for the Tier-B follow-up spec.** RAT-2 (`SYNTHESIS.md` §"Riskiest assumptions") must run before any property/rename/restore tool ships. This research stops at recording the defaults; it does not propose running RAT-2 inside this feature's scope.

---

## Q2 — Webviewer scope (CLAR-MHP-003)

**Recommendation: carve out.** Confirm the existing intent in `idea.md` §"Out of scope" — webviewer ships in a separate spec.

**Evidence for carve-out (do not relitigate at /spec:requirements):**

1. **Critic verdict.** `discovery/obsidian-cli-mcp-expansion/critique.md` §4 calls the `web` + `dev:dom` + `dev:cdp` trio "a pre-built exfiltration kit" and demands a **fresh Electron partition** (no shared cookies / localStorage with the user's main session) plus a **domain allowlist** before `web` can ship at all. Both are non-trivial infrastructure changes — fresh-partition handling is an Obsidian-internals integration that needs its own POC.
2. **UX verdict.** `discovery/obsidian-cli-mcp-expansion/ux.md` §3 ("webviewer-pane-never-inline") establishes that the webviewer never renders inside the chat sidebar; it opens in an Obsidian pane and the chat shows a stub. That stub UX is itself a non-trivial design — it has its own card type with focus/snapshot/screenshot affordances threaded into the conversation. Designing that in parallel with the proposal pipeline pollutes both.
3. **Phasing.** `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` explicitly puts webviewer in **Phase 4**, after Tier-A reads (Phase 1), proposal infrastructure (Phase 2), and Tier-B writes (Phase 3). This feature is Phase 1 + Phase 2 only.
4. **Scope hygiene.** Including webviewer would double the surface of this feature (audit-log format would need to capture URL + DOM-snapshot semantics, settings UI would need a domain-allowlist editor, ADR-019 would need a fifth tier-class). The deferral has no cost — the proposal pipeline this feature ships is exactly the substrate the webviewer would later plug into.

**Concrete carve-out boundary for /spec:requirements.** The proposal pipeline schema (Q4) must remain **format-extensible**: future webviewer proposals will need to record a URL field and DOM-snapshot selector, neither of which exist in current proposal types. Recommendation: make the proposal payload an opaque object with a discriminator field (`kind: "vault_append" | "canvas_create_node" | …`) so a future `kind: "web_open"` does not break the audit-log reader. This is the only forward-compatibility obligation webviewer imposes on this feature.

---

## Q3 — DevTools threat model (CLAR-MHP-004)

The decision is fixed (`idea.md` §"Open questions" Q3). The deliverable is **the threat model the user is accepting by enabling each tool**, to be embedded verbatim in ADR-019 so the decision is recorded irreversibly. One paragraph per tool follows. All eight tools always go through the proposal pipeline so the audit log captures every invocation regardless of auto-accept settings (issue #430 acceptance criterion).

### Low-risk DevTools tier (single toggle: "Enable agent-driven DevTools")

#### `dev:screenshot`
**What it can access.** Captures a PNG of the rendered Obsidian renderer (the entire desktop window or the active webContents). The image is returned to the MCP client as base64. Any visible note content, open frontmatter, secrets pasted into another pane, and any other vault content currently on screen is captured.

**Abuse vector.** A malicious or compromised agent invokes `dev:screenshot` while the user has, e.g., an API key pasted into a note, an unredacted credential in a daily-note braindump, or another client's vault open. The PNG is then exfiltrated through the agent's normal channel (model API call back to the agent vendor). Unlike `vault_*` reads, screenshot bypasses the path/folder allowlist entirely — the only filter is "what pixels are on the user's screen right now."

**Mitigation provided by this feature.** (a) Every `dev:screenshot` invocation generates a proposal even when the DevTools master toggle has auto-accept on, so the audit log records the timestamp, client identifier, and proposal id. (b) The screenshot result payload is **not** itself written to the audit log — only the *fact* that a screenshot was taken — so the log file does not become an exfiltration channel of its own. (c) The DevTools master toggle defaults OFF; enabling it surfaces an in-settings warning explaining (a) and (b).

**What remains the user's responsibility.** The user accepts that *anything visible on screen when the tool fires* may leave the machine via the connected agent. Specorator cannot redact note content the user has chosen to display. If the vault contains real secrets, the user must disable DevTools before opening those notes.

#### `dev:errors`
**What it can access.** Returns the recent Electron renderer error stream (uncaught exceptions, console.error output, deprecation warnings).

**Abuse vector.** Error messages frequently embed file paths, plugin internals, and occasionally vault paths or partial note contents (e.g., a malformed dataview query that printed a tag name into a stack trace). A patient agent can use repeated `dev:errors` polls as a covert side channel for whatever the user does next.

**Mitigation provided by this feature.** Same as `dev:screenshot`: per-invocation proposal + audit-log entry; tool body is not persisted. The default-off + warning copy applies.

**What remains the user's responsibility.** The user accepts that vault paths and plugin-internals strings may leak via error text. Specorator does not redact errors.

#### `dev:console`
**What it can access.** Returns recent renderer `console.log` output. Like `dev:errors` but broader — includes plugin-emitted diagnostics, including any plugin that happens to log frontmatter or note contents to console.

**Abuse vector.** Same shape as `dev:errors` with larger surface area. Some popular plugins log search results, dataview row counts, or LLM-completion text to console.

**Mitigation provided by this feature.** Same as the other low-risk tools. The user-facing copy for the DevTools toggle must explicitly name `dev:console` as the highest-leakage of the three so the master toggle is not enabled lightly.

**What remains the user's responsibility.** The user accepts that any plugin-emitted log line may be exposed. Choosing which plugins to run is a pre-existing trust decision; this tool exposes the *output* of those decisions.

### High-risk DevTools tier (per-tool toggle + loud warning)

#### `dev:dom`
**What it can access.** Reads the rendered DOM of the active webContents by selector. This includes the full text of every open note, every property in every open frontmatter, the text of any open canvas card, and the text of any open Obsidian modal (including the command palette and any plugin-rendered settings UI).

**Abuse vector.** `dev:dom` is the *non-screenshot* version of total renderer read access. It does not need the user's screen to be facing the camera; it reads structured text directly. A single `dev:dom` call against a vault with the user's `.env`-like note open exfiltrates everything in that note.

**Mitigation provided by this feature.** Per-tool opt-in (`dev:dom` toggle separate from the master DevTools toggle). The settings UI for this toggle must render a red-bordered warning naming this specific risk. Per-invocation proposal + audit-log entry. Critically, `dev:dom` is also subject to the **non-auto-accept default** — even when the master DevTools toggle has auto-accept on for the low-risk three, `dev:dom` always prompts.

**What remains the user's responsibility.** The user accepts that any text currently rendered in any pane may leave the machine on a single tool call. The user is responsible for closing sensitive notes before enabling this tool.

#### `dev:cdp`
**What it can access.** Chrome DevTools Protocol — `Runtime.evaluate` (arbitrary JS in the renderer), `Network.getCookies` (any cookies the user's Electron session holds), `Page.captureScreenshot`, `Page.navigate`, `Storage.*`. Per `critique.md` §1 row 2: "Chrome DevTools Protocol = `Runtime.evaluate` = `eval` by another name."

**Abuse vector.** Total compromise. A `dev:cdp` call with `Runtime.evaluate` can do anything any in-renderer plugin could do — read every file the Obsidian process can read, write every file it can write, exfiltrate to any URL via `fetch`. CORS does not apply to CDP per `critique.md` §4. If the user has previously logged into any service in an Obsidian webviewer pane, `Network.getCookies` reads those cookies.

**Mitigation provided by this feature.** Per-tool opt-in with the loudest possible warning. Always-prompt (no auto-accept option exposed). Audit-log entry on every invocation. The settings copy must state that enabling this is functionally equivalent to giving the agent shell access to the Obsidian process. Recommendation for ADR-019: surface a one-line confirmation modal when the toggle is flipped on, separate from the per-invocation accept (i.e., two human actions to ever fire `dev:cdp`: enable the tool, then accept the proposal).

**What remains the user's responsibility.** The user accepts that with `dev:cdp` enabled, the agent has equivalent privilege to a fully trusted Obsidian plugin author. The only reason this tool is not "permanently denied" alongside `eval` (`critique.md` §1 row 1) is the user's explicit request in CLAR-MHP-004.

#### `dev:debug`
**What it can access.** Enables debug-mode flags on the Electron renderer; typically exposes timing data, internal state dumps, and verbose-mode `console.log` from Obsidian itself (which can include note content during indexing).

**Abuse vector.** Lower direct blast radius than `dev:cdp`, but enabling debug mode often turns on additional logging that other tools (`dev:console`, `dev:errors`) then read more of. Functions as a **force multiplier** for the low-risk tier.

**Mitigation provided by this feature.** Per-tool opt-in with warning; per-invocation proposal; audit-log entry. Settings copy must explain the force-multiplier dynamic — enabling `dev:debug` makes the low-risk three more leaky.

**What remains the user's responsibility.** The user accepts the force-multiplier dynamic and is responsible for not enabling `dev:debug` simultaneously with auto-accept on the low-risk tier unless the threat model is acceptable in that combination.

#### `dev:mobile`
**What it can access.** Toggles mobile-device emulation in the renderer (touch events, narrower viewport, mobile user-agent). Does not directly read or write vault state.

**Abuse vector.** Indirect. A malicious agent can force mobile emulation, which causes some plugins to render differently and may expose mobile-only UI affordances that bypass desktop assumptions. Lowest of the high-risk five but listed because it changes the renderer in ways the user may not visually notice (the chat sidebar may not reflect the emulation state).

**Mitigation provided by this feature.** Per-tool opt-in; per-invocation proposal; audit-log entry. Settings copy should note that the emulation change is visible in the main pane but may not be obvious in the sidebar.

**What remains the user's responsibility.** The user accepts that enabling this allows the agent to manipulate the renderer's emulation state. The user should disable when not actively using mobile-debugging workflows.

#### `devtools`
**What it can access.** Opens the Electron DevTools panel (the full Chrome DevTools UI) docked or undocked from the Obsidian window. Once open, a co-located malicious process or even a screen-watching attacker has full access to DevTools' Console / Elements / Sources / Network / Application tabs against the renderer.

**Abuse vector.** Opens a UI surface that an attacker who has *any* other foothold on the machine can drive — including a different user's process on a shared workstation. Unlike `dev:cdp`, which lets the agent itself do harm, `devtools` lets *anyone with screen access* do harm. Also classically the surface other attackers use post-foothold.

**Mitigation provided by this feature.** Per-tool opt-in; per-invocation proposal; audit-log entry. Settings copy must state that opening DevTools means anyone who can see the user's screen can read everything DevTools can read. Auto-accept is not exposed.

**What remains the user's responsibility.** The user accepts that this tool's threat model includes co-located humans, not just co-located processes. Single-user remote workstations are different from shared-machine and coworking environments.

### Summary table for ADR-019

| Tool | Tier | Auto-accept exposed? | Per-tool toggle? | Primary risk one-liner |
|---|---|---|---|---|
| `dev:screenshot` | low | yes (master toggle) | no | Pixel exfiltration of anything visible |
| `dev:errors` | low | yes (master toggle) | no | Path/plugin-internals leakage via error text |
| `dev:console` | low | yes (master toggle) | no | Plugin-emitted log content leakage |
| `dev:dom` | high | no | yes | Full text of every open note via selector |
| `dev:cdp` | high | no (always prompt) | yes (with second confirm to enable) | Equivalent to giving the agent shell |
| `dev:debug` | high | no | yes | Force multiplier for low-risk tier |
| `dev:mobile` | high | no | yes | Renderer state change agent can drive |
| `devtools` | high | no | yes | Co-located humans, not just processes |

---

## Q4 — Audit-log format and rotation

### Recommended JSONL schema (one JSON object per line, append-only)

```json
{
  "ts": "2026-05-24T14:32:18.412Z",
  "schema": 1,
  "client": {
    "id": "specorator-sidepanel",
    "transport": "in-process",
    "address": "127.0.0.1:0"
  },
  "tool": "vault_append_to_note",
  "proposal": {
    "id": "prop_01HXYZABCDE",
    "kind": "vault_append",
    "intent": "Append research findings to active feature's research.md",
    "paths": ["specs/mcp-host-side-proposals/research.md"]
  },
  "decision": {
    "outcome": "accepted",
    "by": "auto",
    "rule": "active-feature-append"
  },
  "result": {
    "ok": true,
    "error": null
  }
}
```

**Field rationale, in declaration order:**

- `ts` — ISO-8601 UTC with millisecond precision. Critical for ordering when an external client and the sidepanel act in the same second.
- `schema` — Integer schema version. Bumped only on a breaking field change. Lets the audit-log reader (and ADR-019 itself) evolve without a one-shot migration.
- `client` — Identifies *who* invoked the proposal. `id` is a short string the client supplies in the MCP handshake or that the server derives (`specorator-sidepanel`, `claude-desktop`, `terminal-claude`, `cursor`, `unknown`). `transport` distinguishes the in-process sidepanel from external loopback clients. `address` is the loopback origin where applicable; empty string for in-process. **This is new** — the current proposal store does not capture client identity. It is the single highest-value addition because without it, the audit log cannot answer "which client did this" — the question every user will ask first.
- `tool` — The MCP tool name as registered (`vault_append_to_note`, `workflow_proposal_accept`, `obsidian_cli_append_note`, etc.).
- `proposal` — Embedded snapshot of the proposal record at decision time, *not* a reference. Embedding (rather than referencing by id) means the audit log is self-contained — a future proposal-store rewrite cannot orphan historical entries. `proposal.kind` is the discriminator that keeps the format extensible (per Q2 carve-out compatibility). `proposal.intent` is the agent-supplied human-readable intent (always-populated string; empty for tools that don't require it yet — Tier-B will enforce non-empty). `proposal.paths` is a list of vault-relative paths the proposal touches.
- `decision.outcome` — `accepted` | `rejected` | `error`.
- `decision.by` — `auto` | `user` | `client` (the last is for `workflow_proposal_accept`/`_reject` from an external MCP client; distinguishing it from in-product UI accept is important for postmortems).
- `decision.rule` — When `by: auto`, names the rule that fired (`active-feature-append`, etc.). When `by: user` or `by: client`, empty string.
- `result` — `ok` boolean + optional `error` string when the underlying vault write fails after acceptance. Without this field, the audit log silently records "accepted" even when the write subsequently fails — which is the exact confabulation pattern this feature exists to prevent.

### Path conventions

**Vault-relative paths only.** All `proposal.paths` entries are vault-relative POSIX strings (forward slashes on every platform), never absolute. This (a) keeps the log portable when the vault moves, (b) avoids leaking the user's home directory or device hostname into the log, and (c) matches every other path convention in the plugin (`VaultPort.readFile` takes vault-relative paths per `CLAUDE.md` §"Narrow ports").

### Rotation — two alternatives evaluated

#### Alternative A — Size-based rotation (recommended)

Append to `.specorator/mcp-audit.log` until it crosses **2 MiB**. On crossing, rename to `.specorator/mcp-audit.log.1`. Keep at most **5 rotated files** (`.1`–`.5`); on creating `.6`, delete `.5` (rolling). All file ops use atomic rename via the `VaultPort`.

- **Pros.** Predictable disk-budget ceiling (~12 MiB worst case). Rotation events happen during write, where the code already holds a lock. No background timer. Works the same on desktop and mobile.
- **Cons.** A burst-write session may rotate twice in the same hour; a sparse-use vault may keep months of history in one file. Neither hurts correctness, but the latter makes "what did the agent do last Tuesday" harder to find without `grep`.

#### Alternative B — Date-based rotation (rejected)

Roll daily at UTC midnight (`mcp-audit-2026-05-24.log`). Keep last 30 days.

- **Pros.** Filename answers "what happened on date X" without `grep`. Natural alignment with retrospectives.
- **Cons.** Requires a midnight tick (timer or lazy-check on next write) that does not naturally exist in the plugin lifecycle. On a plugin that opens once a week, the lazy-check creates many empty files. Disk-budget unpredictable: a heavy-use day can produce an arbitrarily large single file.

**Winner: Alternative A (size-based, 2 MiB / 5 rotations).** Predictable disk budget matters more than human-readable filenames for a log designed to be queried programmatically (audit-log readers, not `cat`). The size threshold is high enough that normal use sees rotation only weekly-or-rarer, low enough that no single file becomes unwieldy. If "what happened on date X" turns out to be a frequent question in practice, a separate read-side tool (`workflow_audit_query` in a future spec) can address that without changing the on-disk format.

### Tamper considerations

Append-only by convention, not by filesystem enforcement (no `chattr +a` on cross-platform plugins). A user or an attacker with vault-write access can edit the log directly. **This is acceptable for the single-user threat model accepted in CLAR-MHP-001**: the audit log defends against the agent confabulating, not against an attacker who already has filesystem access. ADR-019 must state this limitation explicitly so future contributors do not mistake the log for a security control beyond its design intent.

---

## Q5 — MCP tool naming

### Existing namespaces (observed in `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` and prior ADRs)

| Namespace | Examples | What it groups |
|---|---|---|
| `obsidian_cli_*` | `obsidian_cli_append_note`, `obsidian_cli_backlinks` (planned) | Tools backed by the official Obsidian CLI per ADR-018 |
| `vault_*` | `vault_write_note`, `vault_append_to_note` | Vault-direct writes/reads not routed through the CLI |
| `canvas_*` | `canvas_add_node`, `canvas_link` (planned) | Canvas-specific mutations |
| `bases_*` | `bases_query`, `bases_views` (planned) | Bases-specific reads |
| `links_*` | (referenced in `idea.md` "existing namespaces are …") | Link-graph operations |
| `workflow_*` | (referenced in `idea.md`) | Workflow-state and orchestrator-adjacent tools |

### Alternatives compared

#### Alternative A — `proposal_*`
`proposal_list`, `proposal_get`, `proposal_accept`, `proposal_reject`.

- **Pros.** Shortest. Matches the verbatim wording in issue #430's acceptance criteria. Self-evident from the tool name alone.
- **Cons.** Sits outside every existing Specorator namespace. To an external client browsing `tools/list`, "proposal_*" looks like a bolt-on, not an integrated workflow operation. Risks collision with future generic-MCP-ecosystem tools named `proposal_*` once host-side proposals become a wider pattern (the MCP spec is moving in this direction; reserving a top-level word is hostile).

#### Alternative B — `mhp_proposal_*`
`mhp_proposal_list`, `mhp_proposal_get`, etc. ("MHP" = feature area code.)

- **Pros.** Uniquely Specorator. No risk of ecosystem collision.
- **Cons.** Area codes are internal traceability identifiers (REQ-MHP-NNN), not user-facing surfaces. Exposing `mhp` in a tool name leaks an implementation taxonomy at the API boundary. An external client has no way to know what "MHP" means. Future feature areas would multiply prefixes (`mhp_*`, `aii_*`, `tis_*`) and the tool list becomes alphabet soup.

#### Alternative C — `workflow_proposal_*`
`workflow_proposal_list`, `workflow_proposal_get`, `workflow_proposal_accept`, `workflow_proposal_reject`.

- **Pros.** Slots into the existing `workflow_*` namespace alongside other workflow-state-adjacent tools. The conceptual fit is exact: a proposal is a workflow-stage decision artifact (accept = advance; reject = bounce). Mirrors how `workflow-state.md` already governs stage transitions — proposals are *write* analogues of the same governance pattern. Avoids ecosystem collision (`workflow_*` is Specorator-scoped without exposing an internal area code).
- **Cons.** Slightly longer. A user who has never read the workflow doc may not immediately connect "workflow" with "host-side proposal queue." Mitigation: the tool's `description` field carries the explanation.

**Winner: Alternative C (`workflow_proposal_*`).** Best fit with existing namespace conventions; no ecosystem collision risk; reflects the actual conceptual role (workflow-governance write analogue). The verbosity cost is one extra word in four tool names — trivial against the clarity benefit.

**Note on issue #430.** The acceptance criteria use `proposal_list` / `proposal_accept` / etc. verbatim. The /spec:requirements stage should record `workflow_proposal_*` as the canonical name and reference issue #430 only as the spec-shadow source (the issue text predates the namespace decision and need not be amended).

---

## Q6 — Sidepanel-agent system-prompt addendum

The agent must understand that an MCP write tool returning a `pending` status (because the write was queued, not executed) is **not** success. Two alternative wordings follow. Both have been kept short — the addendum sits inside a system prompt with other content and must not balloon.

### Alternative A — Permissive (rejected)

> When you call a write tool and the response contains `"status": "pending"`, the change has been queued for the user to approve. Do not report the change as committed. Instead, describe the change you proposed and explain that the user must accept the proposal before it takes effect. After the user accepts or rejects, the response of `workflow_proposal_accept` or `workflow_proposal_reject` will tell you the outcome.

- **Pros.** Spells out the full protocol. No ambiguity about next steps.
- **Cons.** The phrase "describe the change you proposed" invites the agent to *re-narrate* the change in chat, which costs tokens and adds opportunities for confabulation in the narration itself. The phrase "after the user accepts or rejects" can be read as instruction to poll, which the sidepanel agent should not do (it should wait for the user to address the proposal card, not actively query).

### Alternative B — Restrictive (recommended)

> When a write tool returns `"status": "pending"`, the change has **not** been committed — it is queued for the user. Say so explicitly. Do not claim, summarise, or hint that the change took effect. Do not call `workflow_proposal_accept` on the user's behalf. The user will accept or reject the proposal; resume only when they tell you the outcome or you observe a follow-up tool call.

- **Pros.** Hard constraint on the agent's behaviour: no claiming success, no acting on the user's behalf, no polling. The "resume only when…" clause neutralises the most common confabulation pattern (the agent assumes acceptance and continues planning). Leaves room for legitimate writes — the agent is told what `pending` means, not told to refuse `pending`.
- **Cons.** Slightly more verbose. The negative phrasing ("Do not …") is style-flagged by some prompt linters; this is a known trade-off for safety constraints.

**Winner: Alternative B.** The safer wording is the correct choice for a constraint whose entire purpose is to prevent a specific failure mode. The agent does not need to know how to drive proposals (the user does); it needs to know how to *not* lie about them.

**Operational note for /spec:requirements.** The addendum is text that lives in the sidepanel agent's system prompt — a fixed file the plugin ships (likely under `.claude/` or an equivalent agent-config path; the exact location is a stage-4 design concern). The requirement here is just that the addendum exists, is testable, and is shipped with the sidepanel agent's prompt assets.

---

## Q7 — DevTools settings-tab ergonomics

### What the existing settings tab provides (observed)

Per `CLAUDE.md` §"Key files" and `src/plugin/settings.ts`: the existing settings tab uses Obsidian's standard `Setting` API building blocks — toggles, text fields, an autodetect button, status text. These are the right primitives. The question is whether they suffice in their current arrangement, or whether the DevTools surface needs a new visual pattern.

### Assessment

The existing toggle/text-field/status-text primitives **are sufficient as building blocks**, but the **arrangement** needs a new pattern. Specifically:

1. **Grouping.** The eight DevTools tools must be grouped into one visually distinct section so the user reads them as a unit ("the DevTools threat surface") rather than as eight independent toggles scattered among unrelated settings. Today's settings tab has no concept of a bordered/warning section.

2. **Tier separation within the group.** The low-risk three (`dev:screenshot`, `dev:errors`, `dev:console`) belong behind one master toggle. The high-risk five (`dev:dom`, `dev:cdp`, `dev:debug`, `dev:mobile`, `devtools`) each need their own toggle, each with a per-tool warning. A flat list of eight toggles would obscure the tier structure that Q3's threat model establishes.

3. **Per-tool warning copy.** Each high-risk toggle needs ~1–2 lines of explanatory copy below it (the one-liner from Q3's summary table is the minimum; the full mitigation paragraph is the maximum). Today's `Setting` API renders `name` + `desc` per row; `desc` is the slot for the warning copy. This works; the constraint is just that `desc` text must be longer and more visually distinct than typical settings rows.

4. **Second confirm on `dev:cdp` enable.** Per Q3, flipping the `dev:cdp` toggle on should fire a confirmation modal explaining the equivalence to shell access. The plugin's existing `Modal` subclass pattern (per `CLAUDE.md` §"DOM construction") is the right primitive — no new pattern needed for the confirm itself, only for *firing it from a toggle change handler*.

5. **Visual warning treatment.** The high-risk section needs a coloured border or background (CSS) to read at a glance as "danger zone." This is `styles.css` work, not a new Vue component or new settings primitive.

### Recommendation for /spec:requirements

- **Pattern needed:** "grouped warning section with per-tool toggles and per-tool warning copy, plus a confirm modal on `dev:cdp` enable." All component-level primitives exist (Setting, Modal); the missing pieces are the section grouping (a styled container) and the toggle-change-handler-fires-modal wiring.
- **Pattern NOT needed:** new settings-tab framework, new Vue component, new InjectionKey, new port. The DevTools surface is settings-tab work.
- **Defer to ux-designer (stage 4):** exact copy of the warning text per tool, exact visual treatment (border colour, icon, spacing), keyboard accessibility of the confirm modal.

This is a **light input** to stage 4 — the analyst's job here is to confirm existing primitives suffice and identify the one new pattern. Full UI design happens in /spec:design.

---

## Market / ecosystem

| Solution | Approach | Strengths | Weaknesses | Source |
|---|---|---|---|---|
| `cli-rest-mcp` (community Obsidian plugin) | Two-tool "Code Mode" (`search` + `execute`), 64-char API key, localhost-only bind, `execFile` not `exec`, per-command blocklist surfaced in settings | Minimal MCP surface; clean security posture per surface area | Pushes safety problem onto user; no proposal-gating; no typed tool semantics → agent picks among free-form CLI strings | `discovery/obsidian-cli-mcp-expansion/research.md` §3 |
| `aaronsb/obsidian-mcp-plugin` | Rich read surface via REST + self-signed TLS in `.obsidian/plugins/.../certificates/` | Validates that comprehensive read coverage is wanted | Trust-store friction is repeated user complaint; no write governance | `discovery/obsidian-cli-mcp-expansion/research.md` §3 |
| `ebullient/obsidian-vault-mcp` | Desktop-only, optional bearer auth, read-only | Validates that read-only is sellable | Read-only means none of the proposal-pipeline question applies | `discovery/obsidian-cli-mcp-expansion/research.md` §3 |
| Specorator's current `ObsidianMcpServerAdapter` | In-process loopback; `proposalStore` queues writes; no UI consumer | Already has the data model | Store is orphaned — `acceptProposal`/`rejectProposal`/`getProposals` are unused; no audit log; no client identity capture | `specs/mcp-host-side-proposals/idea.md` §"Problem statement"; `docs/adr/ADR-013-obsidian-mcp-server.md`; `docs/adr/ADR-018-mcp-tools-backed-by-obsidian-cli.md` |
| MCP spec direction (industry) | The MCP working group is moving toward standardising host-side approval patterns; "human-in-the-loop" is referenced in multiple MCP client implementations released 2026 | Specorator's design aligns with where the ecosystem is heading | The standard is not finalised; naming choices (Q5) may need a future revision | Observed in `discovery/obsidian-cli-mcp-expansion/research.md` §5 sources; not independently re-verified for this stage |

**Internal prior art:** ADR-013 establishes the in-process MCP server architecture; ADR-018 establishes the CLI-backed tool pattern; both must not be regressed. Both stop short of host-side proposal handling, which is the gap this feature fills.

---

## User needs

Carried from `discovery/obsidian-cli-mcp-expansion/user-research.md` and `discovery/obsidian-cli-mcp-expansion/strategy.md`. The user-research artifact is explicitly marked `assumed — to be validated` (no live switch interviews run); findings are treated as hypotheses, not validated facts.

- **Finding 1 (assumed).** Focused Builders running agents from the terminal need accept/reject without opening Obsidian — *source:* `idea.md` §"Target users" + `user-research.md` §1 prompt 4. This is the load-bearing assumption for the entire host-agnostic design. If false, an Obsidian-only proposal view would suffice and the MCP-tool surface (`workflow_proposal_*`) could be dropped. **Validation path:** observe whether early adopters call `workflow_proposal_*` from terminal `claude` in the first week post-ship.
- **Finding 2 (assumed).** PKM Tinkerers want auto-accept for low-risk operations, will disable the proposal gate if it fires on reads — *source:* `user-research.md` §2 H2 ("bypass-request rate > 30% in week 1"). Resolved in this feature by **never proposal-gating reads** (Q1's Read class is always-allow).
- **Finding 3 (assumed).** Solo Consultants cannot tolerate silent confabulation or vault-root config leakage on client vaults — *source:* `user-research.md` §2 H3 + `idea.md` §"Target users". Resolved in this feature by the `.mcp.json` → `.obsidian/mcp.local.json` migration and the `pending`-confabulation system-prompt addendum (Q6).
- **Finding 4 (assumed).** The audit log is required when a vault is shared across multiple MCP clients (Claude Desktop + Cursor + terminal) — *source:* `user-research.md` §5 ("Engineering Manager on shared/team vault" — change-mind: per-tool audit log committed to git"). Resolved by the JSONL log (Q4) with `client.id` and `client.transport` fields capturing which client did what.

**Assumptions that must hold (and how to validate later):**

- **A1.** Capturing `client.id` is feasible across the four target clients. Some MCP clients may not advertise an identifier in their handshake; the server must fall back to `unknown` rather than refuse. Validate by attempting the handshake with each of the four during /spec:implement.
- **A2.** The audit-log rotation threshold (2 MiB) is large enough that normal use sees rotation weekly-or-rarer. Validate by instrumenting log size growth in pilot vaults during /spec:review.
- **A3.** RAT-1 (loopback-as-security-boundary, per `critique.md`) is acceptable to defer because this feature does not expand the write surface — every write that exists today already trusts loopback. Validate at the Tier-B follow-up spec, not here.

---

## Alternatives considered

This feature *can* in principle ship in three substantively different shapes. Each ships the same on-disk artifacts (audit log + `.obsidian/mcp.local.json`) but differs in how the host-side approve/reject is reached.

### Alternative A — MCP-tool-only host-side surface (recommended)

`workflow_proposal_list` / `workflow_proposal_get` / `workflow_proposal_accept` / `workflow_proposal_reject` exposed as MCP tools. Any client (sidepanel, terminal `claude`, Cursor, Claude Desktop) can drive the queue. No Obsidian-side view is built.

- **Pros.** Honours the "terminal-driveable end-to-end" constraint from `idea.md`. Single code path — no UI/non-UI split. Users in `discovery/obsidian-cli-mcp-expansion/user-research.md` §5 ("Vault Purist", "Engineering Manager") get the same governance whether or not Obsidian is open. Matches the user's explicit decision in `idea.md` §"Out of scope" not to build a new Obsidian view.
- **Cons.** A user with **only** the Obsidian sidepanel running needs the sidepanel agent to call the proposal tools on their behalf — but the system-prompt addendum (Q6) tells the agent **not** to do that. Resolved by: the sidepanel renders the proposal card (existing pattern from `discovery/obsidian-cli-mcp-expansion/ux.md` §2), and the user's click in the card calls the same `workflow_proposal_accept` tool internally via a direct in-process path. The agent never sees `_accept` in its tool list (or sees it with a description that reinforces the addendum).
- **Why pick.** Only option that meets the constraint set in `idea.md` §"Constraints" without compromise.

### Alternative B — In-Obsidian proposal view, MCP tools as secondary surface

Build a new Obsidian view (sidebar pane) that lists pending proposals. MCP tools exist but are positioned as the "advanced" path.

- **Pros.** Familiar Obsidian UX. Easier to discover for users who live in Obsidian.
- **Cons.** Directly contradicts `idea.md` §"Out of scope": "User has explicitly decided not to build [a new Obsidian view]; accept/reject is achieved via MCP tools so terminal/external clients can drive the workflow without the Obsidian UI being open." Also doubles the surface area of this feature (new view + new MCP tools), violating the scope constraint in `idea.md` §"Constraints" ("keep this feature scoped to the proposal pipeline + Tier-A reads + DevTools opt-in + ADR-019").
- **Why not pick.** User decision is recorded against this exact tradeoff.

### Alternative C — Single in-process accept path; no external MCP surface

The sidepanel renders proposal cards and accepts/rejects via direct in-process method calls on `ObsidianMcpServerAdapter`. No `workflow_proposal_*` tools are exposed externally. External MCP clients submit writes that queue forever (or are refused).

- **Pros.** Smallest code surface. No need to think about cross-client identity, audit-log `client.id` field, or system-prompt addendums (the agent never sees `workflow_proposal_*`).
- **Cons.** Excludes terminal `claude`, Cursor, Claude Desktop — exactly the multi-client scenario `idea.md` §"Problem statement" calls out. Would mean the feature fixes confabulation only for the in-process sidepanel and leaves every other client broken in the same way it is today.
- **Why not pick.** The problem statement *is* multi-client. This alternative would not solve it.

---

## Technical considerations

- **Proposal store wiring.** The existing `ObsidianMcpServerAdapter.proposalStore` has `acceptProposal` / `rejectProposal` / `getProposals` methods (per `idea.md` §"Problem statement"). The work in this feature is to (a) call them from new `workflow_proposal_*` MCP tools, (b) call them from the sidepanel proposal-card click handler, (c) audit-log every invocation, (d) capture `client.id` and `transport` at the call site. This is wiring + observability, not a re-architecture.
- **Client identity.** The MCP server must capture *which* client invoked each tool. For in-process (sidepanel) calls, the adapter is the only caller and can stamp `client.id = "specorator-sidepanel"` directly. For external loopback calls, the MCP server can inspect the `Origin` / `User-Agent` headers in the HTTP handshake; clients that send neither become `client.id = "unknown"`. This is a small infrastructure change and a known limitation of the MCP transport spec at present.
- **`.mcp.json` migration.** First-start migration logic must (a) detect a `.mcp.json` at vault root, (b) read its contents, (c) write the same contents to `.obsidian/mcp.local.json`, (d) delete the root file only after successful write, (e) optionally show a one-time notice describing what happened. The migration must be idempotent (no-op when the root file is absent). The `.gitignore` entry the plugin ships is for the new path. The plugin **must not** silently delete the root file if writing the new file fails.
- **Settings ergonomics.** Per Q7: the DevTools group needs a new visual pattern but no new component primitives; one new behaviour (toggle-change-handler-fires-modal) and `styles.css` work for the warning section.
- **Tier-A reads.** 12 new MCP tools (per `SYNTHESIS.md` §"Phase 1") plus one escape hatch (`obsidian_cli_read_command`). All are read-only, never proposal-gated, never auto-accept (they have no accept concept). The escape hatch needs regex-validated args (no `;` `|` `&&` `$(`) per `discovery/obsidian-cli-mcp-expansion/research.md` §2.
- **Audit log file ops.** `VaultPort.writeFile` + atomic-rename pattern. The rotation step (rename `.log` → `.log.1`) competes with concurrent writes; the adapter must hold a write lock around (read-size, decide-rotate, append, maybe-rename). Single-process so a simple in-memory mutex suffices.
- **Audit log location.** `.specorator/mcp-audit.log` is vault-relative. The `.specorator/` folder may not exist on first write; the plugin must create it. This is the only file written under `.specorator/` by this feature (no telemetry per `idea.md` §"Out of scope").
- **Backwards compatibility.** ADR-013 (in-process MCP server) and ADR-018 (CLI-backed tools) must not regress. The proposal-store data model already exists; this feature only adds fields (`intent`, `client.id`) — additive, not breaking.
- **ADR-019.** Authored in this feature. Documents the tier-class policy, the permanent deny-list (Top-10 dangerous list from `critique.md` §1), the DevTools opt-in matrix, and the per-tool threat paragraphs from Q3.

---

## Risks

Surfaces what is **new** to the proposal pipeline itself. Does not restate the discovery-stage critique top-10 (`discovery/obsidian-cli-mcp-expansion/critique.md` §1) or the broader risk register (`critique.md` §"Risk register"); those are cited as upstream context and apply to the wider CLI expansion that is *not* in this feature's scope.

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| RISK-MHP-001 | Race condition on accept: a proposal is accepted from terminal `claude` and the sidepanel card simultaneously; the underlying write executes twice or the second accept errors mid-flight | high | med | The adapter holds a single in-memory mutex per proposal id; `acceptProposal` is idempotent — a second accept on an already-accepted id returns the original result, not an error. Logged in the audit log with both decision rows (the second has `decision.outcome: "already-decided"`). |
| RISK-MHP-002 | Missing client identification: external MCP clients that do not send `Origin` / `User-Agent` headers all log as `unknown`, defeating the audit log's "which client" question | med | high | Document the limitation in ADR-019. Provide a one-line config in `.obsidian/mcp.local.json` letting users assign a stable `client_id` per-connection at the server side. Pilot ship for sidepanel + terminal `claude` (both of which we control); fall back gracefully for others. |
| RISK-MHP-003 | Audit-log tamper: a user (or attacker with vault-write access) edits `.specorator/mcp-audit.log` post-hoc | med | low | Accepted limitation under the single-user threat model (CLAR-MHP-001). ADR-019 must state explicitly that the audit log defends against agent confabulation, not against an attacker with filesystem access. If multi-user is later introduced (CLAR-MHP-001 revisited), revisit this risk with a separate spec. |
| RISK-MHP-004 | `.mcp.json` migration data loss: the root-file read succeeds, the new-file write fails, the root-file delete runs anyway | high | low | Strict ordering: write new file first → verify file exists and contents match → only then delete root. If verify fails, leave root in place and surface a notice. The migration is idempotent across re-runs. |
| RISK-MHP-005 | Migration on a synced vault races a sync process: iCloud/Syncthing/Git is replaying the root `.mcp.json` to other devices while the migration deletes it locally; the file resurrects | med | med | First-start migration only acts on the local device. The shipped `.gitignore` covers Git; the root file is added to it before deletion so the deletion is committable. For iCloud/Syncthing (filesystem-level sync), the migration is best-effort — if the file resurrects, the next start migrates again. Document this in ADR-019 + the migration notice. |
| RISK-MHP-006 | DevTools tool exfiltration despite per-invocation audit: the audit row records "screenshot taken" but the screenshot bytes already left via the agent's channel | high | med (conditional on user enabling DevTools master toggle) | Mitigation is consent, not interception. The settings UI for the DevTools toggle must surface the threat model from Q3 in a form the user cannot dismiss without reading. The audit log establishes *that* the exfiltration occurred; the user accepts the trade by enabling the tool. |
| RISK-MHP-007 | `dev:cdp` enabled accidentally (toggle flip without reading the warning) | high | med | Second confirm modal on `dev:cdp` enable (Q7). The modal must require explicit click on a confirm button, not auto-dismiss. Per-invocation accept is always required regardless of the master toggle. |
| RISK-MHP-008 | System-prompt addendum is silently dropped from the agent's prompt during prompt-template edits in a future release | med | med | The addendum must live in a versioned file the plugin owns (not a user-editable template). A unit test asserts the addendum string is present in the sidepanel agent's assembled system prompt. Failing the test must block release. |
| RISK-MHP-009 | Audit-log JSONL schema bump breaks an external log-reader | low | med | The `schema` integer field exists from v1. Readers branch on `schema`. ADR-019 records that schema bumps require a deprecation notice in the release notes; this is a release-process commitment, not a hard technical mitigation. |
| RISK-MHP-010 | `workflow_proposal_*` namespace collision if MCP working group standardises a different name for host-side approval primitives | low | low | Accepted. If a future MCP standard names host-side proposal tools differently, register aliases that delegate to `workflow_proposal_*`. The internal implementation is unaffected. |

---

## Recommendation

Take **Alternative A (MCP-tool-only host-side surface)** into /spec:requirements with the following concrete inputs from this research:

1. **Proposal tools named `workflow_proposal_list` / `_get` / `_accept` / `_reject`** (Q5 winner).
2. **Audit log at `.specorator/mcp-audit.log`, JSONL schema v1** as specified in Q4, with size-based rotation at 2 MiB / 5 rotations.
3. **The single in-this-feature auto-accept rule** is active-feature-append on `^specs/{active_slug}/.*\.md$` for the two append tools (Q1). All other Tier-B thresholds are deferred to the Tier-B follow-up spec but are recorded here so the PM does not need to rediscover them.
4. **Webviewer carved out** to a separate spec; this feature's only obligation to the future webviewer is to keep the proposal payload format extensible via a `kind` discriminator (Q2).
5. **DevTools opt-in surface as Q3 + Q7 describe:** master toggle for the low-risk three, per-tool toggle + warning for the high-risk five, second-confirm modal on `dev:cdp` enable, every invocation audit-logged regardless of auto-accept.
6. **System-prompt addendum** uses the wording in Q6 Alternative B (restrictive), shipped in a versioned plugin-owned file, asserted-present by a unit test (RISK-MHP-008 mitigation).
7. **ADR-019 authored in this feature** documenting tier policy, permanent deny-list, DevTools opt-in matrix, and Q3's per-tool threat paragraphs verbatim.

**What still needs validating before implementation:**

- **CLAR-MHP-002 user signoff** on Q1's defaults is procedurally required before /spec:design even though the only in-scope default is the active-feature-append rule.
- **A1** (client.id feasibility across the four target clients) is verifiable only during /spec:implement; if any target client cannot supply identity, RISK-MHP-002's mitigation is the fallback.
- **CLAR-MHP-003** is resolved by Q2; close the clarification at /spec:requirements with "carve out — separate spec" as the recorded decision.

The PM may want to consider, as a new clarification surfaced by this research:

- **CLAR-MHP-005 (new — proposed).** What happens to a proposal that is queued when the plugin is restarted? The current proposal store is in-memory only (per `idea.md` §"Problem statement"); a restart loses pending proposals. For the host-agnostic terminal-driveable model, this means a terminal agent that issued a write before a sidepanel reload will see its proposal silently vanish. Either (a) persist proposals to disk between restarts, or (b) explicitly document that the proposal queue is ephemeral and the audit log records the discarded proposals on shutdown. **Recommendation to PM:** option (b) for v1 (smaller scope), with persistence promoted to its own follow-up if pilot users report the drop.

---

## Sources

- Specorator idea — `specs/mcp-host-side-proposals/idea.md`
- Issue PRD shadow — `issues/430-mcp-host-side-proposals.md`
- Discovery synthesis — `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md`
- Discovery critique (Top-10 dangerous, exfil chain, proposal-store fatigue, loopback boundary, `.mcp.json` leakage) — `discovery/obsidian-cli-mcp-expansion/critique.md`
- Discovery UX (4 tool classes, webviewer-pane-never-inline) — `discovery/obsidian-cli-mcp-expansion/ux.md`
- Discovery user research (personas, hypotheses, RATs) — `discovery/obsidian-cli-mcp-expansion/user-research.md`
- Discovery strategy (North Star: weekly approved tool invocations + approval-rate guardrail) — `discovery/obsidian-cli-mcp-expansion/strategy.md`
- Discovery analyst inventory (prior art) — `discovery/obsidian-cli-mcp-expansion/research.md`
- Architectural precedents — `docs/adr/ADR-013-obsidian-mcp-server.md`, `docs/adr/ADR-018-mcp-tools-backed-by-obsidian-cli.md`
- Plugin architecture reference — `CLAUDE.md` §§ "Narrow ports (ADR-008)", "DOM construction", "Key files"
- Workflow state — `specs/mcp-host-side-proposals/workflow-state.md`
- Prior-art external sources cited via `discovery/obsidian-cli-mcp-expansion/research.md` §5:
  - Obsidian Security — From well-known to Well-Pwned (MCP client RCE, 2026) — https://www.obsidiansecurity.com/blog/from-well-known-to-well-pwned-common-vulnerabilities-in-ai-agents
  - PHANTOMPULSE RAT via Obsidian plugin abuse (Apr 2026) — https://thehackernews.com/2026/04/obsidian-plugin-abuse-delivers.html
  - Obsidian Shell Commands abuse playbook (Penligent) — https://www.penligent.ai/hackinglabs/obsidian-shell-commands-abuse-shows-a-new-malware-playbook/
  - Dataview `eval` RCE — CVE-2021-42057 — https://github.com/blacksmithgu/obsidian-dataview/issues/615
  - cli-rest-mcp (community Obsidian plugin) — https://community.obsidian.md/plugins/cli-rest-mcp
  - aaronsb/obsidian-mcp-plugin — https://github.com/aaronsb/obsidian-mcp-plugin
  - ebullient/obsidian-vault-mcp — https://github.com/ebullient/obsidian-vault-mcp
  - MCP or CLI? (Security Boulevard, Apr 2026) — https://securityboulevard.com/2026/04/mcp-or-cli-how-to-choose-right-interface-for-your-ai-tools/

---

## Quality gate

- [x] Each research question is answered or marked open. (Q1–Q7 all answered; CLAR-MHP-002 user signoff procedurally outstanding but does not block stage 3.)
- [x] Sources cited. (Internal artifacts by relative path; external sources by URL.)
- [x] ≥ 2 alternatives explored. (Three host-side surface alternatives, two audit-log rotation alternatives, three tool-naming alternatives, two system-prompt addendum alternatives.)
- [x] User needs supported by evidence (or assumptions explicit). (Findings 1–4 explicitly marked `assumed` because user-research artifact is itself `assumed — to be validated`; validation paths recorded.)
- [x] Technical considerations noted. (Proposal-store wiring, client identity, `.mcp.json` migration, settings ergonomics, Tier-A reads, audit-log file ops, ADR-019 obligation.)
- [x] Risks listed with severity. (10 risks specific to this feature, each with mitigation.)
- [x] Recommendation made. (Alternative A with seven concrete inputs for /spec:requirements + one new proposed clarification CLAR-MHP-005.)
