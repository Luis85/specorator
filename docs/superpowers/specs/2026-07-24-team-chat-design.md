---
title: Team Chat — MS-Teams-style single-agent chats (increment 1)
date: 2026-07-24
status: draft
scope: src/features/teamChat, src/features/agents, src/features/chat (reuse), src/core/types/chat.ts, src/app/views, src/app/commands, src/i18n
relates-to: docs/superpowers/specs/2026-06-17-ai-agents-roster-design.md, docs/superpowers/specs/2026-06-06-remove-orchestrator-feature-design.md, docs/product/Specorator Agent Harness PRD.md, docs/adr/0005-chat-shell-vue-migration.md
method: brainstorming (owner-approved design, 2026-07-24)
---

# Team Chat — MS-Teams-style single-agent chats (increment 1)

## Context

The agent roster (`src/features/agents/`) is a first-class subsystem: a canonical
`RosterAgent` (`.specorator/agents/*.json`), a visual identity system
(`AgentPersona` + `renderAgentAvatar`), and a per-conversation binding
(`Conversation.boundAgentId`) that already lets a single chat "become" an agent
via a persona directive. What the roster has *no* surface for is an
**agent-centric home**: today you reach an agent only by opening a chat tab and
binding it. There is no place that presents your installed agents as a team you
can walk up to and talk to.

This design adds that surface: a **Microsoft-Teams-style workspace** where every
roster agent is a "team member" in a left rail, the main area is a private 1:1
chat with the selected agent, and a top bar shows the files that agent has
created or edited with you. Agents gain a light **persona/voice** layer and
richer avatars so each one has a distinct identity.

**Strategic guardrail.** A multi-agent *Orchestrator* (a lead agent delegating to
worker tabs) was deliberately removed on 2026-06-06
([remove-orchestrator spec](2026-06-06-remove-orchestrator-feature-design.md)),
and the roster design explicitly *defers multi-agent delegation* and rejects "a
bespoke multi-agent orchestration/supervisor engine," relying on each provider's
own delegation instead
([roster design](2026-06-17-ai-agents-roster-design.md)). PRD **rule R1**
(co-evolution — "do not out-orchestrate the provider") reinforces this. Team Chat
respects all three: **the human is the only orchestrator.** You address one agent
at a time; agents never autonomously talk to, delegate to, or trigger each other.
Increment 1 is strictly 1:1. Group rooms (increment 2) are *human-created and
human-driven* — the user assembles a room and still drives every turn — so they
remain within the guardrail; they are out of scope here and only a naming seam is
reserved.

## Goal

Ship an additive, main-area **Team Chat** view for **single-agent private chats**:

- A left **roster rail** listing every roster agent with persona avatar, name, and
  a live presence indicator (idle / thinking / streaming).
- Clicking an agent opens/resumes **one persistent DM thread** with that agent,
  rendered by the existing chat engine (transcript + composer), using that agent's
  own provider, model, skills, and persona.
- A **top bar** showing the active DM's identity header and the files that agent
  created/edited, reusing the existing provider-neutral edited-files subsystem.
- A per-agent **persona/voice** field and **emoji/image avatars**, edited in the
  existing agent detail editor and surfaced consistently across Team Chat, the
  current chat, the Library, and the Agent Board.

The current Chat sidebar and Agent Board are **untouched**; Team Chat is a third
surface, not a replacement.

## Non-goals

- **Group / multi-participant rooms.** Deferred to increment 2. Only a
  forward-compatible key shape is reserved in the thread store.
- **Any autonomous multi-agent behavior** — agent-to-agent messaging, delegation,
  lead/worker coordination, background "team" runs. Explicitly out (R1; see
  Context). Provider-native subagents (a single agent spawning `Task()` children
  within its own turn) are unchanged and continue to render as they do today.
- **A new chat engine.** Team Chat reuses `TabManager`, the runtime seam, and the
  transcript/composer Vue islands. No new streaming, tool-rendering, or
  edited-files code.
- **Replacing or restructuring the existing Chat view or Agent Board.**
- **A full structured "personality system"** (trait sliders, cross-surface persona
  editor). We ship one freeform `voice` field + richer avatars — the owner-chosen
  "persona/voice layer," not the "full personality system."
- **Multiple concurrent threads per agent.** One canonical DM per agent in
  increment 1; a "start a fresh chat with this agent" affordance is a later add.

## Scope

**In:**

1. New `src/features/teamChat/` view (Vue island) + registration + command +
   ribbon + i18n (10 locales).
2. `TeamChatThreadStore` — `agentId → conversationId` persistence + events.
3. Engine reuse: a Team-Chat-owned `TabManager` whose "tabs" are roster-selected
   DMs (no tab strip), participating in the plugin's cross-leaf tab aggregation.
4. Persona/voice + avatar extension: `RosterAgent.voice`, `avatarEmoji`,
   `avatarImage`; `AgentPersona`/`renderAgentAvatar` precedence; compilation into
   `formatBoundAgentPersona`; editor fields in `AgentDetailEditor`.
5. Top-bar identity header + files-worked-on strip (reused `EditedFilesBar`).
6. `surface: 'team-chat'` discriminator on the session metadata overlay so DM
   threads and ad-hoc chat history don't intermingle.

**Out:** group rooms; autonomous orchestration; new chat engine; changes to the
Chat sidebar / Agent Board; structured personality traits; multi-thread-per-agent.

## Chosen approach

**A new main-area Vue-island view that reuses the chat engine wholesale.** The
Team Chat view instantiates the same tab engine the chat sidebar uses
(`TabManager` + per-tab composition + the transcript/composer islands) but
replaces the *outer shell*: instead of a tab-badge strip it renders a **roster
rail**, and instead of the header dropdowns it renders an **agent identity + files
top bar**. Each DM is a `Conversation` bound to the agent (`boundAgentId`), which
already flows the agent's persona, model, and skills through
`resolveBoundAgentQueryOptions`. This mirrors the codebase's existing pattern for
programmatically-driven agent tabs (Agent Board work-order tabs via
`SpecoratorView.startTaskRunInFreshTab` / `TaskRunTabHandle`), so streaming,
tools, plan mode, images, persona injection, subagent rendering, and edited-files
tracking are **inherited, not re-coded**.

### Rejected alternatives

1. **New view with a fresh, Teams-styled chat UI** calling `ChatRuntime` directly.
   Full aesthetic control, but re-derives streaming, tool rendering, subagent
   nesting, persona injection, and edited-files — heavy duplication, and it would
   diverge from the `.specorator-*` DOM contract locked by
   `tests/vue/chat/transcript/domContract.test.ts`. Rejected: violates
   reuse-over-rewrite and multiplies the streaming-correctness surface.
2. **A "Teams mode" bolted onto the existing Chat sidebar** (`SpecoratorView`).
   No new view, but it forces two organizing metaphors (tab strip vs roster rail)
   into a just-migrated shell, and chat lives in a *narrow* sidebar leaf — the
   wrong shape for a wide Teams layout. Rejected: muddies a freshly-stabilized
   surface for a layout it can't host well.
3. **A bespoke lightweight DM coordinator** that mounts the transcript/composer
   islands against a bound conversation without `TabManager`. Lighter, but
   re-implements tab lifecycle (stream-generation guards, quiescing, cleanup,
   subagent streaming) that `TabManager` already gets right. Rejected: the
   correctness cost outweighs the coupling it avoids; reuse the proven engine.

## Architecture

### 1. View, registration, layout

Follow the Library/Marketplace three-file island pattern:

- `src/features/teamChat/viewType.ts` → `export const VIEW_TYPE_TEAM_CHAT = 'specorator-team-chat'`.
- `src/features/teamChat/TeamChatView.ts` → `ItemView` subclass. `onOpen()` does
  `createApp(TeamChatRoot)` + a dedicated `getTeamChatPinia()` + `provide(PLUGIN_KEY, markRaw(plugin))` (+ view/callbacks keys) + `mount(contentEl)`; `onClose()` unmounts and tears down the tab engine. `getState`/`setState`
  persist the selected `agentId` so reopening restores the last DM.
- `src/features/teamChat/activateTeamChat.ts` → reveal-or-open via
  `getLeaf('tab')` + `setViewState` + `revealLeaf` + `loadIfDeferred()` (opens in
  the **main workspace area**, giving the wide layout).
- Register in `src/app/views/registerPluginViews.ts` (ribbon icon `users`,
  `t('ribbon.openTeamChat')`) and add `open-team-chat` in
  `src/app/commands/registerPluginCommands.ts` via the existing `createRegistrar`.

Vue tree (styled through the `.specorator-vue` baseline + `--sp-*` tokens,
`src/style/vue/`; new rules in `src/features/teamChat/` CSS, no `!important`):

- `ui/vue/TeamChatRoot.vue` — two-pane frame (roster rail + main).
- `ui/vue/TeamRoster.vue` — agent list. Reuses the roster Pinia store definition
  (`useRosterStore`, wrapping `plugin.agentRosterStore`) and `useLibraryList` +
  `rosterLibraryAccessors` for search/sort/filter. Each row: `renderAgentAvatar`
  (persona) + name + subtitle + **presence dot** bound to that agent's DM runtime
  state (see §3). Subscribes to `roster:changed` (debounced) for live refresh.
- `ui/vue/TeamChatMain.vue` — hosts the top bar, the transcript island, and the
  composer island for the active DM. Provides the **content host** element that the
  Team-Chat `TabManager` mounts the active DM's tab DOM into.
- `ui/vue/components/` — `TeamChatTopBar.vue` (agent avatar + name + one-line voice
  summary), the reused `EditedFilesBar.vue`, `PresenceDot.vue`, empty states.
- `ui/vue/stores/teamChatStore.ts` — a `shallowRef` read-model (`agents`,
  `selectedAgentId`, `activeThread`, per-agent presence) projected from the engine,
  in the island's own Pinia.

### 2. Engine reuse (the crux) + lifecycle

`TeamChatView` constructs **its own `TabManager`** into the `TeamChatMain` content
host — the same way each `SpecoratorView` leaf builds one — but wired for a
roster-driven, single-visible-pane surface:

- **No tab strip.** Team Chat never renders `getTabBarItems`; roster selection is
  the navigation. DM tabs are effectively "hidden" tabs, the concept `TabManager`
  already supports for work-order tabs.
- **Roster click → DM tab.** Selecting agent *A* resolves *A*'s canonical DM
  conversation (§4) and calls `switchToTab` if its tab exists, else `createTab`
  bound to that conversation (`{ conversationId, boundAgentId: A.id }`) resolving
  *A*'s provider (`A.providerOverride ?? default`) and model
  (`A.modelSelection`). Runtimes stay **cold until first send** (existing lazy
  init), so listing/opening agents is cheap.
- **Lifecycle / caps.** Keep a bounded set of hot DM tabs (active + small LRU);
  quiesce/close the rest. The Team-Chat engine registers with the plugin's
  cross-leaf aggregation (`PluginViewActivator` tab-slot usage, environment
  application, conversation quiescing) so caps and environment stay coherent with
  the chat sidebar rather than being a rogue second engine.
- **Background streaming.** Switching away from a streaming DM leaves it running in
  its (now inactive) tab, exactly like inactive chat tabs today; its roster
  presence dot reflects "streaming."

**Primary risk + fallback.** `TabManager` is currently constructed inside
`SpecoratorView` alongside shell-specific wiring (shell projection, work-order
bridge, leaf persistence). If instantiating it standalone proves too entangled,
the in-scope, targeted refactor is to extract a small `createChatTabEngine(host,
callbacks)` seam consumed by *both* `SpecoratorView` and `TeamChatView` — an
"improve the code you're working in" extraction, not a rewrite. Attempt
reuse-as-is first; fall back to the extraction if construction can't be cleanly
parameterized. Either way the engine's internals stay untouched.

### 3. Presence

Presence is a projection of each open DM tab's existing lifecycle/stream state
(`TabData` state `blank | bound_cold | bound_active | closing` + stream activity),
not new machinery: **streaming** = active stream on that tab; **thinking** =
turn in flight pre-first-token; **idle** = otherwise. Agents with no open DM tab
are idle. The Team-Chat engine's tab-lifecycle callbacks push these into
`teamChatStore` for the roster dots.

### 4. Thread model & persistence

- `src/features/teamChat/TeamChatThreadStore.ts` — persists a map
  `roomKey → conversationId` under `.specorator/team-chat/threads.json`
  (`writeAtomic`), emits a `teamChat:threads-changed` event, and exposes
  `resolveOrCreate(agentId)`. For increment 1 `roomKey === agentId`; the key is
  deliberately a *room identity*, not hard-coded to a single agent, so increment 2
  can generalize it to a participant set without a data migration (see
  Increment-2 seam).
- `resolveOrCreate(agentId)` returns the mapped `conversationId` if present and
  still exists, else creates a conversation via `ConversationStore.createConversation({ agentId })` (existing `boundAgentId` support), records the mapping, and returns it.
- **Surface discriminator.** Add optional `surface?: 'chat' | 'team-chat'` to
  `SessionMetadata` (`src/core/types/chat.ts`, the documented UI-only overlay) and
  mirror it onto `Conversation` (as `boundAgentId` already is), defaulting to
  `'chat'` when absent (existing data untouched). Team Chat creates DMs with
  `surface: 'team-chat'`. The chat sidebar's conversation-history dropdown filters
  to `surface !== 'team-chat'`; Team Chat's own source of truth is the thread
  store, with `surface` as the belt-and-suspenders filter for shared history UI.
- Transcript/session storage is unchanged — provider-owned, hydrated lazily via
  `ProviderConversationHistoryService`. Team Chat adds **no** new transcript
  persistence.

### 5. Identity & personality (persona/voice)

**Data model** — extend `RosterAgent` (`src/features/agents/roster/rosterTypes.ts`):

- `voice?: string` — freeform voice/tone directive, distinct from the task
  `prompt` (e.g. *"Warm, concise mentor; explains with analogies; never
  condescending."*).
- `avatarEmoji?: string` and `avatarImage?: string` (vault-relative path) — richer
  avatars alongside today's `icon`/`initials`/`color`.

**Visual identity** — extend `AgentPersona` (`src/features/agents/agentTypes.ts`)
with `emoji?`/`imagePath?`; `rosterAgentToPersona`
(`src/features/agents/personaRegistry.ts`) maps the new fields; `renderAgentAvatar`
(`src/features/agents/agentAvatar.ts`) gains precedence
**`image → emoji → icon → initials → default`**. Image rendering uses the vault
resource path (Obsidian `getResourcePath`), sized like the existing avatar chip.
Because every avatar site already routes through `renderAgentAvatar`, the new
identity appears in Team Chat, the chat "Chatting with X" chip
(`BoundAgentChip.vue`), the Library card (`AvatarSlot.vue`), and the board with no
per-site change.

**Behavioral voice** — `formatBoundAgentPersona`
(`src/features/agents/roster/boundAgentPersona.ts`) appends the `voice` directive
to the identity statement it already synthesizes from name + description. This
flows unchanged through `RosterAgentService.resolveBoundAgent` →
`resolveBoundAgentQueryOptions` → `ChatRuntimeQueryOptions.boundAgentPrompt`. **No
new injection path** — voice rides the exact mechanism bound agents already use,
compiled into each provider's persona directive. R1-safe: neutral authoring,
provider-native emission; no bespoke engine.

**Editing** — extend `AgentDetailEditor`
(`src/features/agents/roster/view/AgentDetailEditor.ts`): a **Voice / personality**
textarea (separate from the task prompt) and an emoji + image picker in the
appearance row, beside the existing color/initials/icon controls.

### 6. Files-worked-on strip

Reuse the edited-files subsystem verbatim. The active DM's tab already records
`ChatState.editedFiles` on each successful file-mutating tool result
(`StreamController.recordEditedFiles`, gated by `showAgentEditedFiles`), and
`deriveEditedFilesFromMessages` rebuilds the list on history load (including nested
subagent tool calls). Team Chat projects the active tab's `editedFiles` into
`TeamChatTopBar` and renders them with the existing `EditedFilesBar.vue`; each chip
opens the file in the vault. No new persistence — file attribution is always
derived from the DM's transcript.

## Data flow

1. Open Team Chat (ribbon/command) → `TeamChatRoot` mounts; roster store loads
   agents (`AgentRosterStore.list`) and subscribes to `roster:changed`.
2. Restore last-selected agent (view state) or show the "pick an agent" empty
   state; empty roster → CTA deep-linking Library/Marketplace (`activateMarketplace(plugin, 'agents')`).
3. Click agent *A* → `TeamChatThreadStore.resolveOrCreate(A.id)` → engine
   `switchToTab`/`createTab` bound to *A* → transcript + composer islands render
   in the main pane; top bar shows *A*'s identity + current files.
4. Type + Enter → existing `InputController` → `runtime.query()` streams →
   transcript updates, edited-files recorded → top-bar strip and roster presence
   dot update live.
5. Switch agents → switch/create the target DM tab; the previous DM keeps
   streaming in the background if active.
6. Every turn: `resolveBoundAgentQueryOptions` injects *A*'s persona + **voice** +
   provider-scoped model (existing path).

## Error handling & edge cases

- **Empty roster** → roster-rail empty state with an "add agents" CTA (Marketplace/Library deep link).
- **Agent deleted mid-DM** (`roster:changed` drops the active agent) → the DM goes
  **read-only** with a notice ("This agent was removed"); transcript/history is
  preserved; sending is disabled until the user picks another agent. The thread
  mapping is kept (dangling) so re-creating an agent with the same id could rebind;
  a stale mapping whose conversation was deleted is re-created on next open.
- **Agent's provider disabled / CLI missing** → surfaced inline by the existing
  `RuntimeErrorCard` via the stream `error` chunk; the top bar shows the agent's
  provider so the mismatch is legible. Provider resolution honors
  `A.providerOverride`.
- **Concurrent streaming across DMs** → allowed; presence dots disambiguate. Hot-DM
  cap bounds resource use via quiescing.
- **Image avatar missing/renamed** → `renderAgentAvatar` falls back down the
  precedence chain (emoji → icon → initials → default).
- **Tab-cap pressure** → Team Chat's bounded hot-DM set + quiescing keeps it within
  the shared cap; DM tabs count in the cross-leaf aggregation.

## Testing

- **Unit** (`tests/unit/features/teamChat/`, `tests/unit/features/agents/`):
  `TeamChatThreadStore` (resolve-or-create, one-thread-per-agent invariant, missing
  conversation re-creation, event emission); `formatBoundAgentPersona` includes the
  `voice` directive; `renderAgentAvatar` precedence (image → emoji → icon →
  initials → default); `rosterAgentToPersona` maps new fields.
- **Vue lane** (`tests/vue/teamChat/`, `npm run test:vue`): `TeamRoster` render +
  selection + presence-dot states; `TeamChatMain`/`TeamChatTopBar` identity + files
  strip; empty-roster and no-selection states; agent-deleted read-only state.
- **Integration** (`tests/integration/`): view registration/activation; roster →
  DM open/resume flow; surface-discriminator filtering of the chat history
  dropdown.
- **Regression**: the transcript DOM contract test is unaffected (islands reused
  unchanged). If a roster list scales with agent count, add a small
  `tests/vue/teamChat/` scaling guard (mounted rows ≤ render window) rather than a
  Jest perf spec.
- **Gates**: `npm run typecheck && npm run typecheck:vue && npm run lint && npm run
  test && npm run test:vue && npm run build`, plus `check:css` and `check:loc`
  ratchets.

## Increment-2 seam (reserved, not built)

`TeamChatThreadStore` keys on a **room identity**. Increment 1: `roomKey =
agentId` (a DM is the degenerate one-participant room). Increment 2 generalizes
`roomKey` to a stable id for a user-assembled participant set and adds a "New
group" affordance in the roster rail; the DM rendering path (one active
conversation in the main pane) and the human-drives-every-turn rule are unchanged.
No group logic, turn-arbitration, or shared-context machinery is designed here —
reserving the key shape is the only forward-compat cost, consistent with YAGNI.

## Files & changes

**New — `src/features/teamChat/`:** `viewType.ts`, `TeamChatView.ts`,
`activateTeamChat.ts`, `TeamChatThreadStore.ts`,
`ui/vue/{TeamChatRoot,TeamRoster,TeamChatMain}.vue`,
`ui/vue/components/{TeamChatTopBar,PresenceDot,...}.vue`,
`ui/vue/stores/teamChatStore.ts`, a `pinia.ts` (`getTeamChatPinia`), CSS, and
`src/features/teamChat/CLAUDE.md`.

**Extended:** `src/features/agents/roster/rosterTypes.ts` (`voice`, `avatarEmoji`,
`avatarImage`); `src/features/agents/agentTypes.ts` (`AgentPersona` emoji/image);
`src/features/agents/agentAvatar.ts` (precedence + image render);
`src/features/agents/personaRegistry.ts` (`rosterAgentToPersona` mapping);
`src/features/agents/roster/boundAgentPersona.ts` (voice directive);
`src/features/agents/roster/view/AgentDetailEditor.ts` (voice + emoji/image
inputs); `src/core/types/chat.ts` (`surface?` on `SessionMetadata` + `Conversation`);
history-dropdown filter in the chat feature.

**Registration:** `src/app/views/registerPluginViews.ts` (ribbon),
`src/app/commands/registerPluginCommands.ts` (command), `src/i18n` (10 locales),
root `CLAUDE.md` architecture table (Team Chat row).

**Reused unchanged:** `TabManager` + per-tab composition, transcript/composer
islands, `deriveEditedFilesFromMessages` + `EditedFilesBar.vue`,
`renderAgentAvatar`, `useRosterStore` + `useLibraryList`,
`resolveBoundAgentQueryOptions`, `ConversationStore`, `PluginViewActivator`
aggregation.

## Risks

- **`TabManager` construction coupling** (see §2) — mitigated by the
  `createChatTabEngine` extraction fallback.
- **Cross-leaf aggregation correctness** — Team Chat must register as a first-class
  participant in tab-slot/quiescing/environment aggregation, or caps and
  environment application drift. Called out as an explicit integration point.
- **Scope creep toward groups/personality** — held off by the Non-goals and the
  single-`voice`-field decision.
