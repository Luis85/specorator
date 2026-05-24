# Obsidian CLI MCP Expansion — Synthesis

Cross-perspective synthesis from 8 parallel research streams (code inventory, analyst, divergent-thinker, critic, ux-designer, product-strategist, game-designer, user-researcher).

Date: 2026-05-24. Author: Specorator (parent agent). Inputs:
- [research.md](research.md) — analyst
- [divergence.md](divergence.md) — divergent-thinker (14 use cases)
- [critique.md](critique.md) — critic (NO-GO on blanket expansion; 3 RATs)
- [ux.md](ux.md) — ux-designer (4 tool classes; webviewer-in-pane-never-inline)
- [strategy.md](strategy.md) — product-strategist (unfair advantage, North Star)
- [engagement.md](engagement.md) — game-designer (core-loop, MDA, SDT)
- [user-research.md](user-research.md) — user-researcher (3 hypotheses + RATs)
- inline: Explore inventory of current code surface

---

## Headline finding

**Specorator should NOT pursue a blanket "expose all 120 CLI commands as MCP tools" expansion.** Five of eight streams independently converge on the same gating constraint: the expansion is a *governance* problem (security, trust, UX fatigue, ToS), not a *coverage* problem. The competitor `cli-rest-mcp` has already attempted blanket coverage via "Code Mode" — it ships read+execute and pushes the safety problem onto the user. That's a different product.

The bet Specorator should make is **"narrow but governed broad surface"**: a tightly curated Tier-A safe-read set ships immediately, a Tier-B write set unlocks behind 3 Riskiest Assumption Tests, and a top-10 dangerous list is permanently denied — not "deferred."

## Where the perspectives converge

| Theme | Streams that agreed | Implication |
|---|---|---|
| Don't expose `eval`, `dev:cdp`, `dev:dom`, `dev:screenshot`, `devtools` | Critic, Analyst, UX-designer | Permanent deny in successor to ADR-018 |
| Don't expose `plugin:install/enable/uninstall`, `theme:install`, `snippet:install` | Critic, Analyst, User-researcher | Trust chain doesn't exist; ToS-adjacent; users in interviews will reject |
| Don't expose `sync:*`, `publish:*`, `command` (palette executor) | Critic, Analyst | Irreversible, account-bound, namespace-unstable respectively |
| Tier A safe reads are the easy win | Analyst, Divergent-thinker, Strategist | Ship now: links/backlinks/orphans/deadends/unresolved/outline/daily:read/diff/history:list/templates:list/property:read |
| Webviewer (`web`) cannot ship as a chat-embedded iframe | UX-designer, Critic | Open in Obsidian pane only; deny by default; if shipped later, fresh Electron partition + domain allowlist |
| Proposal-store needs tiering before any bulk-write tool ships | Critic, UX-designer, Game-designer, User-researcher | Batch card, auto-accept tier (scoped to `specs/<slug>/`), 10s-undo window |
| Loopback HTTP alone is not a security boundary | Critic, Analyst | Add per-session bearer token; move `.mcp.json` from vault root to `.obsidian/mcp.local.json` |
| North Star = adoption + safe approval rate, not raw tool count | Strategist, Game-designer | Metric: weekly approved tool invocations per active vault, with approval-rate guardrail |

## Where the perspectives diverge

| Question | Position A | Position B | Resolution |
|---|---|---|---|
| Tool-per-command vs "Code Mode" (search + execute) | Analyst: stay tool-per for typed proposals; add one `cli:run` escape hatch for read-only | Implicit Code Mode argument from competitor `cli-rest-mcp` | Tool-per-command, single escape hatch for unforeseen reads (regex-validated args) |
| Auto-accept threshold for `property:set` | UX: length heuristic (≤80 chars) | Critic: dry-run preview + checksum diff for ALL bulk property writes | Conservative — checksum diff always; auto-accept only when scoped to active feature folder |
| Webviewer feasibility | User: wants it; Divergent: 4 use cases need it (research, adversary, plugin-shopper, CDP UX test) | Critic: pre-built exfil kit when combined with `dev:dom`/`dev:cdp` | Possible only with fresh Electron partition + domain allowlist + no DOM/CDP companions; defer to Phase 3 |
| Telemetry | User-researcher: 5 events in `.specorator/telemetry/` JSONL | Critic: any telemetry is attack surface | Local-only, append-only, opt-in toggle defaulting on for first 30 days then off |

## Recommended phased path

### Phase 0 — Harden current state (this branch or follow-up)

- Move `.mcp.json` from vault root to `.obsidian/mcp.local.json` so it doesn't sync via Git/iCloud/Syncthing.
- Add a `.gitignore` entry shipped by the plugin for `.obsidian/mcp.local.json`.
- Generate a per-session bearer token on MCP start; embed in `.mcp.local.json`; rotate every plugin start.
- Authoring ADR-019: tiered CLI surface policy (Tier A/B/C with explicit deny-list).

### Phase 1 — Tier A safe reads (next PR)

Add these as tool-per-command, no proposal gate, no UI focus-stealing:

| Tool | CLI | What it enables |
|---|---|---|
| `obsidian_cli_backlinks` | `backlinks` | Agent can navigate inbound link graph |
| `obsidian_cli_links` | `links` | Outbound links per note |
| `obsidian_cli_unresolved` | `unresolved` | Find broken wikilinks |
| `obsidian_cli_orphans` | `orphans` | Find unconnected notes |
| `obsidian_cli_deadends` | `deadends` | Find notes with no outbound links |
| `obsidian_cli_outline` | `outline` | Heading structure per note |
| `obsidian_cli_diff` | `diff` | Local file version diff |
| `obsidian_cli_history` | `history:list` | Local history versions per file |
| `obsidian_cli_templates` | `templates` | List templates available |
| `obsidian_cli_template_read` | `template:read` | Read template source |
| `obsidian_cli_property_read` | `property:read` | Get single frontmatter property |
| `obsidian_cli_daily_read` | `daily:read` | Read today's daily note (read-only variant) |

Add one escape hatch: `obsidian_cli_read_command` that proxies any *read-only* CLI command (regex-validated args).

### Phase 2 — Proposal infrastructure (prerequisite for Tier B)

Before shipping any Tier B write tool, the proposal store needs:

- Batch-proposal card (≥3 proposals collapse into a Plan card with per-row checkboxes)
- Tiered auto-accept policy (auto-accept appends inside `specs/<active>/`, all others queued)
- 10-second undo window on auto-accepted writes
- `intent` field on proposal schema (caller must supply human-readable intent before card renders Accept)
- Run **RAT-2** (proposal-fatigue / rubber-stamping test) — 5 pilot users, 20 plausible writes with 3 silently malicious

### Phase 3 — Tier B writes (after RAT green)

| Tool | Gating | Notes |
|---|---|---|
| `obsidian_cli_file_create` | Proposal, scoped to `specs/<active>/` | Auto-accept inside feature folder; queued elsewhere |
| `obsidian_cli_file_rename` | Proposal | Update links automatically (CLI does this) |
| `obsidian_cli_property_set` | Proposal with diff | Show old → new |
| `obsidian_cli_property_remove` | Proposal | |
| `obsidian_cli_daily_append` | Proposal | |
| `obsidian_cli_daily_prepend` | Proposal | |
| `obsidian_cli_history_restore` | Proposal with full diff | |
| `obsidian_cli_template_insert` | Proposal | |
| `obsidian_cli_task_toggle` | Auto-accept (low stakes) | Single-line write; log only |

### Phase 4 — Webviewer (after RAT-1 + fresh-partition POC)

- Build a separate `webviewer` Electron partition (no shared cookies/storage)
- Domain allowlist in settings (user adds approved domains)
- Tool: `obsidian_cli_web_open` opens URL in a side pane — never inline iframe in chat
- Companion: `obsidian_cli_web_dom_query` reads DOM by selector — but only from the fresh-partition pane, never the user's main session
- No `dev:cdp` exposure ever

### Permanently denied

The Top 10 from the critic, refactored into ADR-019:

`eval`, `dev:cdp`, `dev:dom`, `dev:screenshot`, `dev:console`, `dev:errors`, `dev:debug`, `dev:mobile`, `devtools`, `plugin:install`, `plugin:uninstall`, `plugin:enable`, `plugin:disable`, `plugin:reload`, `plugins:restrict`, `theme:install`, `theme:uninstall`, `theme:set`, `snippet:enable`, `snippet:disable`, `sync` (on/off), `publish:add`, `publish:remove`, `publish:open`, `command` (palette executor), `restart`, `reload`, `vault:open`, `workspace:load`, `tab:open`, `delete` (file).

## Riskiest assumptions to test before Phase 2

(From the critic, verbatim — these gate Phase 2/3 work.)

1. **RAT-1** — "Loopback is a security boundary." Falsified by demonstrating a co-located process can hit `/tools/list` and call a write tool without credentials.
2. **RAT-2** — "Users will read proposals before approving." Falsified if ≥1 of 5 pilot users approves a silently malicious proposal in a 20-proposal session.
3. **RAT-3** — "A curated allow-list of palette commands is stable." Falsified if installing top-10 community plugins adds >20% destructive-verb command IDs.

## What this means for the user's original question

**On the webviewer specifically:** the obvious "open URL + agent reads" pattern is the single highest-risk new surface in the entire CLI. It's tractable but expensive — Phase 4 work, gated on fresh-partition POC and domain allowlist. Don't ship it in the next PR.

**On "more powerful use cases" generally:** the biggest unlock isn't more tools, it's **better proposals** (Phase 2). Today every write costs the same one click; the system has no notion of risk tier or batch. Fix that and the Tier B surface naturally opens up safely.

**Next concrete action:** open Phase 0 PR (move `.mcp.json` to `.obsidian/`, add bearer token, write ADR-019). Phase 1 follows in a clean PR.
