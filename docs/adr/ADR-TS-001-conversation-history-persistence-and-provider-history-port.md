---
id: ADR-TS-001
title: Persist conversation history to vault files behind a narrow ProviderHistoryPort
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
tags: [architecture, ports, persistence, threads-sessions, claudian-reboot, P3]
---

# ADR-TS-001 — Persist conversation history to vault files behind a narrow ProviderHistoryPort

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25). The architect
files; the PM accepts; the human deferred all per-phase ADR gates to a single final epic-review.
Resolves **CLAR-TS-001** (persistence location) and **CLAR-TS-003** (the history/lineage seam, in
concert with ADR-TS-002's runtime growth). Unblocks `PRD-TS-001` (REQ-TS-008/009/010/012/013/014/
018/026/027/028).

## Context

P3 of the **claudian-reboot** epic (`PRD-TS-001`) makes the P1/P2 chat surface
**multi-conversation**: conversations must **persist** so they survive a view reload / Obsidian
restart (REQ-TS-008), be **listed** newest-first (REQ-TS-010), **resumed** into a tab (REQ-TS-013),
**deleted** (REQ-TS-012), and **forked** by deriving provider session-state from a source session
(REQ-TS-018). The P1 `ChatRuntimePort` (ADR-CC-001) deliberately deferred the
history/rewind/fork/session accessors to P3 and named `ProviderHistoryPort`, `HomeFsPort` as
out-of-P1 ports to be decided in their owning phase.

Two questions are load-bearing and must be answered before `/spec:specify`:

1. **Where do transcripts live?** The epic bounding constraints (charter §1, restated in
   NFR-TS-013/014) are strict: **NEVER `data.json`** for settings; **secrets → secret storage**
   (`SecretStorePort`, not yet regrown); **device/user preferences → device-local**
   (`app.saveLocalStorage`, ADR-PSR-002); **no migration** — load-or-default (CHARTER-REQ-FRESH).
   Conversation transcripts are neither a secret nor a device preference: they are **user content**
   a person may reasonably want **portable, visible, versioned, and synced** with their vault.

2. **What is the seam?** Claudian routes all history through a per-provider service —
   `ClaudeConversationHistoryService` (`providers/claude/history/ClaudeConversationHistoryService.ts`)
   implementing `ProviderConversationHistoryService` (`core/providers/types.ts`), backed by a
   `ClaudeHistoryStore` (`hydrateConversationHistory` / `deleteConversationSession` /
   `resolveSessionIdForConversation` / `buildForkProviderState` / `isPendingForkConversation`). The
   backend audit recommends mirroring this as a narrow **`ProviderHistoryPort`** alongside additive
   `ChatRuntimePort` growth, and explicitly flags "provider selection is data, not branch logic"
   (REQ-TS-026): no `if (provider === 'claude')` in application/UI.

ADR-008 (narrow ports), ADR-004 (`Result`), ADR-001 (DDD layering), ADR-CC-001 (additive port
growth, error-as-chunk) all remain in force; this ADR rules only on the **persistence location**
and the **shape of the new history port**.

## Decision

### 1. Conversation transcripts persist to **vault files** via `VaultPort`

We will persist each conversation as **vault files under a configurable folder** (default
`.specorator/sessions/`), reached through the existing `VaultPort` — never `data.json`, never the
device-local store, never (in P3) a home-directory / native store.

- **Layout.** One JSON record per conversation: `<sessionsFolder>/<conversationId>.json`. The folder
  is configurable via a new optional `PluginSettings.sessionsFolder` (default `.specorator/sessions`),
  mirroring the `specsFolder` pattern (ADR-005) — a setting *about* persistence, itself stored
  device-local per ADR-PSR-002, never holding transcript content.
- **Why vault files.** Transcripts are durable, portable, user-visible, git-trackable user content;
  `VaultPort` already exposes `readFile`/`writeFile`/`deleteFile`/`listFiles`/`fileExists`/
  `createFolder` and is implemented by all three bridges; it satisfies every epic constraint (no
  `data.json`, no secret, no device-pref misclassification).
- **No secret ever lands in a record.** Records hold provider-neutral metadata + the transcript
  (`ChatMessage[]`) + an opaque provider-state bag. No API key / token / credential is written
  (NFR-TS-013); secrets stay in the (future) `SecretStorePort`.
- **No migration (CHARTER-REQ-FRESH / NFR-TS-014).** Load-or-default: a missing or unparseable
  record yields an empty list / a fresh conversation, never a migration shim. A record whose
  `messages[]` are P1-shaped (no `contentBlocks`) renders unchanged via the P1 path (the P2
  load-or-default invariant, EC-RR-13).

### 2. The new narrow **`ProviderHistoryPort`**

We add one narrow port for one consumer (the history/resume/fork application use cases), declared in
`src/domain/ports/ProviderHistoryPort.ts`, with its own `PROVIDER_HISTORY_PORT` `InjectionKey` and
`useProviderHistoryPort()` composable — exactly like the six core ports and the P1/P2 chat ports. It
mirrors `ProviderConversationHistoryService`, made `Result`-returning at every discrete boundary
(ADR-004):

```ts
export interface ConversationRecord {
  readonly meta: ConversationMeta;       // provider-neutral metadata (REQ-TS-009)
  readonly messages: ChatMessage[];       // the P1/P2 transcript (load-or-default)
  readonly providerState: ProviderSessionState; // opaque per-provider bag (lineage/fork/resume)
}

export interface ConversationMeta {
  readonly id: string;                    // conversation id (record key)
  readonly title: string;                 // fallback or AI or manual (ADR-TS-003)
  readonly titleManual: boolean;          // manual-rename precedence (REQ-TS-011/024)
  readonly createdAt: number;             // epoch ms
  readonly updatedAt: number;             // epoch ms — history list orders by this DESC
  readonly providerId: ProviderId;        // 'claude' in P3 (no branch on it — REQ-TS-026)
  readonly sessionId: string | null;      // resolvable session id, or null when none yet
}

/** Opaque, provider-owned. Claude carries { providerSessionId?, forkSource?, previousProviderSessionIds? }. */
export type ProviderSessionState = Record<string, unknown>;

export interface ForkPlan {
  readonly messages: ChatMessage[];           // source transcript up to the chosen point
  readonly providerState: ProviderSessionState; // DERIVED state (forkSource pointer), not a copy
  readonly sourceTitle: string;
}

export interface ProviderHistoryPort {
  readonly providerId: ProviderId;
  /** List persisted conversation metadata, newest-updated first (REQ-TS-010). */
  listSessions(): Promise<Result<ConversationMeta[]>>;
  /** Hydrate one conversation's full record for resume/render (REQ-TS-013/014). */
  hydrate(conversationId: string): Promise<Result<ConversationRecord>>;
  /** Persist a conversation record on turn completion (REQ-TS-008). */
  save(record: ConversationRecord): Promise<Result<void>>;
  /** Update only metadata (rename, title-gen result) without rewriting the transcript (REQ-TS-011/024). */
  updateMeta(conversationId: string, patch: Partial<ConversationMeta>): Promise<Result<void>>;
  /** Remove a conversation's record + transcript (REQ-TS-012). */
  delete(conversationId: string): Promise<Result<void>>;
  /** The session id a tab's runtime resumes for the next turn (REQ-TS-013). */
  resolveSessionId(conversationId: string): Promise<Result<string | null>>;
  /**
   * DERIVE a new conversation's fork state from a source session + resume offset
   * (REQ-TS-018) — mirrors buildForkProviderState; NOT a transcript file copy.
   */
  buildForkPlan(
    sourceConversationId: string,
    resumeAtMessageId: string,
  ): Promise<Result<ForkPlan>>;
}
```

We rule, specifically:

1. **Fork is derive-not-copy.** `buildForkPlan` returns a `ForkPlan` whose `providerState` is a fresh
   `{ forkSource: { sessionId, resumeAt } }` bag pointing at the source session + offset (mirrors
   `ClaudeConversationHistoryService.buildForkProviderState`), and whose `messages` are the source
   transcript truncated to the chosen point. The new tab persists its **own** record on its first
   completed turn; the source record is never mutated (REQ-TS-018).
2. **Session resolution is the resume seam.** `resolveSessionId` mirrors
   `resolveSessionIdForConversation` (provider session id → conversation session id → fork-source
   session id → null). On resume (REQ-TS-013), the tab binds its runtime to this id so the next turn
   continues the conversation; the runtime-side continuation is ADR-TS-002's additive
   `ChatRuntimePort` growth (`resumeSession(sessionId)` / `setResumeCheckpoint`).
3. **Provider-addressed, never branched.** Application/UI call `ProviderHistoryPort` members only;
   no `if (provider === 'claude')` exists in those layers (REQ-TS-026). P3 wires exactly one impl —
   Claude — behind the port (REQ-TS-027); a `ProviderRegistryPort` for selecting among several is
   P9, out of scope here.
4. **Additive over the P1/P2 contract (REQ-TS-028).** This is a *new* port plus *new* domain types;
   it renames/removes nothing on the nine-member `ChatRuntimePort` or the P1/P2 `ChatMessage`. The
   `ChatMessage` rewind fields (`userMessageId` / `assistantMessageId` / `resumeAtMessageId`),
   pre-flagged in `ChatMessage.ts` as additive P3 growth, are added additively (ADR-TS-002 §4).

### 3. Three-bridge story

- **`ObsidianBridge`** → a real vault-file history store: `save`/`hydrate`/`listSessions`/`delete`
  read and write JSON records under `<sessionsFolder>/` via the bridge's own `VaultPort` methods.
  The store lives in `src/infrastructure/.../history/`; bridge exposes a
  `createProviderHistoryPort()` factory (parity with `createChatRuntime()`, ADR-CC-001 §6) so the
  view provides one per mount.
- **`MockBridge`** → an in-memory `Map<conversationId, ConversationRecord>` so `npm run dev` and unit
  tests exercise the full history/resume/fork/delete flow with no vault.
- **`LocalStorageBridge`** → a fixture-seeded in-memory store (a couple of canned conversations) so
  the GitHub Pages demo shows a populated history list; writes are non-durable (degrade gracefully,
  NFR-TS-002), which is correct for a stateless public demo.

### 4. `HomeFsPort` is explicitly deferred to P9

The provider-native / home-directory history path (Claude SDK's `~/.claude` JSONL store, Codex
JSONL, Opencode ACP) is **out of P3** (NG8). P3 exercises only the Claude **vault** path. The
`HomeFsPort` ADR is flagged here as a P9 decision; introducing it later is additive (a second
`ProviderHistoryPort` impl backed by a new `HomeFsPort`) and requires no rework of the P3 surface.

## Considered options

### Option A — Vault files via `VaultPort` behind a `ProviderHistoryPort` *(chosen)*
- Pros: transcripts are portable, user-visible, git-trackable, synced with the vault; `VaultPort` +
  all three bridges already exist; honours every epic constraint (no `data.json`, no secret leak, no
  device-pref misclassification); mirrors Claudian's per-provider history-service seam 1:1; the seam
  is provider-addressed (REQ-TS-026) and additive (REQ-TS-028); `HomeFsPort` stays cleanly deferrable
  to P9.
- Cons: a JSON-per-conversation folder appears in the vault (mitigated by a dot-folder default +
  configurable path); large transcripts are re-read whole on hydrate (acceptable at P3 scale; a
  paged store can be added later behind the same port).

### Option B — Device-local store (`app.saveLocalStorage` / `loadLocalStorage`)
- Pros: survives reload; trivially written; no vault clutter.
- Cons: **misclassifies** user content as a device preference (NFR-TS-013); not synced, not
  git-trackable, invisible to the user, lost on device change; contradicts the "transcripts are
  portable user content" framing of CLAR-TS-001. Reserved for actual device prefs (ADR-PSR-002).
  Rejected.

### Option C — A dedicated / home-directory native store (`HomeFsPort`) now
- Pros: provider-native fidelity (reads the Claude SDK's own session JSONL); the eventual P9 shape.
- Cons: needs a new `node:fs`-backed port + a non-trivial Mock/LocalStorage degrade story; couples
  P3 to a Claude-SDK-specific format the charter defers (NG8); larger surface than P3 needs.
  Deferred to P9 (Decision §4). Rejected for P3.

### Option D — Reuse `data.json` (the Obsidian plugin data file)
- Cons: forbidden by the epic constraint (NFR-TS-013/014, charter §1) — `data.json` is for settings,
  not user content; conflates the two and breaks load-or-default. Rejected outright.

## Consequences

### Positive
- Conversations survive reload/restart and are portable, versioned user content (REQ-TS-008, G2).
- A single provider-addressed seam carries list/hydrate/save/delete/resolve/fork (REQ-TS-026); P9
  adds Codex/Opencode by registering more impls behind the same port — zero P3-surface rework.
- The fork-as-derive rule keeps lineage cheap and the source conversation immutable (REQ-TS-018, G3).
- The three-bridge fan-out keeps `npm run dev` and the Pages demo fully exercising history with no CLI.

### Negative
- A new port + new domain types to maintain and test (mitigated: narrow, `Result`-returning,
  mirrors a proven Claudian shape).
- Two persistence locations now coexist by design — **settings** device-local (ADR-PSR-002),
  **transcripts** vault files — which a reviewer must understand as a deliberate
  content-vs-preference split, not an inconsistency (Compliance below).

### Neutral
- `ProviderHistoryPort` is bridge-provided via a `createProviderHistoryPort()` factory (parity with
  the `ChatRuntimePort` factory, ADR-CC-001 §6), not "the bridge is the port".
- `HomeFsPort`, `ProviderRegistryPort`, `SecretStorePort` remain out of P3; this ADR does not
  pre-bless them.

## Compliance

- ESLint import-direction + `no-restricted-imports`: zero `obsidian`/`node:*` under `src/ui/**`; the
  vault-file store lives in infrastructure (NFR-TS-005).
- A review check confirms no `if (provider === 'claude')`-style branch in `src/application/**` or
  `src/ui/**` for history/resume/fork (REQ-TS-026); exactly one `ProviderHistoryPort` impl is wired
  (REQ-TS-027).
- A test asserts no credential/secret field is ever written into a `ConversationRecord`
  (NFR-TS-013); persisted records contain only `meta` + `messages` + opaque `providerState`.
- A test asserts load-or-default: a missing/unparseable record yields empty list / fresh
  conversation, never a throw or a migration (NFR-TS-014).
- The P1 nine-member `ChatRuntimePort` and the P1/P2 `ChatMessage` keep every member name/signature
  (REQ-TS-028 contract check) — this ADR adds only new symbols.

## References

- PRD-TS-001 (`specs/threads-sessions/requirements.md`) — REQ-TS-008/009/010/011/012/013/014/018/
  026/027/028, NFR-TS-001/002/013/014; CLAR-TS-001, CLAR-TS-003.
- `specs/threads-sessions/design.md` Part C — layer placement + the three-bridge wiring.
- ADR-CC-001 (ChatRuntime port shape; named `ProviderHistoryPort`/`HomeFsPort` as out-of-P1 ports).
- ADR-TS-002 (multi-thread store), ADR-TS-003 (title-gen seam).
- ADR-008 (narrow ports), ADR-004 (`Result`), ADR-005 (configurable vault folder), ADR-PSR-002
  (settings device-local), ADR-001 (DDD layering).
- Claudian reference: `providers/claude/history/ClaudeConversationHistoryService.ts`
  (`resolveSessionIdForConversation`, `buildForkProviderState`, `hydrateConversationHistory`,
  `deleteConversationSession`, `isPendingForkConversation`), `providers/claude/history/
  ClaudeHistoryStore.ts`, `core/providers/types.ts` (`ProviderConversationHistoryService`),
  `features/chat/tabs/TabManager.ts:568` (`createForkConversation`).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
