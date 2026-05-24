---
id: ADR-CC-001
title: Bless the ChatRuntime port shape — async-generator query + per-phase callback-setter growth
status: proposed       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-24
deciders:
  - architect
  - maintainer (human)        # PENDING — charter §6a checkpoint
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
tags: [architecture, ports, chat-core, claudian-reboot, P1]
---

# ADR-CC-001 — Bless the ChatRuntime port shape

## Status

**Proposed** — pending the human checkpoint mandated by parity-charter §6a. P1 design
(`specs/chat-core/design.md` Part C) and `/spec:specify` depend on this decision, but no
implementation branch may open until a human accepts it.

## Context

P1 of the **claudian-reboot** epic (`PRD-CC-001`) reproduces Claudian's core conversational
loop inside the Specorator DDD architecture. The single most load-bearing seam is the chat
**runtime** — the object that drives one streaming agent turn. The maintainer's directive was
explicit: *"look carefully how Claudian solved this"*. The orchestrator verified the real
shapes; this ADR designs to them, not to an invented contract.

Claudian's contract is `D:\Projects\claudian-main\src\core\runtime\ChatRuntime.ts:20`. Two of
its properties bend ADR-008's "narrow, method-only, `Result`-returning port" style and
therefore need an explicit blessing before P1 design proper (charter §6a, CLAR-CC-001):

1. **`query(turn, conversationHistory?, queryOptions?): AsyncGenerator<StreamChunk>`**
   (`ChatRuntime.ts:33`) streams a turn as an **async generator** over one normalized
   `StreamChunk` discriminated union (`chat.ts:137`). It does **not** return a
   `Result<T,E>`. There is no per-`StreamChunk` `Result`: failure is carried as the
   `{ type:'error'; content }` union member (`chat.ts:145`), and the stream is terminated by a
   single `{ type:'done' }` chunk — there is **no** "text-delta" and **no** terminal "final"
   chunk (the assistant message is assembled in place by the preceding `text` chunks —
   `StreamController.ts:116`, `:200`).

2. **Callback-setter extension** — Claudian's full runtime injects its UI→runtime control
   channel via *setters* rather than constructor args or method returns:
   `setApprovalCallback` (`:48`), `setAskUserQuestionCallback` (`:50`),
   `setExitPlanModeCallback` (`:51`), `setAutoTurnCallback` (`:54`), plus `rewind` (`:47`),
   `steer` (`:38`), and subagent hooks. These are **real** Claudian members but belong to
   later phases (P2 tools, P3 history/rewind, P4 approvals/plan). The port is designed to
   **grow per phase** by adding members, never by redesign.

ADR-008 governs the six core ports (`SettingsPort`, `VaultPort`, `WorkspacePort`,
`NotificationPort`, `LoggerPort`, `CommunityPluginPort`) — each is a small, synchronous,
method-only interface implemented directly by all three bridges. A streaming generator with
mutable lifecycle state and (later) injected callbacks does not fit that mould. The backend
audit (`claudian-audit-backend.md` §"ChatRuntime contract", §"Recommended new narrow ports")
recommends a dedicated `ChatRuntimePort` and flags it as "the exception that proves the rule —
its streaming generator + callback registration is richer than the 6 existing ports and likely
warrants its own ADR."

`Result<T,E>` (ADR-004), inward-only DDD imports (ADR-001), and the three-bridge fan-out
(ADR-008) all remain in force; this ADR only rules on the **shape** of the new port.

## Decision

We will adopt a dedicated **`ChatRuntimePort`** whose P1 surface is the *streaming + lifecycle
subset* of Claudian's `ChatRuntime` (`ChatRuntime.ts:20`), declared in `src/domain/ports/`:

```ts
export interface ChatRuntimePort {
  readonly providerId: ProviderId;
  prepareTurn(request: ChatTurnRequest): PreparedChatTurn;
  ensureReady(options?: ChatRuntimeEnsureReadyOptions): Promise<boolean>;
  query(
    turn: PreparedChatTurn,
    conversationHistory?: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk>;
  cancel(): void;
  getSessionId(): string | null;
  resetSession(): void;
  onReadyStateChange(listener: (ready: boolean) => void): Unsubscriber;
  isReady(): boolean;
}
```

We rule, specifically:

1. **`query` is an `AsyncGenerator<StreamChunk>`, not a `Result`-returning method.** Streaming
   is the parity-critical heart; the generator shape is preserved end-to-end (infrastructure
   adapter → application turn orchestrator → Pinia store). **Expected streaming failure is the
   `{ type:'error'; content }` `StreamChunk` member, not a per-chunk `Result`** (mirrors
   `chat.ts:145`, `StreamController.ts:194`). This is the deliberate, blessed boundary between
   ADR-004 (`Result` for discrete operations) and the streaming contract.

2. **Non-streaming runtime operations still return their natural type.** `ensureReady` returns
   `Promise<boolean>` to mirror Claudian's lifecycle gate exactly. Wrapping it in `Result`
   would diverge from the reference for no parity gain; a hard start failure (CLI missing /
   not logged in) surfaces either as `ensureReady → false` or, once a turn starts, as an
   `error` `StreamChunk` plus a `NotificationPort` notice (REQ-CC-012). Application-layer use
   cases that compose runtime calls **do** return `Result<T,E>` (ADR-004) at their own
   boundary; the port itself mirrors Claudian.

3. **The port grows by adding members per phase — never by redesign.** The deferred
   callback-setters (`setApprovalCallback` :48, `setAskUserQuestionCallback` :50,
   `setExitPlanModeCallback` :51, `setAutoTurnCallback` :54), `rewind` (:47), `steer` (:38),
   subagent hooks, `getCapabilities`, and `getSupportedCommands` are **out of P1** and are
   added in their owning phases (P2–P4, P9). The setter-injection pattern is **blessed in
   advance** as the runtime's UI→runtime control channel so P4 can add it without an ADR
   amendment, provided each addition is additive and documented.

4. **`StreamChunk` is one discriminated union mirroring Claudian's member names** (`chat.ts:137`).
   P1 **emits** only the subset `assistant_message_start?` | `{type:'text';content}` |
   `{type:'error';content}` | `{type:'done'}` | `{type:'usage';usage;sessionId?}`. The full
   union is declared with Claudian-identical member names so P2+ members
   (`thinking`/`tool_use`/`tool_result`/`tool_output`/`context_compacted`/subagent) are purely
   additive — no rename, no `text-delta`, no invented `final`.

5. **`ChatRuntimePort` remains one narrow port for one consumer** (the chat turn orchestrator /
   chat session store). It does **not** become an aggregate; it does not re-introduce the
   deleted `IBridge`/`usePorts()` pattern. It gets its own `CHAT_RUNTIME_PORT` `InjectionKey`
   and its own `useChatRuntimePort()` composable, exactly like the six core ports.

6. **The runtime is bridge-provided as a factory.** Unlike the six stateless core ports (a
   bridge *is* the port), a `ChatRuntimePort` instance is stateful per conversation. Each
   bridge therefore exposes a **factory** (`createChatRuntime()`) returning a fresh
   `ChatRuntimePort`: `ObsidianBridge` → a real Claude-CLI subprocess runtime;
   `MockBridge` → a scripted in-memory async generator; `LocalStorageBridge` → a fixture-replay
   generator. Subprocess spawning stays entirely in infrastructure (REQ-CC-013, REQ-CC-002).

## Considered options

### Option A — Bless the Claudian shape: async-generator `query` + per-phase setter growth *(chosen)*
- Pros: byte-for-byte parity with the reference (charter §1 mandate, REQ-CC-001/001a/002a);
  rich renderers in P2+ receive identical inputs with zero redesign; the streaming generator is
  the only natural shape for token-by-token feel (NFR-CC-014); one narrow port, one consumer,
  one InjectionKey, one composable — consistent with ADR-008's *intent* even where it bends the
  *letter*; error-as-chunk keeps the generator clean (generators cannot return `Result`
  per-chunk without contorting iteration).
- Cons: bends ADR-008's method-only / `Result`-returning convention; the (future)
  setter-injection channel is a mutable-state pattern the core ports avoid; reviewers must
  learn that streaming errors are *not* `Result`.

### Option B — Wrap the stream in a `Result`-returning method that yields an observable/callback
- e.g. `query(...): Result<StreamHandle>` where `StreamHandle` emits chunks via listeners.
- Pros: superficially "ADR-008-compliant" (method returns `Result`).
- Cons: **diverges from Claudian's real solution** — the maintainer explicitly forbade
  re-inventing the contract; an observable/listener layer is strictly more machinery than an
  async generator for the same job; P2's `StreamController`-equivalent would have to adapt back
  to a generator anyway; loses the natural `for await` consumption; no parity gain. Rejected.

### Option C — Per-chunk `Result<StreamChunk, E>`
- `query(...): AsyncGenerator<Result<StreamChunk, ChatError>>`.
- Pros: uniform `Result` discipline on every yield.
- Cons: Claudian models error as a *union member* (`{type:'error'}`), not an out-of-band
  failure — wrapping every chunk doubles the discriminant, forces `result.ok` checks on every
  normal `text` chunk, and the rich-render `StreamController` (`:116`) switches on
  `chunk.type`, not on `result.ok`. It would make P2 parity harder, not easier. Rejected.

### Option D — Keep extending the six core ports / add chat methods to an existing port
- Pros: no new port symbol.
- Cons: violates "one port per consumer" (ADR-008) — chat has nothing to do with
  settings/vault/etc.; reintroduces aggregate-port coupling the P0 reboot deleted; ESLint
  forbids the deleted `IBridge`/`useBridge` symbols precisely to prevent this. Rejected.

## Consequences

### Positive
- P1 ships a parity-faithful streaming seam; P2–P9 add union members and port methods without
  touching the P1 contract (REQ-CC-001a, charter §4 phase additivity).
- The chat UI never imports `obsidian` / `node:*` (REQ-CC-002, NFR-CC-001); all subprocess
  concerns live behind the port in infrastructure.
- Mock/LocalStorage bridges drive the full UI with no CLI (REQ-CC-014) — `npm run dev` and the
  GitHub Pages demo both work; the streaming feel is testable with a scripted generator.

### Negative
- Two error conventions coexist: discrete operations use `Result` (ADR-004); streaming uses the
  `error` chunk. This must be called out in the spec and in reviewer onboarding (Compliance
  below) so it is understood as deliberate, not an oversight.
- The blessed-but-deferred setter channel is a mutable-state extension pattern that a future
  reviewer could mistake for sloppiness; the per-phase additivity rule (Decision §3) is the
  guard.

### Neutral
- `ChatRuntimePort` is bridge-provided via a factory, not "the bridge is the port" — a new
  wiring shape, but consistent with the narrow-port principle (one consumer, one InjectionKey).
- `ProviderRegistryPort`, `ProviderHistoryPort`, `HomeFsPort`, `McpConfigStorePort`,
  `McpClientPort`, `SecretStorePort`, `ApprovalRuleStorePort` remain **out of P1**; this ADR
  does not pre-bless them (they get their own ADRs in their phases where flagged).

## Compliance

- ESLint import-direction + `no-restricted-imports`: zero `obsidian`/`node:*`/
  `src/infrastructure/agent/**` imports under `src/ui/**` (NFR-CC-001).
- The P1 `ChatRuntimePort` interface declares exactly the nine listed members — a review
  checklist item compares it line-for-line to `ChatRuntime.ts:20` (REQ-CC-002a); no callback
  setter / `rewind` / `steer` / subagent member present in P1.
- The P1 `StreamChunk` union member names are diffed against `chat.ts:137` (REQ-CC-001a); no
  `text-delta` / `final` member exists.
- A spec/test note documents the **error-as-chunk** boundary (NFR-CC-003): non-streaming
  port/use-case methods are `Result`/natural-type; streaming failure is the `error` chunk.
- The deleted `IBridge` / `BridgeKey` / `useBridge` / `usePorts` symbols stay forbidden
  (ESLint); `ChatRuntimePort` gets its own `CHAT_RUNTIME_PORT` key + `useChatRuntimePort()`.

## References

- PRD-CC-001 (`specs/chat-core/requirements.md`) — REQ-CC-001, 001a, 002, 002a, NFR-CC-003.
- `specs/chat-core/design.md` Part C — layer placement + bridge wiring.
- Parity charter §6a (`specs/claudian-reboot/parity-charter.md`) — the ADR flag.
- `claudian-audit-backend.md` — "ChatRuntime contract", "Recommended new narrow ports".
- Claudian reference: `ChatRuntime.ts:20/33/39/48-54`, `chat.ts:39/137/145/165`,
  `runtime/types.ts:45/56`, `providers/types.ts:63`, `StreamController.ts:116/194/200/217`.
- ADR-008 (narrow ports), ADR-004 (`Result`), ADR-001 (DDD layering), ADR-PSR-001 (reboot).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
