---
title: "Team Chat — Phase 4a: view foundation (enumerable, persistable, DM-resolvable) — Implementation Plan"
date: 2026-07-24
status: draft
scope: src/features/teamChat, src/app/conversations/ConversationStore.ts, src/core/types/PluginContext.ts, src/main.ts, src/app/lifecycle/PluginLifecycle.ts, src/app/views/registerPluginViews.ts, src/app/commands/registerPluginCommands.ts, src/app/events/specoratorEvents.ts, src/i18n
relates-to: docs/superpowers/specs/2026-07-24-team-chat-design.md, docs/research/2026-07-24-team-chat-phase-2-host-migration-surface.md, "Phase 4 integration map (in-session research, a8cddfc)"
---

# Team Chat — Phase 4a: view foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `TeamChatView` main-area island so it is **registered, openable, enumerable, persistable, and DM-resolvable** — the load-bearing plumbing — while the *interactive* DM surface (roster-click → live DM, top bar, presence liveness, fork-disable) is deferred to Phase 4b. After 4a a user can open Team Chat from the ribbon/command and **see their roster rendered read-only**; after 4b they can talk to an agent. Every step stays green (`typecheck && lint && test`).

**Architecture:** This phase reuses the chat engine wholesale (§2 of the spec) and mirrors the Library three-file island pattern (§1). The load-bearing finding from the Phase 4 integration map: the tab engine (`TabManager`, controllers, `ChatState`) is **provably host-agnostic** — it reaches only `TabManagerViewHost` (`{ leaf, getTabManager() }`, `tabs/types.ts:75-81`), never `SpecoratorView` or `VIEW_TYPE_SPECORATOR` — so a second host is *reuse*, not a fork. The one real blocker is that `getAllViews()` (`main.ts:792`) filters `getLeavesOfType(VIEW_TYPE_SPECORATOR)` **before** any duck-type, so a `TeamChatView` under its own view-type string is invisible to the ~18 broadcast/lifecycle call sites until `getAllViews()` is broadened (T4). Two Round-15 P1 refinements are also settled here: **tab-state persistence isolation** (T5 — Team Chat is leaf-owned and excluded from the global `persistTabManagerState()` singleton) and the **fork-disable** (deferred to 4b, where the interactive transcript actions land).

**Pinia decision (resolves a spec/research divergence):** spec §142 names the store `getTeamChatPinia()` (singleton-getter shape); the integration map is explicit that Team Chat must use a **fresh-per-leaf** factory like chat's `createChatShellPinia()` (`chat/ui/vue/globalPinia.ts:13`), because each `TeamChatView` owns its own `TabManager` and the plugin supports multiple enumerated leaves — a shared singleton would let two Team Chat leaves cross-contaminate tab/DM state (the exact trap chat's comment documents). **This plan uses `createTeamChatPinia()` (fresh per leaf).** The spec's §1 naming is corrected to match in T3.6.

**Tech Stack:** TypeScript, Vue 3, Pinia, Jest, Vitest (Vue lane, `tests/vue/`).

---

## File Structure

| File | Change |
|------|--------|
| `src/app/events/specoratorEvents.ts` | add `'teamChat:threads-changed'` to `SpecoratorEventMap` |
| `src/app/conversations/ConversationStore.ts` | add `findTeamChatConversationForAgent(agentId): Conversation \| null` (scans `this.conversations` by `boundAgentId` + `surface==='team-chat'`) |
| `src/core/types/PluginContext.ts` | mirror `findTeamChatConversationForAgent` on the interface |
| `src/main.ts` | implement `findTeamChatConversationForAgent`; broaden `getAllViews()`; register view/ribbon/command wiring hooks |
| `src/features/teamChat/TeamChatThreadStore.ts` | **new** — `roomKey → conversationId` map at `.specorator/team-chat/threads.json`, store-wide serialized writes, `resolveOrCreate(agentId)` |
| `src/features/teamChat/viewType.ts` | **new** — `export const VIEW_TYPE_TEAM_CHAT = 'specorator-team-chat'` |
| `src/features/teamChat/TeamChatView.ts` | **new** — `ItemView` + `implements ChatViewHandle`; constructs `TabManager` into the mounted content host; leaf-owned `getState`/`setState` |
| `src/features/teamChat/activateTeamChat.ts` | **new** — reveal-or-open in the main area |
| `src/features/teamChat/ui/vue/globalPinia.ts` | **new** — `createTeamChatPinia()` (fresh per leaf) |
| `src/features/teamChat/ui/vue/TeamChatRoot.vue` | **new** — two-pane frame; provides the content host (`CONTENT_HOST_KEY`) |
| `src/features/teamChat/ui/vue/TeamRoster.vue` | **new** — read-only agent list (avatars); interaction deferred to 4b |
| `src/features/teamChat/ui/vue/stores/teamChatStore.ts` | **new** — `shallowRef` read-model (`agents`, `selectedAgentId`, per-agent `presence` placeholder) |
| `src/features/teamChat/ui/vue/keys.ts` | **new** — `PLUGIN_KEY` / `VIEW_KEY` / `CALLBACKS_KEY` / `CONTENT_HOST_KEY` injection keys |
| `src/app/views/registerPluginViews.ts` | register `VIEW_TYPE_TEAM_CHAT` + `users` ribbon |
| `src/app/commands/registerPluginCommands.ts` | `open-team-chat` via `createRegistrar` |
| `src/app/lifecycle/PluginLifecycle.ts` | scope `persistOpenTabStates` global write to sidebar hosts (T5) |
| `src/i18n/locales/*.ts` (10) | `ribbon.openTeamChat`, `commands.openTeamChat`, `teamChat.viewTitle`, empty-state strings |
| `src/features/teamChat/CLAUDE.md` | **new** — subsystem doc (added in 4b's final task; stubbed here) |
| Tests | see per-task |

**Ordering:** pure data (T1 event+accessor → T2 thread store) → view scaffold (T3) → enumeration (T4) → persistence isolation (T5). T1/T2 have no view dependency and are fully unit-testable first.

---

## Task 1 — `teamChat:threads-changed` event + `findTeamChatConversationForAgent` accessor

**Why:** `TeamChatThreadStore.resolveOrCreate` (T2) must (a) emit a change event and (b) **adopt an orphaned DM** — if `threads.json` is lost but a `surface:'team-chat'` conversation bound to the agent still exists, reuse it instead of creating a duplicate. That adoption needs a by-agent lookup, which today has no seam: `getConversationList()` deliberately *excludes* team-chat (Phase 3), and the unfiltered `getConversations()` (`ConversationStore.ts:114`) isn't on `PluginContext`.

**Files:** Modify `src/app/events/specoratorEvents.ts`, `src/app/conversations/ConversationStore.ts`, `src/core/types/PluginContext.ts`, `src/main.ts`. Test: `tests/unit/app/conversations/ConversationStore.test.ts`, `tests/integration/main.test.ts`.

- [ ] 1.1 In `src/app/events/specoratorEvents.ts`, add `'teamChat:threads-changed': void;` (or the map's existing value convention) to `SpecoratorEventMap`, next to `'roster:changed'`.

- [ ] 1.2 **Red.** In `ConversationStore.test.ts`, add:
  ```ts
  it('findTeamChatConversationForAgent returns the agent-bound team-chat conversation, else null', async () => {
    const dm = await store.createConversation({ boundAgentId: 'roster:a', surface: 'team-chat' });
    await store.createConversation({ boundAgentId: 'roster:a' });          // ad-hoc, not team-chat
    await store.createConversation({ boundAgentId: 'roster:b', surface: 'team-chat' }); // other agent
    expect(store.findTeamChatConversationForAgent('roster:a')?.id).toBe(dm.id);
    expect(store.findTeamChatConversationForAgent('roster:zzz')).toBeNull();
  });
  ```
  Run `npx jest ConversationStore -t "findTeamChatConversationForAgent"`. Expected: FAIL (method absent).

- [ ] 1.3 **Green.** Add to `ConversationStore`:
  ```ts
  /** The canonical DM conversation for an agent on the Team Chat surface, or null. */
  findTeamChatConversationForAgent(agentId: string): Conversation | null {
    return this.conversations.find(
      (c) => c.boundAgentId === agentId && (c.surface ?? 'chat') === 'team-chat',
    ) ?? null;
  }
  ```
  Mirror the signature on `PluginContext` (`src/core/types/PluginContext.ts`, next to `getConversationById`) and implement the delegator on `SpecoratorPlugin` (`src/main.ts`, `return this.conversationStore.findTeamChatConversationForAgent(agentId);`). Run the test. Expected: PASS.

- [ ] 1.4 Add an integration assertion in `tests/integration/main.test.ts` (real store): `plugin.findTeamChatConversationForAgent(id)` finds a created team-chat DM and returns null for an unknown agent.

- [ ] 1.5 Gate: `npm run typecheck && npm run lint && npx jest ConversationStore tests/integration/main.test.ts`. Commit: `Phase 4a (1/5): teamChat:threads-changed event + findTeamChatConversationForAgent accessor` (+ trailer `-m` lines).

## Task 2 — `TeamChatThreadStore` (`roomKey → conversationId`, serialized, resolve-or-create)

**Files:** Create `src/features/teamChat/TeamChatThreadStore.ts`. Test: `tests/unit/features/teamChat/TeamChatThreadStore.test.ts`.

**Design (spec §4):** one JSON file `.specorator/team-chat/threads.json` holding `{ version, rooms: Record<roomKey, conversationId> }`. For increment 1, `roomKey === agentId` — but the method takes `agentId` and derives the key through a private `roomKeyForAgent(agentId)` seam so increment 2 can generalize to a participant set **without a data migration**. Mirror `AgentRosterStore` (`writeAtomic`, `events?.emit`). Because `VaultFileAdapter.writeAtomic` uses a single fixed `${path}.tmp` (`VaultFileAdapter.ts:48`), concurrent writes to the shared file can consume each other's temp file — so **serialize all mutations + persistence store-wide** with an async tail-chained queue (mirror `VaultFileAdapter.append`'s `writeQueue` pattern), not a per-key lock.

Deps (constructor bag, keeps it unit-testable + core-clean):
```ts
constructor(deps: {
  adapter: VaultFileAdapter;
  createConversation: (agentId: string) => Promise<Conversation>;   // wraps plugin.createConversation({ boundAgentId, surface:'team-chat', providerId })
  conversationExists: (id: string) => boolean;                      // plugin.getConversationSync(id) != null
  findAdoptable: (agentId: string) => Conversation | null;          // plugin.findTeamChatConversationForAgent (T1)
  events?: EventBus<SpecoratorEventMap>;
})
```

- [ ] 2.1 **Red — write the failing suite first.** Cover:
  1. `resolveOrCreate('a')` with empty store → calls `createConversation('a')` once, persists `{ rooms: { a: <id> } }`, emits `teamChat:threads-changed`, returns the id.
  2. Second `resolveOrCreate('a')` when the mapped id **still exists** → returns the same id, **no** new `createConversation`, **no** re-write.
  3. Mapped id **no longer exists** (`conversationExists` → false) and `findAdoptable` → null → creates a fresh one and remaps.
  4. **Adoption:** no map entry but `findAdoptable('a')` returns an orphaned DM → records that id, does **not** call `createConversation`.
  5. **Concurrency (same agent):** `Promise.all([resolveOrCreate('a'), resolveOrCreate('a')])` → `createConversation` called **exactly once**, both resolve to the same id (the serialization guard).
  6. **Concurrency (different agents):** `Promise.all([resolveOrCreate('a'), resolveOrCreate('b')])` → final persisted map contains **both** keys (no lost write).
  7. Corrupt/absent `threads.json` on load → treated as empty, no throw.

  Use an in-memory fake `VaultFileAdapter` (a `Map<path,string>` with a real async `writeAtomic`/`read`/`exists`) and spy `createConversation`. Run the file. Expected: FAIL (module absent).

- [ ] 2.2 **Green.** Implement `TeamChatThreadStore`:
  - `private queue: Promise<void> = Promise.resolve();` — every `resolveOrCreate` body runs inside `this.queue = this.queue.then(() => body).catch(...)` and awaits it, so reads-modify-writes never interleave (the whole-file map is read fresh at the top of each critical section).
  - `resolveOrCreate(agentId)`: inside the queued section — load map (cached after first read; re-derive from disk on load only), `key = roomKeyForAgent(agentId)`, if `rooms[key]` and `conversationExists(rooms[key])` → return it; else if `findAdoptable(agentId)` → set `rooms[key]=found.id`, persist, emit, return; else `conv = await createConversation(agentId)`, `rooms[key]=conv.id`, persist, emit, return.
  - Persist via `writeAtomic(THREADS_PATH, JSON.stringify({ version: 1, rooms }, null, 2))`.
  - Also expose `get(agentId): string | null` (map read, no create) for read-only callers (roster presence in 4b).
  Run the suite. Expected: PASS.

- [ ] 2.3 Gate: `npm run typecheck && npm run lint && npx jest TeamChatThreadStore`. Commit: `Phase 4a (2/5): TeamChatThreadStore — serialized roomKey->conversationId with adopt-then-create` (+ trailers).

## Task 3 — `TeamChatView` scaffold + registration + i18n + read-only roster render

**Files:** Create the `src/features/teamChat/` view files + Vue tree; modify `registerPluginViews.ts`, `registerPluginCommands.ts`, the 10 locale files. Test: `tests/vue/teamChat/*`, `tests/integration/main.test.ts` (registration), `tests/unit/features/teamChat/TeamChatView.test.ts`.

This is the largest task; it establishes the view object and its `ChatViewHandle` conformance so T4 can enumerate it. The **interactive** roster (click → DM), the top bar, presence liveness, and fork-disable are Phase 4b — 4a renders the roster **read-only**.

- [ ] 3.1 `viewType.ts` — `export const VIEW_TYPE_TEAM_CHAT = 'specorator-team-chat';` and `export type TeamChatViewState = { selectedAgentId?: string; tabManagerState?: AppTabManagerState };`.

- [ ] 3.2 `ui/vue/globalPinia.ts` — `export function createTeamChatPinia(): Pinia { return createPinia(); }` with a comment mirroring chat's (per-leaf `TabManager`, multi-leaf enumeration, no shared singleton).

- [ ] 3.3 `ui/vue/keys.ts` — `InjectionKey`s: `PLUGIN_KEY`, `VIEW_KEY`, `CALLBACKS_KEY`, `CONTENT_HOST_KEY: InjectionKey<(hostEl: HTMLElement) => void>` (mirror `chat/.../TabContentHost.vue`).

- [ ] 3.4 `ui/vue/stores/teamChatStore.ts` — `useTeamChatStore` (`defineStore('team-chat', …)`): `agents: shallowRef<RosterAgent[]>([])`, `selectedAgentId: shallowRef<string|null>(null)`, `presence: shallowRef<Record<string,'idle'|'busy'>>({})`, plus `setAgents`/`setSelected`/`setPresence` whole-value setters. Truth stays in `plugin.agentRosterStore` + the engine; this is a projection.

- [ ] 3.5 `ui/vue/TeamChatRoot.vue` + `TeamRoster.vue`:
  - `TeamChatRoot.vue`: two-pane grid (`.specorator-vue` baseline + `--sp-*` tokens; new CSS in `src/features/teamChat/`, **no `!important`**). Left = `<TeamRoster/>`. Right = a `<div ref>` that, `onMounted`, calls the injected `CONTENT_HOST_KEY(hostEl)` — the opaque host the engine mounts DM tab DOM into (Vue never touches its children; same "leave-me-alone host" contract as `TabContentHost.vue`). In 4a the right pane also shows an empty-state ("Select an agent" — `teamChat.emptyState`) layered above the (childless) host.
  - `TeamRoster.vue`: loads agents via `useRosterStore` (reused composable, instantiated in this leaf's Pinia) into `teamChatStore.agents`; renders each with `renderAgentAvatar(rosterAgentToPersona(agent))` + name + description. **Read-only in 4a** (no `@click` DM wiring — that's 4b). Subscribes to `roster:changed` (debounced) for live refresh; disposes on unmount.

- [ ] 3.6 `TeamChatView.ts` — `export class TeamChatView extends ItemView implements ChatViewHandle`:
  - `getViewType()/getDisplayText()/getIcon()` (`users`).
  - `onOpen()`: `vueApp?.unmount()`, `contentEl.empty()`, add `.specorator-vue` + `.specorator-team-chat-vue-root`, `createApp(TeamChatRoot)`, `app.use(createTeamChatPinia())`, `provide` plugin/view/callbacks, and `provide(CONTENT_HOST_KEY, (el) => { this.tabContentEl = el; this.initTabEngine(); })` (engine construction happens **after** the host element exists — captured synchronously during child mount). `mount(contentEl)`.
  - `initTabEngine()`: `this.tabManager = new TabManager(this.plugin, this.tabContentEl, this, { …8 callbacks… })` where the callbacks re-project the store (`emitTeamChatChange()`) and `persistTabState()` (leaf-only — see T5). `this.tabsRestored = true` (no DM tabs to restore in 4a; 4b restores `selectedAgentId`'s DM). `TabManagerViewHost` is satisfied structurally (`leaf` inherited from `ItemView`, `getTabManager()` returns `this.tabManager`).
  - **`ChatViewHandle` surface** — implement every member so the T4 duck-type narrowing is sound:
    - `getTabManager()` → `this.tabManager`.
    - `invalidateProviderCommandCaches(ids?)` → `this.tabManager?.invalidateProviderCommandCaches(ids)` (real delegate — `TabManager` exposes it).
    - `refreshProviderAvailability()`, `refreshModelSelector()`, `refreshTabControls()`, `applyEditedFilesSetting()`, `updateLayoutForPosition()`, `updateHiddenProviderCommands?()` → **minimal-but-correct in 4a**: they re-project the store (`emitTeamChatChange()`); with no composer/header island mounted yet there is no other chrome to refresh. 4b gives them their DM-scoped behavior. Add a `// Phase 4b: DM-scoped refresh` comment on each so the split is explicit (heads off "why is this a re-project only" review noise).
    - `areTabsRestored()` → `this.tabsRestored`.
    - `leaf` → inherited.
  - `getState()/setState()` — leaf-owned: `getState()` returns `{ selectedAgentId, tabManagerState: this.tabManager?.getPersistedState() }`; `setState()` stores `selectedAgentId` for 4b's restore. **Does not** write the global `persistTabManagerState()` slot (T5).
  - `onClose()`: abort/dispose active DM runtimes (`this.tabManager?.disposeAllRuntimes()`), unmount Vue, empty `contentEl`, remove classes.

- [ ] 3.7 `activateTeamChat.ts` — mirror `activateLibrary`: reveal existing `VIEW_TYPE_TEAM_CHAT` leaf or `getLeaf('tab')` + `setViewState` (main area) + `revealLeaf` + `loadIfDeferred()`; optional `agentId` param calls `view.selectAgent(agentId)` in 4b (accept + ignore in 4a).

- [ ] 3.8 Registration:
  - `registerPluginViews.ts`: `plugin.registerView(VIEW_TYPE_TEAM_CHAT, (leaf) => new TeamChatView(leaf, plugin))` + `plugin.addRibbonIcon('users', t('ribbon.openTeamChat'), () => void activateTeamChat(plugin))`.
  - `registerPluginCommands.ts`: `register({ id: 'open-team-chat', name: t('commands.openTeamChat'), callback: () => void activateTeamChat(plugin) })` through the existing `createRegistrar` (gains a hotkey entry).

- [ ] 3.9 i18n — add `ribbon.openTeamChat`, `commands.openTeamChat`, `teamChat.viewTitle`, `teamChat.emptyState`, `teamChat.rosterEmpty` to **all 10** locale files (English real strings; others follow the repo's existing translation convention — copy the pattern used for the most recent feature key set).

- [ ] 3.10 Correct the spec: in `docs/superpowers/specs/2026-07-24-team-chat-design.md` §1, change `getTeamChatPinia()` → `createTeamChatPinia()` and note "fresh per leaf (mirrors chat, not Library)". Commit with the code.

- [ ] 3.11 Tests:
  - `tests/vue/teamChat/teamChatView.mount.test.ts` — mounting `TeamChatRoot` provides the content host exactly once and renders the roster rows from a fake roster store (read-only: asserts no DM-open callback fires on row render).
  - `tests/unit/features/teamChat/TeamChatView.test.ts` — `implements ChatViewHandle` conformance: `getTabManager()` returns the manager after the host mounts; `invalidateProviderCommandCaches` delegates; `getState()` round-trips `selectedAgentId`; `onClose` disposes runtimes.
  - `tests/integration/main.test.ts` — `VIEW_TYPE_TEAM_CHAT` is registered and `open-team-chat` command exists.

- [ ] 3.12 Gate: `npm run typecheck && npm run lint && npm run test && npm run test:vue && npm run typecheck:vue`. Commit: `Phase 4a (3/5): TeamChatView scaffold + registration + i18n + read-only roster` (+ trailers).

## Task 4 — Broaden `getAllViews()` to enumerate both chat-engine hosts

**Why (the blocker):** `getAllViews()` (`main.ts:792`) filters `getLeavesOfType(VIEW_TYPE_SPECORATOR)` before any predicate, so the ~18 broadcast/lifecycle sites (env-var reconciliation restarting runtimes, provider-availability refresh, settings broadcasts, `findConversationAcrossViews`) never reach Team Chat DM tabs. Broaden it to merge both leaf types.

**Files:** Modify `src/main.ts`, `src/features/chat/isSpecoratorView.ts` (or add `src/core/…` predicate). Test: `tests/integration/main.test.ts`, `tests/unit/app/environment/EnvironmentApplyService.test.ts`, `tests/unit/app/lifecycle/PluginLifecycle.test.ts`.

- [ ] 4.1 **Characterization test first (capture current behavior).** In `main.test.ts`, assert today's `getAllViews()` returns only `VIEW_TYPE_SPECORATOR` leaves (pin the pre-change contract), then (in a sibling `it`, initially skipped or `.failing`) express the target: with one sidebar leaf + one Team Chat leaf open, `getAllViews()` returns **both**, and a broadcast (`broadcastToAllTabs` / an `EnvironmentApplyService` env apply) reaches the Team Chat host's `TabManager`.

- [ ] 4.2 **Green.** Add a `ChatViewHandle` duck-type predicate that does **not** narrow to the concrete `SpecoratorView` (the existing `isSpecoratorView` returns `value is SpecoratorView`, wrong for a Team Chat leaf). Introduce `isChatViewHandle(value): value is ChatViewHandle` (check `typeof value?.getTabManager === 'function'`), and rewrite:
  ```ts
  getAllViews(): ChatViewHandle[] {
    const leaves = [
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR),
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_TEAM_CHAT),
    ];
    return leaves.map((l) => l.view).filter(isChatViewHandle);
  }
  ```
  `findConversationAcrossViews` is built on `getAllViews()` (`main.ts:797`), so it inherits Team Chat coverage for free — add an assertion, no code change. **`getView()` stays sidebar-scoped** (`getLeavesOfType(VIEW_TYPE_SPECORATOR)` only): it backs `getActiveConversationSnapshot` (the *sidebar's* active conversation) and `PluginViewActivator` slot/new-tab logic; Team Chat rebases its own message-toolbar actions onto the owning tab in 4b rather than through the global `getView()`, so broadening it would wrongly let a Team Chat leaf answer "the active sidebar conversation." Document this asymmetry in a comment.

- [ ] 4.3 Un-skip the target test from 4.1; run `EnvironmentApplyService`/`PluginLifecycle` suites to confirm the broadcast paths now fan to both hosts with no regression to the sidebar path.

- [ ] 4.4 Gate: `npm run typecheck && npm run lint && npm run test`. Commit: `Phase 4a (4/5): enumerate both chat-engine hosts in getAllViews() (getView stays sidebar-scoped)` (+ trailers).

## Task 5 — Tab-state persistence isolation (Round-15 P1)

**Why:** With T4 done, `PluginLifecycle.persistOpenTabStates` (`:36`) now iterates Team Chat leaves too and writes each host's `getPersistedState()` into the **single** `data.tabManagerState` slot (`SharedStorageService.ts:30`) — last-write-wins, so a Team Chat host's DM layout contaminates the sidebar's global fallback (and vice versa). The global slot is the **sidebar's** cross-restore fallback; Team Chat is leaf-owned (T3 `getState`/`setState`). Scope the global write to sidebar hosts.

**Files:** Modify `src/app/lifecycle/PluginLifecycle.ts`. Test: `tests/unit/app/lifecycle/PluginLifecycle.test.ts`.

- [ ] 5.1 **Red.** In `PluginLifecycle.test.ts`, mock `getAllViews()` to return one sidebar host and one Team Chat host (distinguished by `leaf.view.getViewType()`), and assert `persistOpenTabStates()` calls `plugin.persistTabManagerState` **only** with the sidebar host's state (exactly once), never the Team Chat host's. Expected: FAIL (both written today).

- [ ] 5.2 **Green.** In `persistOpenTabStates`, filter to sidebar hosts before the global write:
  ```ts
  async persistOpenTabStates(): Promise<void> {
    await Promise.all(
      this.plugin.getAllViews()
        .filter((v) => v.leaf.view.getViewType() === VIEW_TYPE_SPECORATOR) // global slot is the sidebar's fallback; Team Chat is leaf-owned
        .map((view) => {
          const tabManager = view.getTabManager();
          return tabManager ? this.plugin.persistTabManagerState(tabManager.getPersistedState()) : Promise.resolve();
        }),
    );
  }
  ```
  (`VIEW_TYPE_SPECORATOR` imports cleanly from `core/types/chat.ts` into the app layer; `ChatViewHandle.leaf` is already on the interface.) Run the test. Expected: PASS. Confirm the existing multi-sidebar-leaf behavior is unchanged (two sidebar leaves still each write — last-write-wins across sidebars is pre-existing and out of scope).

- [ ] 5.3 Full gate: `npm run typecheck && npm run lint && npm run test && npm run test:vue && npm run typecheck:vue && npm run build && npm run check:loc && npm run check:quality`. Reconcile `scripts/loc-baseline.json` for new `teamChat/` files and any grown ceilings; confirm `check:quality` is not regressed. Commit: `Phase 4a (5/5): isolate Team Chat tab-state persistence from the global singleton (leaf-owned)` (+ trailers).

---

## Self-Review

- **Spec coverage (4a slice):** §1 view/registration/layout (read-only roster), §2 engine-host construction + the `getAllViews()` broadening it depends on, §4 `TeamChatThreadStore` + `surface`-scoped DM lookup. **Deferred to 4b (documented):** roster-click → live DM (`resolveOrCreate` → `createTab`/`switchToTab`), top-bar identity + `EditedFilesStrip`, presence *liveness* (the `onTabStreamingChanged` → dot projection), fork-disable on the surface, and the DM-scoped bodies of the `ChatViewHandle` refresh methods.
- **Round-15 P1s:** persistence isolation lands here (T5); fork-disable lands in 4b (it needs the interactive transcript, which 4b mounts) — cross-referenced so it isn't dropped.
- **Reuse, not fork:** the tab engine is untouched (integration map verified zero `SpecoratorView`/`VIEW_TYPE_SPECORATOR` coupling under `tabs/`/`controllers/`/`state/`). `TabManagerViewHost` is satisfied structurally by any `ItemView` with `getTabManager()`.
- **Pinia divergence resolved:** fresh-per-leaf `createTeamChatPinia()` (not the spec's `getTeamChatPinia()` singleton) — spec corrected in T3.10.
- **`getView()` asymmetry:** deliberately left sidebar-scoped (T4.2) so "the active sidebar conversation" semantics are unchanged; Team Chat owns action-targeting in 4b.
- **Green at every commit:** T1/T2 are pure data (no view); T3 mounts a read-only view; T4/T5 are enumeration + persistence with characterization tests capturing pre-change behavior first.
