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

## Streaming-feel qualitative baseline (NFR-CC-014)

The Claudian baseline streams the assistant reply **token-by-token**: each `text` chunk appends to
the live message and the view re-renders + auto-scrolls per chunk — there is no perceptible
batch-on-complete. Cancel (`Esc` / stop control) stops the stream responsively and marks the
partial message interrupted. P1 must match this perceptual feel against the captured baseline; the
sign-off is a human judgement at review (no numeric latency target — steering docs unpopulated).

This qualitative note is mirrored into `test-plan.md` (the canonical Stage 6/8 sink).
