---
title: "Team Chat — Phase 4b: interactive DM view (roster→DM, top bar, presence, action rebasing) — Implementation Plan"
date: 2026-07-24
status: draft
scope: src/features/teamChat, src/features/chat (reused-island action seams — behavior-preserving), src/features/chat/ui/vue/transcript, CLAUDE.md
relates-to: docs/superpowers/specs/2026-07-24-team-chat-design.md, docs/superpowers/plans/2026-07-24-team-chat-phase-4a-foundation.md
---

# Team Chat — Phase 4b: interactive DM view — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Depends on Phase 4a being merged** (the view scaffold, thread store, enumeration, and persistence isolation).

**Goal:** Make Team Chat *interactive*: clicking a roster agent opens/resumes that agent's one persistent DM (rendered by the reused transcript + composer islands), a top bar shows the agent's identity + the files they've edited, roster rows show live idle/busy presence, and the reused-island actions that today resolve through the **global sidebar view** are rebased onto the **owning DM tab** (spec §2) — including **disabling fork** on the Team Chat surface (Round-15 P1). The chat engine and provider runtimes stay untouched; every change to shared `src/features/chat/` code is a **behavior-preserving** seam extraction guarded by a characterization test written first.

**Architecture:** 4a left the `ChatViewHandle` refresh methods as re-project placeholders and the roster read-only. 4b fills them in and wires interactivity through the Team-Chat-owned `TabManager` (per §2): roster select → `TeamChatThreadStore.resolveOrCreate(agentId)` → `switchToTab` (tab exists) or `createTab({ conversationId, boundAgentId })`. Provider/model come from the **roster policy** (`resolveAgentProvider` + `resolveAgentModelForProvider`) resolved *before* the conversation is created, never `providerOverride ?? default` (spec §2 — a naive fallback silently drops the agent's cross-provider model). The three "reused-island" seams the integration map flagged (`$` resume, message-toolbar feedback/promote, fork) all resolve their target through `plugin.getActiveConversationSnapshot()`/`getView()` (the **sidebar**), so on the Team Chat surface they mis-target or no-op; 4b injects the **host's own active-conversation resolver** into the per-tab transcript/composer callbacks so the sidebar keeps today's behavior and Team Chat targets its owning tab.

**Tech Stack:** TypeScript, Vue 3, Pinia, Jest, Vitest (Vue lane).

---

## File Structure

| File | Change |
|------|--------|
| `src/features/teamChat/TeamChatView.ts` | `selectAgent(agentId)`; instantiate `TeamChatThreadStore`; restore `selectedAgentId`'s DM on open; DM-scoped `ChatViewHandle` refresh bodies; host active-conversation resolver |
| `src/features/teamChat/ui/vue/TeamRoster.vue` | row `@click` → select agent; `PresenceDot` per row |
| `src/features/teamChat/ui/vue/TeamChatMain.vue` | top bar + active-DM content host wiring |
| `src/features/teamChat/ui/vue/components/TeamChatTopBar.vue` | **new** — agent avatar + name + one-line voice summary |
| `src/features/teamChat/ui/vue/components/EditedFilesStrip.vue` | **new (extracted presentational)** — files-worked-on strip |
| `src/features/teamChat/ui/vue/components/PresenceDot.vue` | **new** — idle/busy dot |
| `src/features/teamChat/ui/vue/stores/teamChatStore.ts` | `activeThread` (conversationId + agent) + live `presence` |
| `src/features/chat/ui/vue/composer/components/EditedFilesBar.vue` | refactor to consume the extracted `EditedFilesStrip` (behavior-preserving) |
| `src/features/chat/ui/vue/transcript/transcriptCallbacks.ts` + `cards/MessageActionBar.vue` | split `isForkEligible` from `isRewindEligible`; feed host active-conversation resolver |
| `src/features/chat/tabs/tabControllers.ts` | thread the host active-conversation resolver into message-action targeting (replaces the hardcoded `getActiveConversationSnapshot`) |
| `src/features/chat/ui/vue/composer/dropdowns/*` (resume) | `$` resume affordance gated per surface |
| `src/features/teamChat/CLAUDE.md`, root `CLAUDE.md` | subsystem doc + features-table row |
| Tests | see per-task |

**Ordering:** interactivity (T1) → action rebasing incl. fork-disable (T2, the correctness-critical seam) → top bar + edited-files extraction (T3) → presence (T4) → refresh-method bodies (T5) → docs + full gate (T6).

---

## Task 1 — Roster click → live DM (resolve-or-create, switch, restore)

**Files:** `TeamChatView.ts`, `TeamRoster.vue`, `teamChatStore.ts`, `activateTeamChat.ts`. Test: `tests/vue/teamChat/*`, `tests/unit/features/teamChat/TeamChatView.selectAgent.test.ts`.

- [ ] 1.1 Instantiate `TeamChatThreadStore` in `TeamChatView` (deps wired to `plugin.createConversation` — with roster-policy provider/model — `plugin.getConversationSync`, `plugin.findTeamChatConversationForAgent`, `plugin.events`).
- [ ] 1.2 **Red.** Test `selectAgent(agentId)`: resolves the agent's DM via `resolveOrCreate`, and if a tab for that conversation exists calls `switchToTab`, else `createTab({ conversationId, boundAgentId })` (activate). Assert provider/model came from `resolveAgentProvider`/`resolveAgentModelForProvider` (mock an agent whose `modelSelection.providerId` differs from the global default → the DM's conversation uses the agent's provider, **not** the default). Second `selectAgent` for the same agent switches (no second create).
- [ ] 1.3 **Green.** Implement `selectAgent`; wire `TeamRoster.vue` row `@click` → `cb.onSelectAgent(agentId)` → `view.selectAgent`; project `activeThread` into `teamChatStore`. On `onOpen`, if `setState` restored a `selectedAgentId`, `selectAgent` it (restores the last DM).
- [ ] 1.4 Gate + commit: `Phase 4b (1/6): roster click resolves/opens the agent DM (roster-policy provider/model)`.

## Task 2 — Rebase reused-island actions onto the owning tab (+ fork-disable) — spec §2 / Round-15 P1

**Why:** `$` resume (`InputController` → `getConversationList()`), message-toolbar feedback/promote (`tabControllers.ts:303` → `getActiveConversationSnapshot()` → `getView()` = sidebar), and fork (`MessageActionBar` `showFork` → `createForkConversation` with no `boundAgentId`/`surface`) all resolve through the global sidebar view. On the Team Chat surface they mis-target, no-op, or (fork) create an unbound conversation that escapes the §4 filter and desyncs the room map. All three are **behavior-preserving** to extract: inject a host resolver; sidebar injects today's behavior.

**Files:** `transcriptCallbacks.ts`, `cards/MessageActionBar.vue`, `tabControllers.ts`, composer resume dropdown, `TeamChatView.ts`. Test: `tests/vue/chat/transcript/*` (characterization), `tests/vue/teamChat/*`.

- [ ] 2.1 **Fork-disable.** **Red (characterization):** sidebar tab still shows the fork button for an eligible user message (pin current behavior). **Green:** split `MessageActionBar`'s `showFork` to use a new `callbacks.isForkEligible(msgId)` (seam default = today's `isRewindEligible` logic, so sidebar is byte-identical); Team Chat's transcript callbacks return `isForkEligible = () => false`. Assert: sidebar fork unchanged, team-chat DM hides fork (rewind — same-conversation, safe — is untouched).
- [ ] 2.2 **Message-toolbar targeting.** **Red (characterization):** with a sidebar chat active, feedback/promote still target `getActiveConversationSnapshot()`. **Green:** thread a `resolveActiveConversationId()` resolver into `tabControllers.ts`'s message-action wiring; sidebar injects `() => plugin.getActiveConversationSnapshot()?.id ?? tab.conversationId` (current line), Team Chat injects `() => tab.conversationId` (the owning DM). Assert sidebar unchanged; Team Chat feedback/promote hit the DM even when a sidebar chat is also open.
- [ ] 2.3 **`$` resume.** Disable the resume affordance on the Team Chat surface (a DM's thread is fixed per agent): the composer resume dropdown is suppressed when the owning tab's conversation `surface === 'team-chat'`. **Red/Green** with a team-chat tab (no resume list) vs a sidebar tab (unchanged).
- [ ] 2.4 Gate + commit: `Phase 4b (2/6): rebase reused-island actions onto owning tab; disable fork + $ resume on Team Chat surface`.

## Task 3 — Top bar: identity header + extracted edited-files strip (spec §6)

**Files:** `TeamChatTopBar.vue`, `EditedFilesStrip.vue` (extracted), `EditedFilesBar.vue` (refactored to consume it), `TeamChatMain.vue`, a per-tab edited-files projection. Test: `tests/vue/teamChat/topBar.test.ts`, `tests/vue/chat/composer/*` (extraction characterization).

- [ ] 3.1 **Extract `EditedFilesStrip.vue`** — the presentational core of `EditedFilesBar.vue` (props: `entries`, `onOpen(path)`; no `inject(CALLBACKS_KEY)`). **Red first:** a characterization test on the existing `EditedFilesBar` (rendered rows, open-on-click) so the extraction is provably behavior-preserving; then refactor `EditedFilesBar.vue` to render `<EditedFilesStrip>` and keep its `ComposerCallbacks` binding. (Improve-the-code-you're-working-in extraction, per clean-code doc.)
- [ ] 3.2 `TeamChatTopBar.vue` — agent avatar (`renderAgentAvatar`) + name + one-line `voice` summary (from `rosterAgentToPersona`/`formatBoundAgentPersona`'s voice), for the active DM's agent.
- [ ] 3.3 Feed the top bar's `EditedFilesStrip` from the active DM tab's `tab.state.editedFiles` (the data path the integration map identified — synchronous, no composer coupling) via a small per-tab projection mirroring `tabComposer.ts`'s `buildEditedFiles`; open-on-click routes through the view.
- [ ] 3.4 Gate + commit: `Phase 4b (3/6): Team Chat top bar (identity + extracted EditedFilesStrip)`.

## Task 4 — Presence liveness (idle / busy)

**Files:** `PresenceDot.vue`, `TeamRoster.vue`, `teamChatStore.ts`, `TeamChatView.ts`. Test: `tests/vue/teamChat/presence.test.ts`.

- [ ] 4.1 **Red.** A DM tab's `onTabStreamingChanged(tabId, true)` projects that agent's presence to `'busy'`; `false` → `'idle'`; an agent with no open DM tab is `'idle'`.
- [ ] 4.2 **Green.** In `TeamChatView`'s `onTabStreamingChanged` callback, map `tabId → conversationId → boundAgentId` and set `teamChatStore.presence[agentId]`. `PresenceDot.vue` renders the state on each `TeamRoster` row. (Base signal only — the finer thinking→streaming split is the spec's optional refinement, explicitly out of increment 1.)
- [ ] 4.3 Gate + commit: `Phase 4b (4/6): roster presence dots (idle/busy from tab streaming callback)`.

## Task 5 — DM-scoped `ChatViewHandle` refresh bodies

**Files:** `TeamChatView.ts`. Test: `tests/unit/features/teamChat/TeamChatView.refresh.test.ts`.

- [ ] 5.1 Fill in the 4a placeholders with real behavior for the active DM: `refreshProviderAvailability()` re-resolves enabled providers and re-projects (so enabling a provider un-greys an open DM — the integration map's stale-credentials risk); `refreshModelSelector`/`refreshTabControls`/`applyEditedFilesSetting`/`updateLayoutForPosition` re-project the active DM's composer/top-bar. **Red:** each is exercised through a broadcast (e.g. `EnvironmentApplyService` env apply reaching the Team Chat host now that 4a enumerates it) and asserted to refresh the DM, not no-op.
- [ ] 5.2 Gate + commit: `Phase 4b (5/6): DM-scoped ChatViewHandle refresh bodies`.

## Task 6 — Docs + full gate

**Files:** `src/features/teamChat/CLAUDE.md` (new), root `CLAUDE.md` (features-table row), `src/features/chat/CLAUDE.md` (note the reused-island host-resolver seam). Test: full suite + build + all ratchets.

- [ ] 6.1 Write `src/features/teamChat/CLAUDE.md` (view/engine-reuse/thread-store/presence/action-rebasing, mirroring the other feature CLAUDE.md docs) and add the features-table row to root `CLAUDE.md`. Note the `getView()` sidebar-scoping asymmetry and the leaf-owned persistence.
- [ ] 6.2 Full gate: `npm run typecheck && npm run lint && npm run test && npm run test:vue && npm run typecheck:vue && npm run build && npm run check:loc && npm run check:css && npm run check:quality && npm run test:perf`. Reconcile `scripts/loc-baseline.json` + `scripts/quality-baseline.json` (lock any improvements; justify any growth). Confirm no new perf regressions (the Team Chat engine reuses the same `TabManager`, so `multiTabStreaming.perf` coverage already applies).
- [ ] 6.3 Commit: `Phase 4b (6/6): Team Chat CLAUDE.md + features-table row + final gate`.

---

## Self-Review

- **Spec coverage (4b slice):** §1 interactive roster, §2 roster→DM via roster-policy provider/model + the full reused-island action audit (`$` resume, feedback/promote, fork), §3 idle/busy presence, §6 top bar + extracted `EditedFilesStrip`. Increment-1 non-goals honored (no group rooms, no autonomous multi-agent, no new engine).
- **Round-15 P1 (fork):** closed in T2.1 via the `isForkEligible` seam split — sidebar behavior byte-identical (characterization-locked), Team Chat fork hidden.
- **Behavior-preserving shared edits:** every touch to `src/features/chat/` (fork seam, action targeting, `EditedFilesStrip` extraction) is guarded by a characterization test written **first**, so the sidebar and Agent Board surfaces are provably unchanged.
- **No engine changes:** `TabManager`/controllers/`ChatState`/runtimes untouched; Team Chat is host + shell only.
- **Deferred (documented, not dropped):** thinking→streaming presence refinement (spec §3 optional), group rooms (increment 2 — thread-store room-key seam already reserved in 4a), avatar *image* upload UI (spec lists `avatarImage`; emoji/persona avatars ship, image-file picker is a later add if not already covered by Phase 1).
