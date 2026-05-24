---
id: TESTPLAN-CC-001
title: Chat core (P1) — test plan
stage: testing
feature: chat-core
area: CC
epic: claudian-reboot
phase: P1
status: in-progress
owner: qa
baseline-reference: D:\Projects\claudian-main
created: 2026-05-24
updated: 2026-05-24
---

# Test plan — Chat core (P1)

The canonical sink the Stage 6 (testing) and Stage 8 close-out read from. Records the baseline
reference (T-CC-001), the manual-leg schedule (TEST-CC-016 `npm run dev` smoke, TEST-CC-017 real
CLI), and the parity-screenshot pointer. Automated U/A scenarios (TEST-CC-001..016) are authored
by `qa` and run in CI; the manual M legs are recorded here for the reviewer/SRE.

## Baseline reference (T-CC-001, NFR-CC-011/013/014)

- **Baseline source:** `D:\Projects\claudian-main` (MIT, read-only parity reference).
- **Parity-screenshot matrix:** `specs/chat-core/parity-screenshots.md` — the 3×2×5 grid
  (320/520/720 × light/dark × empty/idle/streaming/error/interrupt), baseline column anchored to
  claudian-main, Specorator column captured + human-signed at `/spec:review` (T-CC-032).
- **Streaming-feel qualitative baseline (NFR-CC-014):** Claudian streams the assistant reply
  token-by-token — each `text` chunk appends to the live message with per-chunk re-render +
  auto-scroll; no batch-on-complete; cancel stops responsively and marks the partial interrupted.
  P1 is judged against this perceptual feel at review (no numeric latency threshold).

## Manual legs (not CI-automatable)

| Test | Owner | Trigger task | Recorded |
|---|---|---|---|
| TEST-CC-016 (M leg) — `npm run dev` standalone smoke; mock streams `text…done` token-by-token, finalises to idle | qa | T-CC-030 | pending — record pass/fail + date here |
| TEST-CC-017 — real `claude` CLI in Obsidian; NDJSON → `StreamChunk`s; **no secret** read/persisted (source + `data.json` review) | human | T-CC-031 | pending — never self-claimed; reviewer name + date here |

`ClaudeCliChatRuntime` is coverage-excluded infra (`src/infrastructure/obsidian/**`); TEST-CC-017
is its sole behavioural gate.

## Automated scenario index (authored at Stage 6 by qa)

See `spec.md` §9 for the full TEST-CC-001..017 table (REQ links + Claudian cites). U = unit,
A = component (mounted Vue + PageObject, data-testid), M = manual. 15 automatable (U/A), 2 with a
manual leg.
