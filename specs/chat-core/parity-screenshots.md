---
id: PARITY-CC-001
title: Chat core (P1) — parity-screenshot matrix
stage: implementation
feature: chat-core
area: CC
epic: claudian-reboot
phase: P1
status: in-progress      # baseline column scaffolded T-CC-001; Specorator column captured at /spec:review
owner: dev
baseline-reference: D:\Projects\claudian-main
created: 2026-05-24
updated: 2026-05-24
---

# Parity-screenshot matrix — Chat core (P1)

> **T-CC-001 (baseline-capture):** the baseline column references `claudian-main`
> (`D:\Projects\claudian-main`, MIT, read-only). The **Specorator column** is captured and
> human-signed at `/spec:review` (charter §5, NFR-CC-011..013, T-CC-032). This file scaffolds the
> 3 (width) × 2 (theme) × 5 (state) matrix so the baseline reference is recorded before P1
> implementation lands and the reference becomes irrecoverable once the surfaces are rebuilt.

Widths: **320 / 520 / 720 px**. Themes: **light / dark**. States:
**empty / idle / streaming / error / interrupt**.

The five P1 surface states map to the §6 state machine (`spec.md`): `empty` = `WelcomeGreeting`
visible (`isEmpty`); `idle` = at-rest composer + message list; `streaming` = live assistant
message growing + busy indicator; `error` = inline error chunk rendered (`errorActive`);
`interrupt` = cancelled live message with the Interrupted badge.

## Baseline source (claudian-main)

- Reference repo: `D:\Projects\claudian-main` (commit at capture time recorded below).
- Surfaces: message stream (`messages.css`), send-composer (`input.css`), the welcome state
  (`.claudian-welcome`), inline error (`StreamController.ts:194`), interrupted badge
  (`.claudian-interrupted`).
- Baseline column = the current Claudian behaviour for each cell. Captured into the table below by
  the human at review (or earlier if a baseline screenshot drive is run); this scaffold records the
  reference path + the cell grid so the comparison is anchored.

## Matrix

Legend per cell: `baseline → specorator` (filled at review). `—` = not yet captured.

### 320 px

| State | Light (baseline → sp) | Dark (baseline → sp) |
|---|---|---|
| empty | claudian-main · — | claudian-main · — |
| idle | claudian-main · — | claudian-main · — |
| streaming | claudian-main · — | claudian-main · — |
| error | claudian-main · — | claudian-main · — |
| interrupt | claudian-main · — | claudian-main · — |

### 520 px

| State | Light (baseline → sp) | Dark (baseline → sp) |
|---|---|---|
| empty | claudian-main · — | claudian-main · — |
| idle | claudian-main · — | claudian-main · — |
| streaming | claudian-main · — | claudian-main · — |
| error | claudian-main · — | claudian-main · — |
| interrupt | claudian-main · — | claudian-main · — |

### 720 px

| State | Light (baseline → sp) | Dark (baseline → sp) |
|---|---|---|
| empty | claudian-main · — | claudian-main · — |
| idle | claudian-main · — | claudian-main · — |
| streaming | claudian-main · — | claudian-main · — |
| error | claudian-main · — | claudian-main · — |
| interrupt | claudian-main · — | claudian-main · — |

## Capture procedure (human — TEST-CC-031 + charter §5)

The P1 build is deployed to `D:\TestVault\.obsidian\plugins\specorator` (hot-reload wired). To
fill the Specorator column:

1. **Open the surface.** Reload Obsidian on `D:/TestVault`, open the Specorator agent sidebar
   (ribbon / command palette → "Specorator").
2. **Width.** Drag the sidebar / window to 320, then 520, then 720 px (the panel is responsive;
   width = the panel's content width, not the whole window). Obsidian's zoom can normalise DPI.
3. **Theme.** Toggle Settings → Appearance → light / dark for each row.
4. **Reach each state:**
   - `empty` — fresh panel, no messages → `WelcomeGreeting` (serif greeting) visible.
   - `idle` — after one completed turn (send "hi", let it finish) → composer at rest + message list.
   - `streaming` — mid-reply: send a prompt that yields a longer answer, capture while text grows +
     the busy indicator shows (aria-live polite).
   - `error` — trigger a runtime error (e.g. send while the `claude` CLI is unavailable / logged
     out) → inline error chunk rendered in the turn.
   - `interrupt` — start a long reply, press `Esc` (or the stop control) mid-stream → partial
     message with the Interrupted badge.
5. **Compare** each cell against the same state in `claudian-main` (run it side-by-side, or use the
   reference screenshots). Judge **perceptual** parity (layout, rhythm, token-driven colour), not
   pixel-exactness (charter §5; identity stays Specorator).
6. Drop the captures under `specs/chat-core/` (or link them) and flip each cell `—` → ✓ / note the
   divergence. Set this file's `status: complete` when the grid is filled + signed.

**No-secret check (TEST-CC-031, NFR-CC-006 / NG10):** before and after a real chat turn, inspect
`D:\TestVault\.obsidian\plugins\specorator\data.json` — confirm no API key / token / session
secret is written. (Static evidence: `src/` has zero `secretStorage` writes and no secret
persistence; the only `saveData` persists the module settings blob. The Claude CLI uses your own
`claude` login, external to the plugin.) **Heads-up:** that vault carries a *stale pre-reboot*
`data.json` (rich `specorator.*` keys + `_moduleVersions`); the reboot's settings model is
device-local `{locale, logLevel}` and ignores unknown keys (load-or-default, NG8). For the cleanest
parity pass, consider archiving that `data.json` first — it is not part of the P1 build.

## Streaming-feel qualitative baseline (NFR-CC-014)

The Claudian baseline streams the assistant reply **token-by-token**: each `text` chunk appends to
the live message and the view re-renders + auto-scrolls per chunk — there is no perceptible
batch-on-complete. Cancel (`Esc` / stop control) stops the stream responsively and marks the
partial message interrupted. P1 must match this perceptual feel against the captured baseline; the
sign-off is a human judgement at review (no numeric latency target — steering docs unpopulated).

This qualitative note is mirrored into `test-plan.md` (the canonical Stage 6/8 sink).
