---
id: ADR-019
title: MCP tier policy, permanent deny-list, and DevTools opt-in matrix
status: proposed
date: 2026-05-24
deciders:
  - architect
  - pm
consulted:
  - ux-designer
  - ui-designer
  - analyst
informed:
  - dev
  - qa
  - sre
supersedes: []
superseded-by: []
amends: ADR-013, ADR-018
references:
  - specs/mcp-host-side-proposals/requirements.md
  - specs/mcp-host-side-proposals/research.md
  - specs/mcp-host-side-proposals/design.md
  - discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md
  - discovery/obsidian-cli-mcp-expansion/critique.md
  - docs/adr/ADR-013-obsidian-mcp-server.md
  - docs/adr/ADR-018-mcp-tools-backed-by-obsidian-cli.md
tags: [mcp, security, devtools, governance]
---

# ADR-019 — MCP tier policy, permanent deny-list, and DevTools opt-in matrix

## Status

Proposed.

## Context

ADR-013 stood up the in-process MCP server with a `ProposalStore` boundary;
ADR-018 added the CLI-backed tool group with a read-only allow-list and one
proposal-queued write. Neither ADR speaks to *which classes of operation* the
server may register, nor to the threat surface of the Obsidian DevTools-adjacent
commands (`dev:cdp`, `dev:dom`, `dev:screenshot`, `dev:console`, `dev:errors`,
`dev:debug`, `dev:mobile`, `devtools`).

The discovery stream (`discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md`,
`critique.md`) and the host-side-proposals research (`research.md` §Q3) converge
on three governance levers this ADR fixes irreversibly:

1. **Tier policy.** Reads always-allow, safe-writes go through the proposal queue
   with a narrow auto-accept carve-out, risky-writes never auto-accept, and
   DevTools-class operations are always proposal-gated and audit-logged.
2. **Permanent deny-list.** A set of CLI commands is unreachable through any
   MCP tool registered by Specorator — including the read-only escape hatch in
   REQ-MHP-013. Removal requires a superseding ADR, not a settings flag.
3. **DevTools opt-in matrix.** The user explicitly accepts a threat model when
   enabling each DevTools tool. The matrix and the per-tool threat paragraphs
   are encoded here so the consent surface (settings tab + confirm modal,
   `DESIGN-MHP-001` Part B §S07) renders the same text the ADR commits to.

CLAR-MHP-004 is the user's explicit override against the SYNTHESIS-level
recommendation to deny the eight DevTools tools outright: the user accepts the
threat model in exchange for the tools, and ADR-019 captures both the override
and the threat text the user is accepting.

## Decision

### Part 1 — Tier policy

Specorator's MCP server classifies every tool into exactly one of four tiers,
fixed at server registration time:

| Tier | Default policy | Examples |
|---|---|---|
| **Read** (always-allow) | Executed synchronously. No proposal record, no audit row. | The 12 Tier-A reads (REQ-MHP-011), `obsidian_cli_read_command` escape hatch (REQ-MHP-013), pre-existing read tools. |
| **Safe-write** (proposal-queued; narrow auto-accept) | Always queued. Auto-accepts iff the active-feature-append rule (REQ-MHP-009) matches AND `requireExplicitAcceptForAllWrites` is `false` (REQ-MHP-010). | `vault_append_to_note`, `obsidian_cli_append_note`. |
| **Risky-write** (proposal-queued; never auto-accept) | Always queued; auto-accept rule never fires. | `vault_write_note`, `canvas_create_node`, `canvas_link`, `canvas_update_node`. (Tier-B writes deferred to a follow-up spec inherit this tier.) |
| **Interactive (DevTools)** (proposal-gated; opt-in matrix) | Always queued and audit-logged; the opt-in matrix in Part 3 governs registration and per-tool auto-accept. | `dev:screenshot`, `dev:errors`, `dev:console`, `dev:dom`, `dev:cdp`, `dev:debug`, `dev:mobile`, `devtools`. |

The tier is a property of the tool definition, not of the call. A read tool
cannot become proposal-gated by setting; a write tool cannot become a read by
setting. Changing a tool's tier requires a superseding ADR.

### Part 2 — Permanent deny-list (REQ-MHP-014, REQ-MHP-015)

The following CLI commands have no registered MCP tool and are rejected by the
escape hatch with MCP error code `not_allowed`. The list is a hard-coded
server-side constant; it is **not** user-editable. A unit test (release-criteria
item) asserts each name is absent from `tools/list` and is rejected by
`obsidian_cli_read_command`. (Taken verbatim from
`discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Permanently denied",
adjusted only to remove the eight DevTools entries — those move to Part 3 per
CLAR-MHP-004.)

`eval`, `plugin:install`, `plugin:uninstall`, `plugin:enable`, `plugin:disable`,
`plugin:reload`, `plugins:restrict`, `theme:install`, `theme:uninstall`,
`theme:set`, `snippet:enable`, `snippet:disable`, `sync` (on/off),
`publish:add`, `publish:remove`, `publish:open`, `command` (palette executor),
`restart`, `reload`, `vault:open`, `workspace:load`, `tab:open`, `delete`
(file).

Removal of any entry is a security-boundary change and requires a superseding
ADR. Additions are non-breaking and may be made by amendment.

### Part 3 — DevTools opt-in matrix (REQ-MHP-016, REQ-MHP-017, REQ-MHP-018, REQ-MHP-019, REQ-MHP-020, REQ-MHP-021)

Two gates: a master toggle and per-tool toggles for the high-risk five. The
matrix below is normative.

| Tool | Tier | Registered when | Auto-accept exposed? | Per-tool toggle? | Primary risk one-liner |
|---|---|---|---|---|---|
| `dev:screenshot` | low | `devtools.masterEnabled = true` | yes (`devtoolsAutoAcceptLowRisk`, CLAR-MHP-010) | no | Pixel exfiltration of anything visible. |
| `dev:errors` | low | `devtools.masterEnabled = true` | yes (`devtoolsAutoAcceptLowRisk`) | no | Path/plugin-internals leakage via error text. |
| `dev:console` | low | `devtools.masterEnabled = true` | yes (`devtoolsAutoAcceptLowRisk`) | no | Plugin-emitted log content leakage. |
| `dev:dom` | high | `devtools.masterEnabled = true` AND `devtools.tools.dev:dom.enabled = true` | no (always-prompt) | yes (confirm modal on enable) | Full text of every open note via selector. |
| `dev:cdp` | high | `devtools.masterEnabled = true` AND `devtools.tools.dev:cdp.enabled = true` | no (always-prompt — REQ-MHP-020) | yes (confirm modal on enable) | Equivalent to giving the agent shell. |
| `dev:debug` | high | `devtools.masterEnabled = true` AND `devtools.tools.dev:debug.enabled = true` | no (always-prompt) | yes (confirm modal on enable) | Force multiplier for the low-risk tier. |
| `dev:mobile` | high | `devtools.masterEnabled = true` AND `devtools.tools.dev:mobile.enabled = true` | no (always-prompt) | yes (confirm modal on enable) | Renderer state change agent can drive. |
| `devtools` | high | `devtools.masterEnabled = true` AND `devtools.tools.devtools.enabled = true` | no (always-prompt) | yes (confirm modal on enable) | Co-located humans, not just processes. |

Every invocation of any DevTools tool — auto-accepted or not — is enqueued as a
proposal and produces one audit-log row (REQ-MHP-019). Result payloads (PNG
bytes, console output, DOM text) are **not** persisted to the audit log
(REQ-MHP-021); only the metadata (tool name, proposal id, decision,
timestamp, client.id).

### Part 4 — Threat paragraphs (verbatim user-facing copy)

The paragraphs below are the user-facing copy the confirm modal renders when
the user flips a high-risk per-tool toggle, and the threat model the user is
accepting when they keep the master or per-tool toggle on. They are copied
**verbatim** from `specs/mcp-host-side-proposals/research.md` §Q3 — that file
and this ADR are kept in lock-step; if either is amended the other must be
updated in the same PR.

#### `dev:screenshot` (low-risk)

**What it can access.** Captures a PNG of the rendered Obsidian renderer (the
entire desktop window or the active webContents). The image is returned to the
MCP client as base64. Any visible note content, open frontmatter, secrets pasted
into another pane, and any other vault content currently on screen is captured.

**Abuse vector.** A malicious or compromised agent invokes `dev:screenshot`
while the user has, e.g., an API key pasted into a note, an unredacted
credential in a daily-note braindump, or another client's vault open. The PNG
is then exfiltrated through the agent's normal channel (model API call back to
the agent vendor). Unlike `vault_*` reads, screenshot bypasses the path/folder
allowlist entirely — the only filter is "what pixels are on the user's screen
right now."

**Mitigation provided by this feature.** (a) Every `dev:screenshot` invocation
generates a proposal even when the DevTools master toggle has auto-accept on,
so the audit log records the timestamp, client identifier, and proposal id. (b)
The screenshot result payload is **not** itself written to the audit log — only
the *fact* that a screenshot was taken — so the log file does not become an
exfiltration channel of its own. (c) The DevTools master toggle defaults OFF;
enabling it surfaces an in-settings warning explaining (a) and (b).

**What remains the user's responsibility.** The user accepts that *anything
visible on screen when the tool fires* may leave the machine via the connected
agent. Specorator cannot redact note content the user has chosen to display. If
the vault contains real secrets, the user must disable DevTools before opening
those notes.

#### `dev:errors` (low-risk)

**What it can access.** Returns the recent Electron renderer error stream
(uncaught exceptions, console.error output, deprecation warnings).

**Abuse vector.** Error messages frequently embed file paths, plugin internals,
and occasionally vault paths or partial note contents (e.g., a malformed
dataview query that printed a tag name into a stack trace). A patient agent
can use repeated `dev:errors` polls as a covert side channel for whatever the
user does next.

**Mitigation provided by this feature.** Same as `dev:screenshot`:
per-invocation proposal + audit-log entry; tool body is not persisted. The
default-off + warning copy applies.

**What remains the user's responsibility.** The user accepts that vault paths
and plugin-internals strings may leak via error text. Specorator does not
redact errors.

#### `dev:console` (low-risk)

**What it can access.** Returns recent renderer `console.log` output. Like
`dev:errors` but broader — includes plugin-emitted diagnostics, including any
plugin that happens to log frontmatter or note contents to console.

**Abuse vector.** Same shape as `dev:errors` with larger surface area. Some
popular plugins log search results, dataview row counts, or LLM-completion
text to console.

**Mitigation provided by this feature.** Same as the other low-risk tools.
The user-facing copy for the DevTools toggle must explicitly name `dev:console`
as the highest-leakage of the three so the master toggle is not enabled
lightly.

**What remains the user's responsibility.** The user accepts that any
plugin-emitted log line may be exposed. Choosing which plugins to run is a
pre-existing trust decision; this tool exposes the *output* of those
decisions.

#### `dev:dom` (high-risk)

**What it can access.** Reads the rendered DOM of the active webContents by
selector. This includes the full text of every open note, every property in
every open frontmatter, the text of any open canvas card, and the text of any
open Obsidian modal (including the command palette and any plugin-rendered
settings UI).

**Abuse vector.** `dev:dom` is the *non-screenshot* version of total renderer
read access. It does not need the user's screen to be facing the camera; it
reads structured text directly. A single `dev:dom` call against a vault with
the user's `.env`-like note open exfiltrates everything in that note.

**Mitigation provided by this feature.** Per-tool opt-in (`dev:dom` toggle
separate from the master DevTools toggle). The settings UI for this toggle
must render a red-bordered warning naming this specific risk. Per-invocation
proposal + audit-log entry. Critically, `dev:dom` is also subject to the
**non-auto-accept default** — even when the master DevTools toggle has
auto-accept on for the low-risk three, `dev:dom` always prompts.

**What remains the user's responsibility.** The user accepts that any text
currently rendered in any pane may leave the machine on a single tool call.
The user is responsible for closing sensitive notes before enabling this tool.

#### `dev:cdp` (high-risk)

**What it can access.** Chrome DevTools Protocol — `Runtime.evaluate`
(arbitrary JS in the renderer), `Network.getCookies` (any cookies the user's
Electron session holds), `Page.captureScreenshot`, `Page.navigate`,
`Storage.*`. Per `critique.md` §1 row 2: "Chrome DevTools Protocol =
`Runtime.evaluate` = `eval` by another name."

**Abuse vector.** Total compromise. A `dev:cdp` call with `Runtime.evaluate`
can do anything any in-renderer plugin could do — read every file the Obsidian
process can read, write every file it can write, exfiltrate to any URL via
`fetch`. CORS does not apply to CDP per `critique.md` §4. If the user has
previously logged into any service in an Obsidian webviewer pane,
`Network.getCookies` reads those cookies.

**Mitigation provided by this feature.** Per-tool opt-in with the loudest
possible warning. Always-prompt (no auto-accept option exposed). Audit-log
entry on every invocation. The settings copy must state that enabling this is
functionally equivalent to giving the agent shell access to the Obsidian
process. Recommendation for ADR-019: surface a one-line confirmation modal
when the toggle is flipped on, separate from the per-invocation accept (i.e.,
two human actions to ever fire `dev:cdp`: enable the tool, then accept the
proposal).

**What remains the user's responsibility.** The user accepts that with
`dev:cdp` enabled, the agent has equivalent privilege to a fully trusted
Obsidian plugin author. The only reason this tool is not "permanently denied"
alongside `eval` (`critique.md` §1 row 1) is the user's explicit request in
CLAR-MHP-004.

#### `dev:debug` (high-risk)

**What it can access.** Enables debug-mode flags on the Electron renderer;
typically exposes timing data, internal state dumps, and verbose-mode
`console.log` from Obsidian itself (which can include note content during
indexing).

**Abuse vector.** Lower direct blast radius than `dev:cdp`, but enabling debug
mode often turns on additional logging that other tools (`dev:console`,
`dev:errors`) then read more of. Functions as a **force multiplier** for the
low-risk tier.

**Mitigation provided by this feature.** Per-tool opt-in with warning;
per-invocation proposal; audit-log entry. Settings copy must explain the
force-multiplier dynamic — enabling `dev:debug` makes the low-risk three more
leaky.

**What remains the user's responsibility.** The user accepts the
force-multiplier dynamic and is responsible for not enabling `dev:debug`
simultaneously with auto-accept on the low-risk tier unless the threat model
is acceptable in that combination.

#### `dev:mobile` (high-risk)

**What it can access.** Toggles mobile-device emulation in the renderer (touch
events, narrower viewport, mobile user-agent). Does not directly read or write
vault state.

**Abuse vector.** Indirect. A malicious agent can force mobile emulation,
which causes some plugins to render differently and may expose mobile-only UI
affordances that bypass desktop assumptions. Lowest of the high-risk five but
listed because it changes the renderer in ways the user may not visually
notice (the chat sidebar may not reflect the emulation state).

**Mitigation provided by this feature.** Per-tool opt-in; per-invocation
proposal; audit-log entry. Settings copy should note that the emulation change
is visible in the main pane but may not be obvious in the sidebar.

**What remains the user's responsibility.** The user accepts that enabling
this allows the agent to manipulate the renderer's emulation state. The user
should disable when not actively using mobile-debugging workflows.

#### `devtools` (high-risk)

**What it can access.** Opens the Electron DevTools panel (the full Chrome
DevTools UI) docked or undocked from the Obsidian window. Once open, a
co-located malicious process or even a screen-watching attacker has full
access to DevTools' Console / Elements / Sources / Network / Application tabs
against the renderer.

**Abuse vector.** Opens a UI surface that an attacker who has *any* other
foothold on the machine can drive — including a different user's process on a
shared workstation. Unlike `dev:cdp`, which lets the agent itself do harm,
`devtools` lets *anyone with screen access* do harm. Also classically the
surface other attackers use post-foothold.

**Mitigation provided by this feature.** Per-tool opt-in; per-invocation
proposal; audit-log entry. Settings copy must state that opening DevTools
means anyone who can see the user's screen can read everything DevTools can
read. Auto-accept is not exposed.

**What remains the user's responsibility.** The user accepts that this tool's
threat model includes co-located humans, not just co-located processes.
Single-user remote workstations are different from shared-machine and
coworking environments.

## Considered options

### Option A — Permanently deny all eight DevTools tools (SYNTHESIS recommendation)

The discovery synthesis's headline recommendation was to permanently deny the
eight DevTools commands alongside `eval`. This is the safest posture and the
narrowest attack surface.

- Pros: zero opt-in burden; zero way to misconfigure; closes the entire
  DevTools exfiltration surface.
- Cons: the user explicitly requested these tools (CLAR-MHP-004) for legitimate
  workflows (mobile-emulation testing, DOM inspection during plugin
  development, screenshot for documentation pipelines). Denying outright would
  push users to disable Specorator and run a less-governed alternative.

### Option B — Single master toggle for all eight (no per-tool gating)

Treat the DevTools surface as one trust decision: master on, all eight
register; master off, none register.

- Pros: simpler matrix; one toggle.
- Cons: collapses the threat-model distinction between `dev:screenshot` (one
  screen at a time) and `dev:cdp` (renderer shell). Users who want screenshot
  must accept CDP. Violates the principle that the consent surface should
  match the blast radius.

### Option C — Tier policy + permanent deny-list + per-tool opt-in matrix (chosen)

Three explicit layers: tier governs whether the tool can register at all in
principle; the permanent deny-list takes specific commands off the table
irreversibly; the DevTools matrix surfaces a master toggle for the low-risk
three plus per-tool toggles + confirm modal for the high-risk five. Auto-accept
for the low-risk three is a separate setting (`devtoolsAutoAcceptLowRisk`,
CLAR-MHP-010) gated by the master toggle.

- Pros: consent surface matches blast radius; user can adopt the low-risk
  tools without the high-risk ones; the deny-list closes the truly
  irrecoverable surfaces; tier policy makes future Tier-B specs trivially
  additive.
- Cons: more settings rows; the user must understand the master/per-tool
  distinction. Mitigated by the settings tab structure and the verbatim
  threat-paragraph confirm modal (`DESIGN-MHP-001` §S07).

## Consequences

### Positive

- **The threat model is irreversibly recorded.** Every future contributor
  reading ADR-019 sees the paragraphs the user accepted when enabling each
  tool. Drift between the consent surface and the threat model is
  prevented by sourcing both from one TS constant (per architect hand-off in
  `DESIGN-MHP-001` Part B).
- **The deny-list is a unit-testable invariant.** REQ-MHP-014 and REQ-MHP-015
  assert it by name; any future contributor who adds a tool that proxies a
  denied command fails the test.
- **The DevTools surface is opt-in by construction.** Default settings ship
  with the master toggle off; the worst-case posture (an attacker who steals
  the user's vault) does not also steal pre-enabled DevTools.
- **Tier-B follow-up specs inherit a stable policy.** A future write tool
  drops into the Risky-write tier without amending this ADR; the auto-accept
  carve-out and the deny-list both extend without policy debate.

### Negative

- **The user must hold the master/per-tool distinction in their head.** The
  settings tab and confirm modal mitigate this but cannot eliminate it.
- **Removing a deny-list entry requires a superseding ADR.** This is the
  intended cost of irreversibility but is friction for legitimate future
  additions (e.g., a sandboxed `eval` replacement).
- **The threat paragraphs duplicate research.md text.** Lock-step maintenance
  is a documented obligation; CI does not assert it. A drift-guard unit test
  (`SystemPromptAddendumProvider`-style, see `DESIGN-MHP-001` Part C) covers
  the user-facing copy in the confirm modal but not the ADR body. Acceptable:
  ADR bodies are immutable post-acceptance, so divergence can only originate
  in research.md drift; review-gate covers that.

### Neutral

- **The matrix's auto-accept exposure pattern (`devtoolsAutoAcceptLowRisk`)
  follows the active-feature-append carve-out shape.** Both are a single
  scoped exception to a "queue everything" baseline. Consistency reduces the
  cognitive surface but means a future request to add more scoped exceptions
  inherits this shape.

## Compliance

- **Unit test (deny-list):** asserts every name in Part 2 is absent from
  `tools/list` AND is rejected by `obsidian_cli_read_command` with MCP error
  `not_allowed`. Wired in CI; release-criteria gate (REQ-MHP-014,
  REQ-MHP-015).
- **Unit test (DevTools matrix):** asserts each row of the Part 3 table —
  registration is gated by the documented settings combination, every
  invocation produces an audit row, `dev:cdp` always queues `pending` even
  with `devtoolsAutoAcceptLowRisk = true`, result payloads do not appear in
  the audit log (REQ-MHP-016..021).
- **Drift-guard (confirm-modal threat copy):** unit test asserts the strings
  rendered by `DevToolsEnableConfirmModal` for each high-risk tool are
  byte-equal to the constants exported by the threat-paragraph TS module.
  When the constants change, ADR-019 Part 4 must be updated in the same PR
  (review-gate; not CI-enforced for the ADR body itself per the immutability
  rule).
- **Settings tab structure:** UI tests assert the rendered settings tab
  matches `DESIGN-MHP-001` Part A §F5 step ordering (master → per-tool five
  → confirm modal on flip).

## References

- PRD: `specs/mcp-host-side-proposals/requirements.md` (REQ-MHP-014..021,
  REQ-MHP-009/-010, plus REQs added in stage 4 per CLAR-MHP-007/-009/-010/-011/-013/-017).
- Research: `specs/mcp-host-side-proposals/research.md` §Q3 (verbatim source of
  Part 4 threat paragraphs), §Q1 (tier policy), §Q4 (audit-log shape).
- Design: `specs/mcp-host-side-proposals/design.md` Parts A §F5, B §S07–S09,
  C §"Components and responsibilities" (`DevToolsToolRegistrar`).
- Discovery synthesis: `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md`
  §"Permanently denied" (verbatim source of Part 2).
- Discovery critique: `discovery/obsidian-cli-mcp-expansion/critique.md` §1
  (Top-10 dangerous), §4 (exfiltration kit).
- Prior ADRs: ADR-013 (MCP server + proposal store), ADR-018 (CLI-backed
  tools + read-only allow-list).
- CLARs: CLAR-MHP-004 (DevTools opt-in user override), CLAR-MHP-010
  (`devtoolsAutoAcceptLowRisk`).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new
> ADR; only the predecessor's `status` and `superseded-by` pointer fields may
> be updated.
