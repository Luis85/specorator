---
id: ADR-TS-002
title: Generalise the single-thread chat store to an N-tab tabsStore and grow ChatRuntimePort additively for resume/rewind/fork
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
tags: [architecture, ui, state, ports, threads-sessions, claudian-reboot, P3]
---

# ADR-TS-002 — Multi-thread tabsStore + additive ChatRuntimePort growth (resume / rewind / fork)

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-TS-002** (multi-thread store
model) and the runtime half of **CLAR-TS-003** (the rewind/fork members deferred from
`ChatRuntimePort` by ADR-CC-001). Unblocks `PRD-TS-001` (REQ-TS-001/002/003/004/005/006/007/013/
016/019/020/021/022/028).

## Context

P1 (chat-core, SPEC-CC-016) gave us a **single-thread** Pinia store (`src/ui/stores/chatStore.ts`):
one `messages[]`, one five-status state machine (`empty|idle|streaming|error|interrupted`), one bound
`ChatTurnRunner` + `StartFailureNotifier` held **outside** reactive state via a `WeakMap` (so the
store boundary stays DTO-only, ADR-003), and the P2 sink legs (`onToolUse`/`onThinking`/… SPEC-RR-020)
mutating the live message. P2 carried that store unchanged.

P3 makes the surface **multi-conversation** (REQ-TS-001/002/003): N tabs, each with its own
conversation, status, runtime binding, and session id, with **per-tab streaming isolation** — one tab
streaming must not touch another's status or content (REQ-TS-006), and a non-active streaming/attention
tab drives its badge state (REQ-TS-007). Claudian's reference (`features/chat/tabs/{TabManager,Tab,
types}.ts`) keeps a `Map<TabId, TabData>` + an `activeTabId`, each `TabData` owning its own
`ChatRuntime` instance + per-tab `ChatState` + controllers; `DEFAULT_MAX_TABS = 3`, `MIN_TABS = 3`,
`MAX_TABS = 10` (`tabs/types.ts:41-52`); close falls back to the previous tab (next for the first), and
never leaves zero tabs (`TabManager.closeTab`).

P3 also needs three session operations ADR-CC-001 **deferred** from the nine-member
`ChatRuntimePort`: **resume** (continue a session by id), **rewind** (set a checkpoint at an earlier
turn — conversation mode at P3), and the runtime half of **fork** (the new tab's runtime adopting a
derived fork-state). ADR-CC-001 §3 pre-blessed growing the port "by adding members per phase, never by
redesign". Vue Router was removed in the P0 reboot (ADR-PSR-001) and "regrows only if a phase needs
routed navigation" (CLAUDE.md / ADR-003).

ADR-003 (DTO-only store boundary, `<script setup>`), ADR-CC-001 (additive port growth, error-as-chunk),
ADR-TS-001 (the `ProviderHistoryPort`) all remain in force.

## Decision

### 1. Generalise to a single `tabsStore` keyed by tab id (Option A)

We will replace the single-thread `chatStore` with a single Pinia **`tabsStore`** holding **N tabs as
plain DTOs** plus the active tab id — *not* a store-per-tab, and *not* a `chatStore` kept with all
state ad-hoc keyed by id.

- **Reactive state (DTO-only, ADR-003 / NFR-TS-003).** An ordered `tabs: TabState[]` (or
  `Map<TabId, TabState>` + `order: TabId[]`) and `activeTabId: TabId | null`. Each `TabState` carries
  exactly the per-thread DTOs the P1 store held, now per tab:

  ```ts
  interface TabState {
    id: TabId;                         // crypto.randomUUID()
    conversationId: string | null;     // bound history record (ADR-TS-001); null until first save
    title: string;                     // tab-badge / history title (ADR-TS-003)
    status: ChatStatus;                // the P1 five-status machine, per tab (SPEC-CC-016)
    messages: ChatMessage[];           // P1/P2 transcript DTOs
    liveAssistantId: string | null;
    interruptedId: string | null;
    usage: UsageInfo | null;
    errorActive: boolean;
    sessionId: string | null;          // resolved resume id for the next turn
    needsAttention: boolean;           // non-active turn ended/errored → badge attention (REQ-TS-007)
  }
  ```

- **Runners stay out of reactive state.** Each tab's bound `ChatTurnRunner` (built from that tab's own
  `ChatRuntimePort` instance), its `StartFailureNotifier`, and `LoggerPort` live in a
  `WeakMap`-equivalent keyed by `TabId` — **exactly the P1 pattern**, generalised. Pinia never tries
  to make a runtime/use-case instance reactive (ADR-003). One `ChatRuntimePort` instance **per tab**
  (bridge factory `createChatRuntime()` per tab — ADR-CC-001 §6), so streaming is isolated by
  construction (REQ-TS-006).

- **Per-tab streaming isolation.** Every sink leg resolves "the live message" through the **owning
  tab**, not "the active tab": a chunk for tab B writes tab B's `TabState` even while tab A is active
  (REQ-TS-006). The active tab is purely a *view* selector; the P2 block-render path + all sink legs
  operate on whichever tab the chunk belongs to. Switching tabs never resets or pauses another tab's
  turn.

- **Tab lifecycle (REQ-TS-001/002/003/004/005).** `openTab()` appends an `empty` tab and activates it;
  `switchTab(id)` sets `activeTabId`; `closeTab(id)` removes the tab + disposes its runner (cancel
  in-flight) and activates an adjacent tab (previous, or next for the first — Claudian fallback);
  `closeTab` on the **last** tab leaves exactly one fresh `empty` tab (REQ-TS-004, never tabless);
  `openTab` beyond the ceiling no-ops + raises a non-blocking `NotificationPort` notice (REQ-TS-005).

- **Tab counts (REQ-TS-004/005).** Adopt Claudian's `MAX_TABS` parity: a configurable ceiling
  (`PluginSettings.maxTabs`, default 3, clamped 1..10). MIN is **one** (Specorator's
  surface-always-usable rule, REQ-TS-004) rather than Claudian's settings-floor of 3 — the divergence
  is deliberate and recorded here.

### 2. Vue Router does **not** regrow (tab state, not routing)

Multi-tab is **in-surface tab state**, not multi-surface routed navigation: there is one sidebar view,
N conversations switched by a tab bar, no URL, no back/forward, no deep-link. Per ADR-003 / CLAUDE.md
(router "regrows only if a phase needs routed navigation"), **P3 keeps the router removed**. The
`tabsStore` + a `TabBar.vue` component own all switching. Reintroducing the hash router for this would
add machinery with no parity gain (Claudian itself uses an in-view `TabManager`, not routing).

### 3. Grow `ChatRuntimePort` additively for resume / rewind / fork (CLAR-TS-003 runtime half)

We add members to the existing nine-member `ChatRuntimePort` — **no rename, no removal** (REQ-TS-028,
ADR-CC-001 §3) — to carry the session operations P1 deferred:

```ts
// additive — appended to the existing nine members
resumeSession(sessionId: string): void;          // bind this runtime to an existing session (REQ-TS-013)
setResumeCheckpoint(assistantMessageId: string): void; // conversation-only rewind point (REQ-TS-021)
getCapabilities(): RuntimeCapabilities;          // { supportsFork; supportsRewind } — gates the UI
```

- **`RuntimeCapabilities`** is a new domain type `{ supportsFork: boolean; supportsRewind: boolean }`
  (mirrors Claudian `ProviderRegistry.getCapabilities`). The fork/rewind hover affordances are gated
  by these flags (REQ-TS-016/019) — read through the port, never branched on provider id (REQ-TS-026).
- **Conversation-only rewind executes (REQ-TS-021).** The use case truncates the tab's `messages` to
  the chosen turn and calls `setResumeCheckpoint(assistantMessageId)` so the next turn continues from
  there — mirrors `ClaudeRewindService.executeClaudeRewind` `mode === 'conversation'` (sets pending
  resume-at, closes the persistent query; **no** filesystem touch).
- **Code-and-conversation rewind is gated, not executed (REQ-TS-022 / NG7).** The two-mode menu
  affordance exists (REQ-TS-020), but choosing "code and conversation" performs **no** fs/git change
  and raises a non-blocking notice. The `RewindFilesResult` / backup-and-restore machinery
  (`ClaudeRewindService` `mode !== 'conversation'`) is the provider/runtime seam for a later phase —
  **not** added to the port in P3.
- **Fork runtime adoption.** Fork's transcript/lineage derivation is `ProviderHistoryPort.buildForkPlan`
  (ADR-TS-001 §1). The new tab's runtime adopts the derived fork-state and resumes the source session
  via `resumeSession` on its first turn; no new fork-specific port method is needed in P3.

### 4. Additive `ChatMessage` rewind fields

The rewind-eligibility scan (`rewind.ts:findRewindContext`) needs each message's turn id. We add the
three fields `ChatMessage.ts` already pre-flagged as P3 growth — **additively**, all optional
(REQ-TS-028): `userMessageId?`, `assistantMessageId?`, `resumeAtMessageId?`. Rewind eligibility
(REQ-TS-019) is then a **pure application function** over `messages[]` (mirrors `findRewindContext`):
a user message is rewind-eligible iff a following assistant message bears an `assistantMessageId`
(proving the runtime processed the turn) and `getCapabilities().supportsRewind`.

## Considered options

### Option A — One `tabsStore` (array/map of tab DTOs + activeTabId; runner per tab in a WeakMap) *(chosen)*
- Pros: minimal generalisation of the proven P1 store (same DTO-only boundary, same WeakMap-for-runner
  pattern, same five-status machine — now per tab); per-tab streaming isolation falls out naturally
  (chunks route to the owning tab); one store to test; mirrors Claudian's `Map<TabId, TabData>` +
  `activeTabId` shape; the P2 sink legs need only "resolve the owning tab" instead of "the store".
- Cons: every sink leg gains a "which tab" lookup (mitigated: the runner closure already knows its tab
  id, so the leg targets a known `TabState`).

### Option B — A store-per-tab dynamically registered/disposed
- Pros: each tab is a clean `chatStore` instance with zero cross-tab leakage.
- Cons: Pinia dynamic store registration/disposal per tab is heavier machinery; tab-bar rendering must
  fan out across N store instances; lifecycle (dispose on close, leak avoidance) is error-prone; no
  parity gain over Option A. Rejected.

### Option C — Keep `chatStore`, key all state by tab id ad-hoc
- Pros: smallest diff on paper.
- Cons: turns one cohesive `TabState` into many parallel `Record<TabId, …>` maps that must be kept in
  lock-step; invites partial-update bugs and breaks the single-DTO-per-tab clarity; harder to test.
  Rejected.

### Option D — Regrow Vue Router for tabs
- Cons: tabs are in-surface state, not routed navigation; adds a router + routes + history machinery
  for no parity gain (Claudian uses an in-view manager); contradicts ADR-003's "regrow only if needed".
  Rejected (Decision §2).

## Consequences

### Positive
- N independent conversations with per-tab streaming isolation, on the proven P1 store shape
  (REQ-TS-001/002/003/006, G1).
- The P2 block-render path, sink legs, and the `Result`/error-as-chunk boundary are **preserved** —
  they operate on a `TabState` instead of the store root; nothing about ADR-CC-001's streaming
  contract changes.
- Resume/rewind/fork land as **additive** `ChatRuntimePort` members + additive `ChatMessage` fields
  (REQ-TS-028) — P1/P2 contracts keep every name/signature.
- Capability-gated UI (`supportsFork`/`supportsRewind`) and provider-addressed history keep
  application/UI free of provider branches (REQ-TS-026).

### Negative
- The store grows from one thread to N; tests must cover tab lifecycle + isolation (mitigated:
  `data-testid` PageObjects per NFR-TS-011, deterministic Mock runtime per tab).
- Two rewind modes coexist where only one executes — a reviewer must see the gated "code and
  conversation" path as deliberate (REQ-TS-022/NG7), guarded by the Compliance check below.

### Neutral
- One `ChatRuntimePort` instance per tab (bridge factory), so the port stays "one port, one consumer
  (a tab's turn path)" — consistent with ADR-CC-001 §5/§6.
- `MIN_TABS = 1` deliberately diverges from Claudian's settings-floor of 3 (recorded, Decision §1).

## Compliance

- A contract/type check confirms the nine P1 `ChatRuntimePort` members keep their names/signatures and
  only `resumeSession`/`setResumeCheckpoint`/`getCapabilities` are added; `ChatMessage` gains only the
  three optional rewind fields (REQ-TS-028).
- ESLint ADR-003 rules stay green: the `tabsStore` holds DTOs only; runners live in the WeakMap
  outside reactive state (a test asserts no use-case instance is reactive).
- A test asserts per-tab streaming isolation: a chunk delivered for tab B mutates only tab B while tab
  A is active and idle (REQ-TS-006); and that closing the last tab leaves exactly one `empty` tab
  (REQ-TS-004).
- A test asserts "code and conversation" rewind performs no `VaultPort` write / no fs call and raises a
  notice (REQ-TS-022); conversation-only rewind truncates messages + calls `setResumeCheckpoint`
  (REQ-TS-021).
- No Vue Router import is reintroduced under `src/ui/**` (Decision §2).

## References

- PRD-TS-001 (`specs/threads-sessions/requirements.md`) — REQ-TS-001..007/013/016/019/020/021/022/028,
  NFR-TS-001/003/004; CLAR-TS-002, CLAR-TS-003.
- `specs/threads-sessions/design.md` Part C — store shape, runtime growth, bridge wiring.
- ADR-CC-001 (ChatRuntime port shape; §3 "grow per phase"; the deferred `rewind`/session accessors),
  ADR-TS-001 (`ProviderHistoryPort`, fork-as-derive), ADR-TS-003 (title-gen).
- ADR-003 (DTO-only store boundary, router-regrows-if-needed), ADR-PSR-001 (P0 reboot removed router),
  ADR-008 (narrow ports), ADR-004 (`Result`).
- Claudian reference: `features/chat/tabs/types.ts:41-52/168/174` (counts, lifecycle, `TabData`),
  `features/chat/tabs/TabManager.ts` (`createTab`/`switchToTab`/`closeTab`/`getTabBarItems`/
  `handleForkRequest`), `features/chat/rewind.ts:12` (`findRewindContext`),
  `providers/claude/runtime/ClaudeRewindService.ts:168` (`executeClaudeRewind`, conversation vs files),
  `src/ui/stores/chatStore.ts` (the P1 store this generalises).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
