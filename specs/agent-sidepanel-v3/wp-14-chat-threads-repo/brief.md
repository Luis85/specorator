# WP-14 — ChatThreadsRepository port + domain VO tests

**Branch:** `claude/asv3-wp14-chat-threads-repo` (cut from `origin/develop`)
**Lane:** Tests (independent — no inter-WP dependency)
**Estimated size:** medium (~300–450 LOC: new port + adapter + persistence migration, plus VO tests on `SessionId` / `ChatThreadRecord`)

## Goal (one sentence)

Lift chat-threads persistence out of the plugin-layer `scheduleChatThreadsPersistence` callback shape into a domain-owned `ChatThreadsRepositoryPort` with an `ObsidianPluginDataAdapter`, and add domain VO tests for `SessionId` (currently 0% statement coverage as a separate file) and the `ChatThreadRecord` invariants enforced by `parseChatThreadRecord`.

## Problem statement

Chat-threads persistence today goes through a plugin-layer side channel. `src/plugin/SpecoratorView.ts:194` and `src/plugin/AgentSidepanelView.ts:155` each call `this.plugin.scheduleChatThreadsPersistence(state.chatThreads)` inside a Pinia `$subscribe` callback. The plugin's `scheduleChatThreadsPersistence` (`src/plugin/main.ts:530`) serialises the `Map<string, ChatThreadRecord>` through helpers in `src/plugin/chatThreadsPersistence.ts` (190 LOC: `parseChatThreadRecord`, `decodeChatThreadsBlob`, etc.) and writes via `Plugin.saveData`. The flow is correct but it's ad hoc: stores subscribe → plugin schedules → plugin serialises → Obsidian's `data.json` gets the blob.

WP-3's loop-state.md flagged this as a carry-out: _"WP-14: lift `chatThreads` persistence into a `ChatThreadsRepositoryPort`. Today `SpecoratorView` and `AgentSidepanelView` each call `$subscribe(...)` on the threads store and shovel the snapshot into `plugin.scheduleChatThreadsPersistence`. WP-14 should replace that with a port-shaped repository the view injects into the store."_

Today the `chatThreadsStore` (Pinia, 102 LOC) does NOT subscribe to itself or persist directly — it stays decoupled from infrastructure. The repo-port pattern preserves that decoupling while moving the side-channel into a single narrow port the views consume.

Independently, the audit flagged low-coverage hotspots in domain VOs:

- `src/domain/chat/SessionId.ts` (23 LOC, `asSessionId` branded constructor + `SessionId` type) — present in `chatThreadsPersistence.ts` chain but no co-located test file under `tests/domain/chat/`.
- `src/domain/chat/ChatThreadRecord.ts` invariants are checked by `parseChatThreadRecord` (in the plugin layer, lines 81+). The defect-categorisation functions (`findIdentityDefect`, `findShapeDefect`) live in the plugin file but operate on domain-shaped data. Adding parser-level tests for each defect path lifts coverage AND documents the contract.

## Scope — IN

**New `ChatThreadsRepositoryPort`** (`src/domain/ports/ChatThreadsRepositoryPort.ts`):

```ts
export interface ChatThreadsRepositoryPort {
  load(): Promise<ReadonlyMap<string, ChatThreadRecord>>
  save(records: ReadonlyMap<string, ChatThreadRecord>): Promise<void>
}
```

Lives in domain because `ChatThreadRecord` is domain. Pure interface — no Obsidian / plugin imports.

**New `ObsidianChatThreadsRepository`** (`src/infrastructure/obsidian/ObsidianChatThreadsRepository.ts`):

- `load()` — reads `_storedData.specorator.chatThreads` via `Plugin.loadData()`; runs through the existing `decodeChatThreadsBlob` helper (extracted from `src/plugin/chatThreadsPersistence.ts` into a shared module under `src/infrastructure/chat/`).
- `save()` — debounces + writes via `Plugin.saveData()`. Owns the debounce timer that `main.ts` currently owns at line 530.

**New `MockChatThreadsRepository`** (`src/infrastructure/mock/MockChatThreadsRepository.ts`):

- In-memory `Map`; load/save echo. Used by `MockBridge` + standalone UI + tests.

**Inject the port into the views via the bridge.** `SpecoratorView.onOpen` and `AgentSidepanelView.onOpen` no longer call `plugin.scheduleChatThreadsPersistence`. Instead they:

1. On open: `repo.load()` → seed `chatThreadsStore` with the hydrated map.
2. Subscribe to the store: on change → `repo.save(state.chatThreads)`. The debounce moves into the repo's `save` implementation.

**Domain VO tests** under `tests/domain/chat/`:

- `tests/domain/chat/SessionId.test.ts` — asserts the brand, asserts `asSessionId('abc')` is structurally a string, asserts type-only invariants (compile-time tests via `expectTypeOf` or equivalent — Vitest supports this).
- `tests/domain/chat/ChatThreadRecord.test.ts` — moved from `tests/plugin/chatThreadsPersistence.test.ts` (the parser tests for `parseChatThreadRecord` move under `tests/infrastructure/chat/` once the helper relocates; the pure shape-defect tests can live in `tests/domain/chat/ChatThreadRecord.test.ts` as type-level + invariant tests).

**Migrate the persistence helper** out of `src/plugin/` into `src/infrastructure/chat/chatThreadsCodec.ts`. The plugin layer keeps only the `Plugin.saveData` / `Plugin.loadData` wiring (now inside the repo adapter).

## Scope — OUT

- The `ChatThreadRecord` shape itself (stable — owned by SPEC-ASM-001 §2.2).
- `messagesStore`, `streamingTurnStore`, `proposalStore` persistence (only `chatThreadsStore` is persisted today).
- Pinia store internal shape (stays as today: `chatThreads: Ref<Map<…>>`, etc.).
- Session-log persistence (`SessionLogWriter` / `SessionLogMirror` — that's WP-5).
- `MockSecretStore` / `LocalStorageSecretStore` test catch-up — that's WP-13 / WP-9.

## Approach

1. **Iteration 1 — port + adapter scaffolds.** Add the port interface, the Obsidian + Mock adapters, the `chatThreadsCodec.ts` relocation. Don't wire the views yet.
2. **Iteration 2 — wire the views.** `SpecoratorView.onOpen` + `AgentSidepanelView.onOpen` switch to `repo.load()` + subscribe-to-save. Delete `plugin.scheduleChatThreadsPersistence` from `main.ts`. Update `_pendingChatThreadsSnapshot` field accordingly (delete; the repo owns the debounce).
3. **Iteration 3 — domain VO tests.** Move + write the `tests/domain/chat/` files.
4. **Iteration 4 — coverage sweep.** Run `npm run test:coverage`; assert `src/domain/chat/SessionId.ts` ≥ 90% and `parseChatThreadRecord` defect paths ≥ 90% branches. Adjust tests if any branch still uncovered.
5. **Run the full pre-PR gate every iteration.**

## Deliverables

**New files:**

- `src/domain/ports/ChatThreadsRepositoryPort.ts` — the port interface.
- `src/infrastructure/obsidian/ObsidianChatThreadsRepository.ts` — production adapter with debounce.
- `src/infrastructure/mock/MockChatThreadsRepository.ts` — test/standalone adapter.
- `src/infrastructure/chat/chatThreadsCodec.ts` — `parseChatThreadRecord`, `decodeChatThreadsBlob`, etc. moved here.
- `tests/domain/chat/SessionId.test.ts`.
- `tests/domain/chat/ChatThreadRecord.test.ts`.
- `tests/infrastructure/obsidian/ObsidianChatThreadsRepository.test.ts`.
- `tests/infrastructure/mock/MockChatThreadsRepository.test.ts`.
- `tests/infrastructure/chat/chatThreadsCodec.test.ts` (moved from `tests/plugin/chatThreadsPersistence.test.ts`).

**Modified files:**

- `src/infrastructure/bridge/ports.ts` — add `CHAT_THREADS_REPO_KEY` InjectionKey.
- `src/ui/composables/useChatThreadsRepo.ts` — new composable (mirrors the existing per-port composable pattern).
- `src/plugin/SpecoratorView.ts:194` — replace `plugin.scheduleChatThreadsPersistence` call with `repo.save`.
- `src/plugin/AgentSidepanelView.ts:155` — same.
- `src/plugin/main.ts` — remove `scheduleChatThreadsPersistence`, `_pendingChatThreadsSnapshot`, the related debounce timer; wire `ObsidianChatThreadsRepository` into the bridge.
- `tests/__fakes__/fake-ports.ts` — add `chatThreadsRepo` to the factory output.

**Deleted (no back-compat shims, per CLAUDE.md):**

- `src/plugin/chatThreadsPersistence.ts` after its contents migrate. Replace with a re-export only if any external test fixture still imports the path; otherwise delete.
- `Plugin.scheduleChatThreadsPersistence` method.

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors.
- [ ] `npm run test` passes; new port + adapter + domain VO tests ≥ 90% statements/branches each.
- [ ] `npm run build` + `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` — `src/domain/chat/SessionId.ts` ≥ 90% statements; `src/infrastructure/chat/chatThreadsCodec.ts` ≥ 90% branches (each defect path covered).
- [ ] **Port shape**: `ChatThreadsRepositoryPort` is two methods only (`load`, `save`); no Obsidian / plugin types leak across.
- [ ] **Views migrated**: neither `SpecoratorView.ts` nor `AgentSidepanelView.ts` references `plugin.scheduleChatThreadsPersistence` (verified by `grep`).
- [ ] **Plugin slim**: `src/plugin/main.ts` LOC drops by ≥ 30 (the persistence wiring moves out). The 387-LOC max-lines warning the audit flagged for `main.ts` may now drop below 350 — confirm in the loop-state.
- [ ] PR opened against `develop`, title `refactor(asv3): ChatThreadsRepository port + domain VO tests (WP-14)`, body cites WP-3 carry-out + audit VO-coverage gap.

## Risks / known unknowns

`Plugin.saveData` is Obsidian's atomic-write API; its debounce semantics aren't documented. The existing code in `main.ts:530` debounces because rapid Pinia mutations would otherwise spam disk. Preserve a debounce inside `ObsidianChatThreadsRepository.save` (e.g. 200 ms trailing-edge); document the value in JSDoc. The `MockChatThreadsRepository` does NOT debounce — tests want determinism.

Test relocation can break in-flight CI for tests that import from the old path. Run a single-shot `npm run test` after each move to catch them. The codec function moves are pure — they retain test invariants line-for-line.

## RALPH iteration template

```
loop:
  1. Read brief.md + loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no streaming/proposal/messages store changes, no codec
     SCHEMA changes, no settings persistence.
  4. Run from inside .worktrees/asv3-wp14:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck && npm run lint && npm run test \
         && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR via gh.
     Else → goto 1.
  Hard cap: 10 RALPH iterations.
```

## Conventions

- **Worktree:** `.worktrees/asv3-wp14` (already created, branch `claude/asv3-wp14-chat-threads-repo`).
- **Commits:** conventional, squash on merge. Prefix `refactor(asv3):`.
- **PR target:** `develop`. Ready for review.
- **Do not touch:** Pinia store internals beyond seeding (still 4 stores), `messagesStore` / `proposalStore` persistence, `SessionLogWriter`.
- **Coordinate with WP-17** (plugin-core split). Both touch `src/plugin/main.ts`. If WP-17 lands first, the debounce timer ownership may have moved into a new module — rebase mechanically. If you land first, WP-17 inherits a slimmer `main.ts`.
- **Never** push to `develop`. Never force-push.
