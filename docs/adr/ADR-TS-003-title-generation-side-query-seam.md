---
id: ADR-TS-003
title: Generate conversation titles via a cold-start side-query on ChatRuntimePort, behind a GenerateTitleUseCase
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-25
accepted: 2026-05-25    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
deciders:
  - architect
consulted:
  - pm
  - analyst
informed:
  - planner
  - dev
  - qa
  - ux-ui-designer
supersedes: []
superseded-by: []
tags: [architecture, ports, auxiliary, threads-sessions, claudian-reboot, P3]
---

# ADR-TS-003 — Title generation via a cold-start side-query, behind a GenerateTitleUseCase

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-TS-004** (title-generation seam).
Unblocks `PRD-TS-001` (REQ-TS-024/025, interacting with REQ-TS-011/026).

## Context

P3 gives each conversation an **auto-generated title** (REQ-TS-024): when a conversation's first turn
completes, set a **fallback title immediately**, then request an **asynchronous AI title** that
replaces the fallback on success — **except** when the user has manually renamed the conversation, in
which case the manual title is never overwritten (REQ-TS-011/024). Title-gen status must be observable
(a spin loader while pending; on failure keep the fallback, **no** blocking error — REQ-TS-025), and
it must route through a **provider-addressed seam** (REQ-TS-026), not a hard-coded provider branch.

Claudian models this as an **auxiliary one-shot model call** distinct from the main chat turn:
`QueryBackedTitleGenerationService` (`core/auxiliary/QueryBackedTitleGenerationService.ts`) wraps an
`AuxQueryRunner` — a one-shot, cold-start wrapper over the same SDK `query()` — with a dedicated
system prompt + parser (`core/prompt/titleGeneration.ts`: `TITLE_GENERATION_SYSTEM_PROMPT`,
`buildTitleGenerationPrompt`, `parseTitleGenerationResponse`, max 50 chars, strong-verb sentence
case), an `AbortController` per conversation, and a `pending`/`success`/`failed` callback. The backend
audit's recommendation: *"no new port needed; `AuxQueryRunner` is a one-shot wrapper over `query()`."*
The frontend audit floats a dedicated `AuxModelPort` so the UI can show status without coupling to the
main stream.

ADR-CC-001's `ChatRuntimePort.query(turn, history?, options?): AsyncGenerator<StreamChunk>` already
exists; ADR-CC-001 §3 blesses growing the port additively per phase.

## Decision

### 1. Title-gen is a cold-start **side-query** over the existing `ChatRuntimePort.query` (Option A)

We will generate titles with a **one-shot, cold-start side-query** that reuses
`ChatRuntimePort.query` — **no new `AuxModelPort` in P3.** A new application use case
**`GenerateTitleUseCase`** owns the flow and returns `Result<string>`:

1. Build a one-shot prepared turn from the conversation's **first user message** using the
   title-generation system prompt + prompt builder (ported verbatim from
   `core/prompt/titleGeneration.ts` into `src/application/.../titleGeneration.ts` — pure functions:
   `buildTitleGenerationPrompt`, `parseTitleGenerationResponse`, the 50-char strong-verb rules).
2. Drive `ChatRuntimePort.query(...)` in a **cold-start / one-shot** mode (a fresh runtime instance,
   or a `forceColdStart` query option), accumulating the `text` chunks; ignore tool/thinking chunks;
   the `done` chunk terminates. The accumulated text is parsed by `parseTitleGenerationResponse`.
3. On a parsed title → `Result.ok(title)`; on empty/parse-failure or an `error` chunk →
   `Result.err(...)` (the use case maps the streaming error-as-chunk to a `Result` at its own
   boundary, per ADR-CC-001 §2 — discrete operation, `Result`-returning).
4. **No blocking error on failure** (REQ-TS-025): the caller keeps the fallback title; failure is
   logged via `LoggerPort`, never surfaced as a `NotificationPort.showError`.

Because the side-query uses a **fresh cold-start runtime/query**, it does not steer or interleave with
the tab's main streaming turn — satisfying the frontend audit's "don't couple to the main stream"
concern without a new port.

### 2. The immediate-fallback → async-AI → manual-wins flow (REQ-TS-024/011/025)

The `tabsStore` / a `RenameConversationUseCase` orchestrates, mirroring
`InputController.triggerTitleGeneration`:

- **On first-turn completion**, set `meta.title` to a **fallback immediately** (truncated first user
  message) and `meta.titleManual = false`; persist via `ProviderHistoryPort.updateMeta` (ADR-TS-001).
- Set title-gen status `pending` (drives the history-item spin loader, REQ-TS-025); run
  `GenerateTitleUseCase`.
- On `Result.ok(title)` **and** `meta.titleManual === false`: replace the title, status `success`,
  persist. If `titleManual` flipped to `true` meanwhile (the user renamed during generation), **drop**
  the AI title (manual wins, REQ-TS-024).
- On `Result.err`: status `failed`, keep the fallback (REQ-TS-025), no blocking error.
- **Manual rename (REQ-TS-011)** sets `meta.title` + `meta.titleManual = true` and persists; this
  permanently bars title-gen overwrite for that conversation.
- A per-conversation abort (mirrors `QueryBackedTitleGenerationService`'s `AbortController` per id)
  cancels an in-flight title-gen if the conversation is renamed/deleted or the tab closes.

### 3. Provider-addressed, additive, deferral noted

- Title-gen routes through `ChatRuntimePort` (provider-addressed, REQ-TS-026); no
  `if (provider === 'claude')` branch (P3 wires only Claude — REQ-TS-027).
- **Additive (REQ-TS-028):** the side-query reuses the existing `query` member. If a `forceColdStart`
  query option is needed, it is added to `ChatRuntimeQueryOptions` **optionally** (the field is already
  flagged in `ChatTurn.ts` as P2+ growth) — no rename/removal.
- **`AuxModelPort` deferral.** The same auxiliary seam will later carry **instruction-refine (P4)** and
  **inline-edit (P5)**. *If* those phases need richer auxiliary behaviour (parallel aux calls, a
  distinct model/budget, a UI-status channel independent of the main runtime), a dedicated
  **`AuxModelPort`** may be introduced **then** — additively, with the `GenerateTitleUseCase`
  re-pointed at it. P3 deliberately takes the **smallest** seam (one provider, one one-shot call) and
  records the `AuxModelPort` as a flagged P4/P5 decision, not a P3 one.

## Considered options

### Option A — Cold-start side-query over `ChatRuntimePort.query`, behind `GenerateTitleUseCase` *(chosen)*
- Pros: smallest additive surface (no new port, no new InjectionKey/composable); matches the backend
  audit verbatim ("`AuxQueryRunner` is a one-shot wrapper over `query()`"); reuses the proven streaming
  seam + the ported pure prompt/parse functions; the cold-start one-shot does not couple to the tab's
  main stream; the `Result` boundary cleanly maps the error-as-chunk to a non-blocking failure
  (REQ-TS-025); provider-addressed (REQ-TS-026).
- Cons: the use case must accumulate `text` chunks itself (trivial); a future multi-aux-call phase may
  outgrow it (mitigated: the `AuxModelPort` upgrade is additive — Decision §3).

### Option B — A dedicated `AuxModelPort` now
- Pros: the frontend audit's shape; isolates aux calls from the main runtime; room for P4/P5 from day
  one; a clean status channel.
- Cons: a whole new port + InjectionKey + composable + three bridge impls for a single P3 one-shot
  call — larger than P3 needs; premature for one provider/one call; the cold-start side-query already
  achieves stream isolation. Deferred to P4/P5 where its extra surface earns its keep (Decision §3).
  Rejected for P3.

### Option C — Reuse the tab's live main runtime for the title query
- Cons: would interleave/steer the tab's main streaming turn (or block on it); contradicts "don't
  couple to the main stream"; risks corrupting the visible conversation. Rejected.

## Consequences

### Positive
- Auto-titles with the immediate-fallback → async-AI → manual-wins behaviour and observable status
  (REQ-TS-024/025), on the smallest possible additive seam (REQ-TS-028).
- One streaming seam (`ChatRuntimePort.query`) serves both main turns and the title side-query;
  reviewers learn one contract.
- The `AuxModelPort` upgrade path is open and additive for P4/P5 — no P3 rework if/when taken.

### Negative
- A future phase that needs concurrent auxiliary calls or a distinct aux model will introduce
  `AuxModelPort` then; the `GenerateTitleUseCase` is the single re-point site (kept small to make that
  cheap).

### Neutral
- The title prompt/parse logic is ported as **pure functions** into the application layer (no Obsidian,
  no `node:*`), testable in isolation.
- The one-shot cold-start runtime is provided the same way main runtimes are (bridge
  `createChatRuntime()` factory, ADR-CC-001 §6) — no new wiring shape.

## Compliance

- A test asserts: fallback title set immediately on first-turn completion; AI title replaces it on
  success; a conversation flagged `titleManual` is never overwritten; a title-gen failure keeps the
  fallback and raises **no** `NotificationPort.showError` (REQ-TS-024/025/011).
- A review check confirms no new aux port is added in P3 and title-gen calls `ChatRuntimePort.query`
  (Decision §1), and that no `if (provider === 'claude')` branch exists in the title flow (REQ-TS-026).
- A contract check confirms `ChatRuntimePort` gains no title-specific member (title-gen reuses `query`)
  and any `ChatRuntimeQueryOptions` addition is optional/additive (REQ-TS-028).
- The ported `buildTitleGenerationPrompt`/`parseTitleGenerationResponse` carry unit tests mirroring the
  Claudian 50-char / strong-verb / quote-strip rules.

## References

- PRD-TS-001 (`specs/threads-sessions/requirements.md`) — REQ-TS-011/024/025/026/027/028,
  NFR-TS-004; CLAR-TS-004.
- `specs/threads-sessions/design.md` Part C — the `GenerateTitleUseCase` placement + status flow.
- ADR-CC-001 (`ChatRuntimePort.query` async-generator; §2 `Result` at use-case boundaries; §3 grow
  per phase), ADR-TS-001 (`ProviderHistoryPort.updateMeta` persists the title), ADR-TS-002 (the
  `tabsStore` holding `meta.title`/`titleManual`).
- ADR-004 (`Result`), ADR-008 (narrow ports — "don't add a port before its consumer earns it").
- Claudian reference: `core/auxiliary/QueryBackedTitleGenerationService.ts` (one-shot aux query,
  per-id abort, pending/success/failed callback), `core/prompt/titleGeneration.ts` (system prompt +
  prompt builder + parser, 50-char strong-verb rules), `features/chat/controllers/InputController.ts`
  (`triggerTitleGeneration`).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
