# User Research Brief — Obsidian-CLI MCP Expansion

Author: specorator:user-researcher (parallel research dispatch, 2026-05-24)

**Sprint:** `obsidian-cli-mcp-expansion`
**Phase:** Frame (Discovery, Phase 1)
**Status:** `assumed — to be validated` (no live switch interviews run; questions and hypotheses are prep artifacts, not synthesis of real data)

## 1. JTBD switch-interview brief — Focused Builder

Six open prompts for a 45-minute switch interview. Ask, then shut up. Follow with "tell me more about that" or "walk me through the last time."

1. **Struggling Moment.** "Take me back to the last time your agent did something to your vault that you wished it hadn't — or refused to do something obvious. What were you trying to get done, and what happened?"
2. **First Thought.** "When did you first think 'I need an agent that can actually drive Obsidian for me'? What were you doing in the 24 hours before that thought?"
3. **Push of the old way.** "What's the most annoying part of your current workflow when you're shifting between thinking and doing inside the vault? What have you tried so far to fix it?"
4. **Pull of the new.** "If an agent could fluently run any Obsidian command on your vault, what's the *first* thing you'd ask it to do — not the impressive thing, the boring everyday thing?"
5. **Anxiety.** "What would have to be true before you'd let an agent run, say, a bulk rename or a graph rewrite without watching it? What's the worst plausible thing that could happen?"
6. **Habit.** "What's the part of your current vault routine you'd never give up, even if an agent could do it for you? Why?"

Recruit 5–8 Focused Builders, 2–3 from each secondary persona. Capture verbatim with timestamps.

## 2. Three falsifiable hypotheses

- **H1 (Surface adoption).** We believe the **Focused Builder** will **invoke ≥ 3 distinct MCP write commands within their first session** when **offered a palette of CLI-equivalent tools alongside their existing chat**, leading to **≥ 60% of pilot users issuing a multi-tool turn within day 1**.
- **H2 (Proposal-gate friction).** We believe the **PKM Tinkerer** will **disable or bypass the proposal gate for read-mostly commands within 10 invocations** when **the gate fires on low-risk operations (search, list, get-metadata)**, leading to **a measurable bypass-request rate > 30% in week 1**.
- **H3 (Trust ceiling).** We believe the **Solo Consultant** will **decline to run any bulk-write command on a client vault** when **the agent cannot preview a structured diff before commit**, leading to **0 bulk-write executions on real client vaults without diff preview, even when offered**.

Each is testable in < 1 day: H1 via instrumented pilot, H2 via in-product survey + event count, H3 via 5-user moderated session with a real (or sanitised) client vault.

## 3. Riskiest Assumption Tests

- **H1 RAT — Fake-door palette.** Ship a static `/tools` command listing 30 hypothetical MCP tools as click-through stubs that respond "coming soon" and log intent. 5 users, 30 minutes each. Disconfirmed if median user clicks < 3 distinct tools.
- **H2 RAT — Wizard-of-Oz gate tier.** Manually classify commands as "auto" vs "gated" for 5 PKM Tinkerers over a 2-hour scripted session. Disconfirmed if no participant asks to lower the gate for reads.
- **H3 RAT — Diff-preview prototype.** Paper-prototype two flows (with diff / without). 5 Solo Consultants, think-aloud. Disconfirmed if any participant commits the no-diff bulk write without hesitation on a vault they'd treat as real.

## 4. Behavioural metrics (local-only, no PII, vault-scoped)

| Event | Fires when | Dimensions |
|---|---|---|
| `mcp.tool.invoked` | Agent calls any MCP tool | tool_name, read_or_write, gated (bool), latency_ms |
| `mcp.proposal.decision` | User accepts/rejects a write proposal | tool_name, decision (accept/reject/edit), time_to_decision_ms |
| `mcp.tool.failed` | Tool returns error or timeout | tool_name, error_class, retry_count |
| `mcp.session.composition` | Per chat turn, on turn end | tool_count, unique_tools, read_write_ratio |
| `mcp.surface.discovered` | User opens tool palette / `/tools` | entry_point, tools_visible, tools_clicked |

All events stored in vault under `.specorator/telemetry/` as append-only JSONL. No network egress.

## 5. Three user types most likely to reject expansion

1. **Vault Purist (subset of Focused Builder).** Objection: "I don't want anything writing to my notes that I didn't type." Change-mind: dry-run mode that emits a patch file they review in their own diff tool — never auto-applies.
2. **Plugin-Wary Researcher.** Objection: "Every plugin I add is a future migration tax; 120 tools is 120 surfaces that can break my citation graph." Change-mind: opt-in tool groups (citations off by default), explicit semver compatibility statement per tool, and a one-click "disable all writes" panic switch.
3. **Engineering Manager on shared/team vault.** Objection: "I can't justify an agent that could mutate a vault other people depend on without an audit trail." Change-mind: per-tool audit log committed to git, role-scoped allowlist in `PluginSettings`, and a role-only "read-only mode" for vaults flagged `shared: true`.

**Note:** All 5 sections are prep artifacts, not synthesis of real participants. Before this brief informs `frame.md`, the facilitator must either commission the 5–8 switch interviews or mark the entire section `assumed — to be validated` in the strategist's framing.
