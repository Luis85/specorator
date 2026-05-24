---
id: TESTPLAN-RR-001
title: Rich rendering (P2) — test plan
stage: testing
feature: rich-rendering
area: RR
epic: claudian-reboot
phase: P2
status: in-progress
owner: qa
baseline-reference: D:\Projects\claudian-main
created: 2026-05-24
updated: 2026-05-24
---

# Test plan — Rich rendering (P2)

The canonical sink the Stage 6 (testing) and Stage 8 close-out read from. Records the baseline
reference (T-RR-001), the manual-leg schedule (the Obsidian `MarkdownRenderer`/`setIcon` backing +
the real-CLI rich turn), and the parity-screenshot pointer. Automated U/A scenarios
(TEST-RR-001..027) are authored by `qa` and run in CI; the manual M legs are recorded here for the
reviewer/SRE and never self-claimed by an agent.

## Baseline reference (T-RR-001, NFR-RR-011/012/014)

- **Baseline source:** `D:\Projects\claudian-main` (MIT, read-only parity reference).
- **Parity-screenshot matrix:** `specs/rich-rendering/parity-screenshots.md` — the per-renderer ×
  3 (width) × 2 (theme) grid (320/520/720 × light/dark × {tool-call header, tool-call expanded,
  thinking live, thinking finalised, todo list, write/edit diff, subagent block, usage info}),
  baseline column anchored to claudian-main, Specorator column captured + human-signed at
  `/spec:review`. Coordinated with the carry-over parity issue **#434** (P1 + P2 capture).
- **Incremental-render qualitative baseline (NFR-RR-014):** Claudian renders rich blocks
  **incrementally** as chunks arrive — no batch-on-complete. The live thinking timer ticks each
  second (`"Thinking Ns…"`) and freezes to `"Thought for Ns"` on finalise; tool-call status updates
  running → completed/error in place; the todo list and diff appear the moment their `tool_result`
  lands; the async subagent pill advances through pending→running→completed/error/orphaned during
  the turn. Large diffs/results cap their DOM (`--sp-diff-max-height` + `NEW_FILE_DISPLAY_CAP` = 20,
  `--sp-subagent-result-max-height`) so big payloads do not jank. P2 is judged against this
  perceptual feel at review (no numeric latency threshold — steering docs unpopulated).

## Manual legs (not CI-automatable)

| Test | Owner | Trigger task | Recorded |
|---|---|---|---|
| TEST-RR-026 (M leg) — Obsidian `MarkdownRenderer`/`setIcon` backing: the production `ObsidianBridge.createMarkdownRenderPort()`/`createIconPort()` walk a **detached** fragment → the `SafeRenderResult`/`IconNode` DTO; **no DOM-injection sink reaches the UI** (NFR-RR-006); coverage-excluded infra (`src/infrastructure/obsidian/**`) | human | T-RR-043 | pending — never self-claimed; reviewer name + date here |
| TEST-RR-026 (real-CLI rich turn) — real `claude` CLI in Obsidian drives a rich turn (tool call + Write/Edit diff + todo + subagent + usage); every renderer renders declaratively; **no secret** read/persisted (source + `data.json` review) | human | T-RR-043 | pending — never self-claimed; reviewer name + date here |

> The automatable U-leg of TEST-RR-026 (Mock script + LocalStorage fixture drive every sink leg, no
> subprocess) is authored by `qa` and runs in CI (T-RR-008/010). Only the Obsidian-backing + real-CLI
> legs above are manual.

## Dev / standalone legs (CI-automatable)

| Test | Owner | Trigger task | Recorded |
|---|---|---|---|
| TEST-RR-026 (dev leg) — `src/ui/main.ts` (MockBridge) streams the default scripted rich turn (SPEC-RR-013) and the renderers reachable through `MessageBlocks` mount: thinking, tool-call, Write/Edit word-diff (header + diff lines), task list; icons resolve through the provided `ICON_PORT` as declarative SVG (no `v-html`/no `<script>` sink). | qa | T-RR-042 | **PASS — 2026-05-24** (`tests/ui/main.rr.test.ts`, headless deterministic leg). Subagent + usage VISUAL renderers not exercised by the default script's bare `subagent_*`/`async_subagent_result` chunks + current store/dispatcher wiring (`UsageInfo.vue` not yet surface-mounted); both are stored/handled and covered by the store + component unit suites — surface wire-in is out of the P2 WIRE-IN batch scope. The live-browser visual feel pairs with the human run. |
