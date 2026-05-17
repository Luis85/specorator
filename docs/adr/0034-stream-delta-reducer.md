---
id: ADR-0034
title: Introduce StreamDeltaReducer as the codec seam between Claude transport adapters and the chat store
status: accepted
date: 2026-05-17
deciders:
  - Engineering
consulted: []
informed: []
supersedes: []
superseded-by: []
tags: [infrastructure, application, chat, streaming]
---

# ADR-0034 — Introduce `StreamDeltaReducer` as the codec seam between Claude transport adapters and the chat store

## Status

Accepted

## Context

Both production `ClaudeCliPort` implementations independently translate wire-level Anthropic events into our domain `StreamDelta` discriminated union:

- `ClaudeCliAdapter` (`src/infrastructure/obsidian/ClaudeCliAdapter.ts`) consumes the in-process `@anthropic-ai/claude-agent-sdk` async iterator and pattern-matches on `system`/`stream_event`/`result` SDK messages.
- `ClaudeSubprocessAdapter` (`src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts`) consumes NDJSON lines from a spawned `claude` subprocess and pattern-matches on `system/init`, `assistant/message`, `system`, `stream_event`, and `result` envelopes.

Before this ADR, the translation lived in roughly 250 LOC across nine private methods inside the SDK adapter and another ~400 LOC across thirteen private methods inside the subprocess adapter. The two implementations shared no code, but had to share invariants:

- **Per-message `messageSeq` namespacing for blockIds** (Codex P1 PR #378). Anthropic's `content_block_*` indices restart at 0 on every `message_start`; without a per-message namespace, multi-step tool loops in one stream produced colliding `blockId`s and downstream accumulators (keyed on `blockId`) merged deltas into the wrong entry. The fix had to ship in both adapters, with two PRs.
- **Partial-usage merge** (Codex P2 PR #386). `message_delta.usage` frames typically include only the field(s) that changed; missing fields are "unchanged", NOT zero. Both adapters previously zero-filled, overwriting prior `input_tokens` with 0. Same fix, two PRs.
- **Single-fire `session-id`** (REQ-ASM-031). At most one `session-id` delta per stream regardless of how many `system/init` events the wire emits. Enforced independently in each adapter; documented but easy to break.
- **Subprocess transport double-pushes text** (Performance review F-2, mirrors Claudian PR #510). The subprocess adapter's `_handleNdjsonLine` dispatched BOTH `_handleAssistantMessage` (whole-message text) AND `_handleStreamEvent` `text_delta` (per-token text). The chat store's `appendStreamingDelta` concatenated both, rendering assistant text twice. No seam existed where dedup could live.

Each follow-up fix had to be re-implemented per adapter. The two implementations drifted in subtle ways (block-kind tables, usage merge semantics, fallback text handling). There was no place to centrally test wire→delta translation: the only tests were end-to-end through each adapter, requiring full subprocess or SDK mocks.

ADR-0033 introduced the same pattern at the persistence layer (`IWorkflowStateCodec` between `FeatureRepository` and YAML serialisation). That seam unlocked stub-codec tests of repository invariants. This ADR extends the pattern to the streaming layer.

## Decision

We introduce `StreamDeltaReducer` in `src/application/chat/StreamDeltaReducer.ts` as the single owner of wire→`StreamDelta` translation. The reducer is:

- **Application-layer** — pure module with no `obsidian` / SDK / `child_process` imports, depends only on `@/domain/ports/ClaudeCliPort` and `@/domain/chat/SessionId`.
- **Stateful per stream** — one instance per `queryStream()` call, owning `turnId`, `messageSeq`, `blockKinds`, `lastUsage`, `sessionIdEmitted`, `textEmitted`, and the per-message `textDeltaSeenForCurrentMessage` dedup flag.
- **Result-shaped** — never throws; transport-level errors flow through `emitError(error)` which returns the same `readonly StreamDelta[]` as `consume(event)`.
- **Wire-shaped at the input** — accepts a small `RawClaudeEvent` discriminated union (`system-init` / `system-compact-boundary` / `stream-event` / `assistant-message` / `result`) kept structurally close to what the two adapters already read.

```ts
class StreamDeltaReducer {
  constructor(options: { turnId: string });
  consume(event: RawClaudeEvent): readonly StreamDelta[];
  emitError(error: ClaudeCliError): readonly StreamDelta[];
  reset(): void;
  get terminated(): boolean;
  get turnId(): string;
  hasText(): boolean;
}
```

Both adapters become thin wire-readers:

```ts
for await (const raw of sdkOrNdjsonStream) {
  for (const delta of reducer.consume(toRawClaudeEvent(raw))) yield delta;
  if (reducer.terminated) return;
}
```

The subprocess dedup invariant lives in the reducer: when `consume` sees a `text_delta` content-block delta for the current message, the per-message `textDeltaSeenForCurrentMessage` flag is set; subsequent `assistant-message` envelopes for the same message return an empty array. The flag resets on every `message_start`.

## Considered options

### Option A — `StreamDeltaReducer` class with `consume(event): readonly StreamDelta[]` (chosen)

- Pros: state lives in one place; both adapters drop the duplicated dispatch helpers; subprocess dedup invariant becomes a single line; wire-format table tests run on the pure module without spawning subprocesses or mocking the SDK; ADR-0033 precedent already established.
- Cons: one new application-layer file (350 LOC); adapters still own a thin wire→`RawClaudeEvent` translation.

### Option B — Pure function reducer with explicit state argument

- Pros: trivially testable; no `this`.
- Cons: caller has to thread `state` through; the seven mutable fields (`messageSeq`, `blockKinds`, `sessionIdEmitted`, `textEmitted`, `textDeltaSeenForCurrentMessage`, `lastUsage`, `terminated`) make the function signature awkward; no improvement over a class.

### Option C — Leave translation in adapters; just deduplicate by hand

- Pros: zero new files.
- Cons: dedup gap re-opens on the next refactor; the next Codex P1 / P2 wire-format fix still ships twice; no central place to test wire-format coverage; doesn't address the architectural issue (the seam is missing).

### Option D — Generic `Codec<Wire, Delta>` parameterised on transport

- Pros: more abstract.
- Cons: gold-plating; the two transports' wire formats overlap enough that a single concrete reducer suffices; abstracts a generality we don't need.

## Consequences

### Positive

- `ClaudeCliAdapter._dispatchMessage` (and its 9 helpers) collapse to a thin `_sdkMessageToRawEvent` translator. The SDK adapter no longer owns `messageSeq`, `blockKinds`, or `textEmitted`.
- `ClaudeSubprocessAdapter._handleNdjsonLine` (and its 11 helpers) collapse to `_ndjsonToRawEvent` + `_emitFromReducer`. The subprocess adapter no longer owns `toolBlockIds`, `lastUsage`, `turnId`, or the per-event dispatch table.
- The Perf F-2 double-push gap is closed structurally: the dedup invariant is enforced in `StreamDeltaReducer._consumeAssistantMessage`, not via discipline.
- Wire-format coverage tests live in `tests/application/chat/StreamDeltaReducer.test.ts` and run as fast pure-function tests; the adapter tests now assert delegation + transport-level concerns (spawn, abort, timeout) only.
- Future wire-format additions (new SDK events, new NDJSON event types) need one change in the reducer, not two.
- ADR-0033 precedent extended consistently: one codec module per cross-cutting translation concern.

### Negative

- One new application-layer file (`src/application/chat/StreamDeltaReducer.ts`, ~350 LOC).
- Adapters still own a thin wire-shape→`RawClaudeEvent` translation (~40 LOC each). This is intentional — the reducer's input alphabet is normalised, not raw — but it does mean the seam is two-sided.
- Adapter telemetry now reads `proc.sessionId` / `proc.reducer.terminated` instead of a sink-local `terminated()` accessor. Future readers should not be surprised that the adapter no longer "knows" what's in the reducer's internal state beyond what the reducer exposes.

### Neutral

- The `RawClaudeEvent` discriminator stays in the reducer file. Co-locating it with the consumer keeps the test surface small.
- No domain layer change. `StreamDelta` continues to live on `ClaudeCliPort`. UI consumers are unchanged.
- The reducer is application-layer (not a port). It's not injected — adapters `new` it directly. There's no need for a `ports.ts` `InjectionKey` or composable; the reducer has no Obsidian surface area.

## Compliance

- `src/infrastructure/obsidian/ClaudeCliAdapter.ts` and `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts` must not contain `messageSeq`, `blockKinds`, `toolBlockIds`, or `lastUsage` state. Search for these field names if violations recur.
- The reducer test (`tests/application/chat/StreamDeltaReducer.test.ts`) must cover the SDK and NDJSON event tables, dedup, `messageSeq` isolation, `blockId` minting, partial-usage merge, and `session-id` single-fire.
- The subprocess streaming test (`tests/infrastructure/obsidian/ClaudeSubprocessAdapter.streaming.test.ts`) must include the Perf F-2 regression: feeding both `text_delta` events and a terminal `assistant/message` carrying the full body yields exactly one concatenated text payload to the channel.

## References

- ADR-0008 (Narrow Ports) — establishes the per-concern interface discipline this ADR extends to streaming.
- ADR-0033 (`IWorkflowStateCodec`) — direct precedent: same codec-seam pattern at the persistence layer.
- `src/application/chat/StreamDeltaReducer.ts` — module introduced by this ADR.
- `src/infrastructure/obsidian/ClaudeCliAdapter.ts` — first consumer.
- `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts` — second consumer.
- Architecture review #2 — "Introduce a `StreamDeltaReducer` codec seam between adapters and store".
- Performance review F-2 (P1) — "Subprocess transport double-pushes text" (Claudian PR #510 pattern).
- Codex P1 PR #378 — `messageSeq` blockId-collision fix that had to ship in both adapters.
- Codex P2 PR #386 — partial-usage-merge fix that had to ship in both adapters.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
