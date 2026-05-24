---
id: PARITY-RR-001
title: Rich rendering (P2) — parity-screenshot matrix
stage: implementation
feature: rich-rendering
area: RR
epic: claudian-reboot
phase: P2
status: deferred         # baseline column scaffolded pre-impl; Specorator column + capture deferred to #434 / /spec:review (human-signed)
owner: dev
baseline-reference: D:\Projects\claudian-main
created: 2026-05-24
updated: 2026-05-24
---

# Parity-screenshot matrix — Rich rendering (P2)

> **T-RR-001 (baseline-capture):** mirrors P1's doc-only T-CC-001. The baseline column references
> `claudian-main` (`D:\Projects\claudian-main`, MIT, read-only). The **Specorator column** is
> captured and human-signed at `/spec:review` (charter §5, NFR-RR-011/012). This file scaffolds the
> per-renderer × 3 (width) × 2 (theme) matrix so the rich-render baseline reference is recorded
> before P2 implementation lands and the reference becomes irrecoverable once the surfaces are built.
> The matrix is coordinated with the carry-over parity issue **#434** (P1 + P2 capture).

Widths: **320 / 520 / 720 px**. Themes: **light / dark**. Per-renderer states (charter §3.1 / §4 P2):

| Renderer | Baseline state captured |
|---|---|
| tool-call header | collapsed header — per-tool icon + mono name + filename summary + end-pinned status |
| tool-call expanded | expanded body — escaped monospace input/result, pre-wrapped |
| thinking (live) | brand-coloured italic `"Thinking Ns…"` with pulse, incrementing |
| thinking (finalised) | frozen `"Thought for Ns"`, auto-collapsed |
| todo list | rows: pending dot, in-progress gerund + active colour, completed check + done colour |
| write/edit + word-diff | insert wash + `+` gutter, delete wash + `−` gutter, equal muted, `+N`/`-N` chip |
| subagent block | collapsible prompt/result/tools; nested tools; async status pill (ladder) |
| usage info | token counts + context-window percentage |

## Baseline source (claudian-main)

- Reference repo: `D:\Projects\claudian-main` (commit at capture time recorded below).
- Surfaces (renderers): `ToolCallRenderer` + `toolIcons`/`toolNames`/`toolInput`/`toolResultContent`
  (`toolcalls.css`); `ThinkingBlockRenderer` (`thinking.css`, `thinking-pulse`); `TodoListRenderer`
  + `todoUtils` (`todo.css`); `WriteEditRenderer` + `DiffRenderer` (`diff.css`); `SubagentRenderer`
  + `subagentLifecycleResolution` (`subagent.css`); `usageInfo` / `ContextUsageMeter`.
- Baseline column = the current Claudian rich-render behaviour for each renderer. Captured into the
  tables below by the human at review (or earlier if a baseline drive is run); this scaffold records
  the reference path + the cell grid so the comparison is anchored.

## Matrix

Legend per cell: `baseline → specorator` (filled at review). `—` = not yet captured.

### 320 px

| Renderer | Light (baseline → sp) | Dark (baseline → sp) |
|---|---|---|
| tool-call header | claudian-main · — | claudian-main · — |
| tool-call expanded | claudian-main · — | claudian-main · — |
| thinking (live) | claudian-main · — | claudian-main · — |
| thinking (finalised) | claudian-main · — | claudian-main · — |
| todo list | claudian-main · — | claudian-main · — |
| write/edit + word-diff | claudian-main · — | claudian-main · — |
| subagent block | claudian-main · — | claudian-main · — |
| usage info | claudian-main · — | claudian-main · — |

### 520 px

| Renderer | Light (baseline → sp) | Dark (baseline → sp) |
|---|---|---|
| tool-call header | claudian-main · — | claudian-main · — |
| tool-call expanded | claudian-main · — | claudian-main · — |
| thinking (live) | claudian-main · — | claudian-main · — |
| thinking (finalised) | claudian-main · — | claudian-main · — |
| todo list | claudian-main · — | claudian-main · — |
| write/edit + word-diff | claudian-main · — | claudian-main · — |
| subagent block | claudian-main · — | claudian-main · — |
| usage info | claudian-main · — | claudian-main · — |

### 720 px

| Renderer | Light (baseline → sp) | Dark (baseline → sp) |
|---|---|---|
| tool-call header | claudian-main · — | claudian-main · — |
| tool-call expanded | claudian-main · — | claudian-main · — |
| thinking (live) | claudian-main · — | claudian-main · — |
| thinking (finalised) | claudian-main · — | claudian-main · — |
| todo list | claudian-main · — | claudian-main · — |
| write/edit + word-diff | claudian-main · — | claudian-main · — |
| subagent block | claudian-main · — | claudian-main · — |
| usage info | claudian-main · — | claudian-main · — |

## Capture procedure (human — charter §5, NFR-RR-011/012, #434)

The P2 build is deployed to `D:\TestVault\.obsidian\plugins\specorator` (hot-reload wired). To fill
the Specorator column:

1. **Drive every renderer.** `npm run dev` (MockChatRuntime) and the demo (FixtureChatRuntime) emit
   a scripted rich turn — tool call + Write/Edit diff + todo list + subagent + usage (SPEC-RR-013) —
   so each renderer is reachable headlessly; in Obsidian, send a real `claude` prompt that exercises
   Read/Write/Edit/TodoWrite/Task + thinking to reach the live states.
2. **Width.** Drag the sidebar to 320, then 520, then 720 px (panel content width).
3. **Theme.** Toggle Settings → Appearance → light / dark for each row.
4. **Reach each renderer state** per the table above (collapsed + expanded tool call; live vs frozen
   thinking; the three todo statuses; insert/delete/equal diff with the stat chip; sync + async
   subagent with the pill ladder pending→running→completed/error/orphaned; usage tokens + %).
5. **Compare** each cell against the same renderer in `claudian-main` (side-by-side or reference
   screenshots). Judge **perceptual** parity (layout, rhythm, token-driven colour, the 2px rail,
   diff washes, async pill colours), not pixel-exactness (charter §5; identity stays Specorator).
6. Drop the captures under `specs/rich-rendering/` (or link them) and flip each cell `—` → ✓ / note
   the divergence. Set this file's `status: complete` when the grid is filled + signed.

## Incremental-render qualitative baseline (NFR-RR-014)

> Recorded here and mirrored into `test-plan.md` (the canonical Stage 6/8 sink), linked to #434.

The Claudian baseline renders rich blocks **incrementally** as their chunks arrive — there is no
batch-on-complete. The live **thinking timer** ticks each second (`"Thinking Ns…"`) while the block
is open and freezes to `"Thought for Ns"` on finalise; **tool-call status** updates running →
completed/error in place as `tool_result` arrives; the **todo list** and **diff** appear the moment
their `tool_result` lands; the **async subagent pill** advances through its lifecycle ladder during
the turn. Large diffs/results cap their DOM (`--sp-diff-max-height` + `NEW_FILE_DISPLAY_CAP` = 20,
`--sp-subagent-result-max-height`) so there is no jank on big payloads. P2 must match this
perceptual feel against the captured baseline; the sign-off is a human judgement at review (no
numeric latency target — steering docs unpopulated).
