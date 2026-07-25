# Team Chat Feature

A main-area, MS-Teams-style surface (increment 1) for **1:1 DM chats** with roster
agents: a left roster rail, a single active DM pane, and an agent identity + files
top bar. It reuses the sidebar chat engine wholesale — a Team Chat DM is an
ordinary chat-kind tab — so streaming, tools, plan mode, images, persona
injection, subagent rendering, and edited-files tracking are inherited, not
re-coded (design spec `docs/superpowers/specs/2026-07-24-team-chat-design.md`).

**The human is the only orchestrator** (PRD R1, "do not out-orchestrate the
provider"): you address one agent at a time; agents never talk to, delegate to, or
trigger each other. Group rooms are increment 2 — only the thread store's room-key
shape is reserved (`TeamChatThreadStore.ts:175`).

## Intent

Each DM is a `Conversation` bound to a roster agent (`boundAgentId`,
`surface: 'team-chat'`) running on the **agent's own** provider + model. The
provider is resolved through the roster policy **before** the conversation is
created (`resolveTeamChatAgentProvider` → `resolveAgentProvider`), then passed to
`createTeamChatDmConversation` → `plugin.createConversation`. Order is load-bearing:
`resolveBoundAgent` forwards the agent's model only when the conversation already
runs on that model's provider, so a naive `providerOverride ?? default` would
silently drop a cross-provider model (`createTeamChatDmConversation.ts:6`).

## Host & islands

`TeamChatView` (`ItemView implements ChatViewHandle`, `VIEW_TYPE_TEAM_CHAT`) is a
**leaf-owned Vue island** over a **fresh per-leaf Pinia** (`createTeamChatPinia`)
AND a **fresh per-leaf `TabManager`** — deliberately NOT the sidebar's singleton,
because the plugin enumerates multiple Team Chat leaves and a shared store/manager
would let one leaf's projection overwrite another's (`ui/vue/globalPinia.ts`).

- **Tree**: `TeamChatRoot` → `TeamRoster` (rows: `TeamRosterAvatar` + name/desc +
  `PresenceDot`) + a main pane holding `TeamChatTopBar` (`TeamRosterAvatar` + voice
  line + `EditedFilesStrip`) over an opaque tab-content host. `TeamChatRoot`
  captures that host synchronously on mount (`CONTENT_HOST_KEY`) and calls back into
  `initTabEngine` — same leave-me-alone content-host contract as chat's
  `TabContentHost` (Vue owns the element, the engine `createDiv`s each DM's DOM into
  it, no `v-for`).
- **Read-model**: `teamChatStore` is a `shallowRef` store (`agents`,
  `selectedAgentId`, `editedFiles`, `presence`); truth stays in
  `plugin.agentRosterStore` + the tab engine. `useTeamChatEventRouting` subscribes
  SYNCHRONOUSLY during setup (a restore-time emit fired inside the root's
  `onMounted` must not be dropped) and fans the view's `TeamChatSnapshot` into the
  setters. The view is the single writer, projecting on every change
  (`emitTeamChatChange`).
- **`selectedAgentId` is a PURE PROJECTION of the active tab** — derived from the
  active DM's `boundAgentId` in `projectSelectedAgentFromActiveTab`
  (`TeamChatView.ts:207`), never set optimistically. So the roster highlight and the
  right-pane empty state (`!selectedAgentId`) always track the DM the pane is
  actually showing, even across a cross-leaf reveal, a failed open, or the tab cap.
  `TeamRoster`/`TeamChatTopBar` resolve the active agent object from
  `agents` + `selectedAgentId` (no dedicated `activeThread` slice).

## Engine-reuse seam

Team Chat reuses the **untouched** chat engine (`TabManager`, controllers,
`ChatState`, the transcript/composer/tab-chrome islands). The engine only ever
reaches `{ leaf, getTabManager() }`, so a second host is reuse, not a fork.

- **Enumeration.** `plugin.getAllViews()` enumerates BOTH `VIEW_TYPE_SPECORATOR`
  and `VIEW_TYPE_TEAM_CHAT` (`src/main.ts:817`), so every broadcast/lifecycle site
  (runtime shutdown, provider-availability + settings refresh, conversation-delete
  quiesce/repair, `findConversationAcrossViews`, env restarts) reaches Team Chat DM
  runtimes for free. `plugin.getView()` stays **sidebar-scoped** by design
  (`src/main.ts:806`) — it answers "the active *sidebar* conversation" for
  `getActiveConversationSnapshot` and slot/new-tab logic, which a Team Chat leaf
  must never hijack.
- **Core-safe handle.** Reached through `ChatViewHandle` / `ChatTabManagerHandle`
  (`src/core/types/PluginContext.ts`) so `core/` never imports feature types —
  e.g. the cross-leaf `getAllTabs()` uses the neutral
  `{ conversationId, state:{isStreaming} }` shape (`PluginContext.ts:53`), not
  `TabData`.
- **Reused-island actions rebased onto the owning tab.** Several transcript/composer
  actions resolve their target through the global sidebar view; on the team-chat
  surface they are gated or rebased (see the surface-gating invariant below).

## Modules

- **`TeamChatThreadStore`** — the `roomKey → conversationId` map at
  `.specorator/team-chat/threads.json`. All mutations serialize **store-wide** (one
  tail-chained queue — `writeAtomic` uses a single fixed `.tmp`, and two resolves
  for one agent must not each create). `resolveOrCreate` reuses a usable mapping
  (exists AND on the expected provider), else rotates: a **present-but-stale**
  mapping creates fresh (never adopts — an A→B→A rotation must not resurrect an
  archived transcript), an **absent** mapping adopts a provider-scoped orphan or
  creates. Persistence order is write-then-swap-cache-then-emit
  (`TeamChatThreadStore.ts:129`): the durable write is first (a rejecting write
  leaves the cache unmutated for a clean retry), the cache swaps before the emit (a
  synchronous `teamChat:threads-changed` subscriber sees the new mapping),
  reusing an un-persisted replacement across a failed write (`pendingCreated`).
  Built by `teamChatThreadStoreFactory` and homed as the single plugin-scoped store
  (`plugin.getTeamChatThreadStore()`, `src/main.ts:780`).
- **`TeamChatDmOpenCoordinator`** — plugin-scoped (WeakMap-homed), serializes DM
  opens **per `conversationId` across all leaves**. `resolveOrCreate` serializes the
  *mapping* but not the tab *open* that follows: without this, two callers resolve
  the same id, both see `findConversationAcrossViews == null`, and both `createTab`
  → two controllers on one DM (concurrent streams corrupt it). The queued second
  caller re-runs, finds the tab, and switches.
- **`teamChatDmTabs`** — the open/restore/eviction/rotation mechanics kept out of
  the view: `openResolvedTeamChatDm` (the serialized open body — reuse-or-create,
  cross-leaf reveal, budget check), `restoreTeamChatDmTabs` (guarded restore),
  `reconcileRotation` + `closeRotatedDmTab` (provider-change old-tab close), the LRU
  budget (`resolveMaxTeamChatDms`, `pickLruDmEviction`, `evictLruDmIfNeeded`,
  `touchDmRecency`), and `closeTeamChatDmTab` (the one place a DM tab is
  programmatically closed — force-closes AND broadcasts `teamChat:presence`, since a
  force-close skips the streaming callback).
- **`teamChatDmRefresh`** — DM-scoped mirrors of `SpecoratorView`'s cross-tab
  refresh loops (model/usage recompute, edited-files setting, hidden commands,
  provider rotation, deleted-agent notice, restored-DM provider reconcile), reusing
  the sidebar's exact per-tab helpers rather than a drifting second copy.
- **`resolveTeamChatAgentProvider`** — the one roster-policy provider resolver
  shared by DM creation AND the thread store's rotation gate (a drift would let the
  reuse gate disagree with what creation built).
- **`createTeamChatDmConversation`** — provider-first DM creation (above).
- **`teamChatPresence`** — the idle/busy projection.
- **`activateTeamChat`** — reveal-or-open the main-area leaf (mirrors
  `activateLibrary`); `loadIfDeferred` before an optional `selectAgent(agentId)`.

## Invariants & Gotchas

- **Provider is immutable per conversation → a provider change ROTATES to a fresh
  DM.** The old DM is left orphaned, never deleted (its transcript survives as
  history). Rotation **preserves the active DM**: a background `roster:changed`
  rotation of a non-focused DM opens quietly (`preserveFocus` →
  `resolveRotationOpen.activate` is false unless the rotated DM is the one in focus),
  so a sync doesn't yank the pane off the DM the user is reading. It **reuses the
  displaced tab's slot** — `evictLruDmIfNeeded` excludes `displacedConversationId`
  from the budget count, so the rotation doesn't force-close an unrelated hot DM, and
  `reconcileRotation` closes the old tab only *after* the replacement is open (a
  cap-blocked rotation's stale tab is closed on the retry that finally opens the
  replacement — `displacedDmByAgent`).
- **Bounded hot-DM budget** (`maxTeamChatDms`, default 5 in `defaultSettings.ts:62`,
  floored at 2). Team Chat DMs pass `bypassTabLimit: true`, so the shared
  `maxChatTabs` never gates them — the LRU is the sole constraint. `pickLruDmEviction`
  skips the active tab, the one being opened, AND **streaming** DMs (force-closing a
  live turn would truncate the background response). If nothing idle is evictable
  (every inactive DM is mid-turn), `evictLruDmIfNeeded` returns false and the open
  surfaces `teamChat.tabCapReached` rather than spawning an over-budget runtime — no
  over-budget `createTab`. `autoCreateOnEmpty = false` (`TeamChatView.ts:193`): an
  empty Team Chat is roster + empty pane, never a blank unbound tab (which the
  composer would mint into an ordinary chat). An evicted DM's mapping persists, so
  re-selecting its agent reopens it.
- **Surface-driven action gating** (`isTeamChatSurfaceConversation`,
  `src/features/chat/controllers/teamChatSurface.ts`). A DM's thread is fixed per
  agent, so fork (`tabControllers.ts` `canFork` + the message-fork button's
  `isForkEligible`), `$`-resume (`InputController` `isResumeDisabled`), `/clear`
  (`runClearCommand`), and post-plan **new-session** (`resumeApprovedPlanFromExitMode`
  — the approved plan runs in THIS thread) are disabled on the team-chat surface;
  each would otherwise mint an unbound conversation that escapes the surface filter
  and desyncs the room map. Message-action targeting also rebases onto the owning
  tab (`resolveActionConversationId`), since `getActiveConversationSnapshot()` reads
  the sidebar view. Non-team-chat surfaces are byte-identical to before.
- **`roster:changed` reconciliation** (`reconcileDmsOnRosterChange`, subscribed
  onOpen). Runs `refreshProviderAvailability` — un-grey each open DM (re-probe
  availability, detach stale runtime) + `refreshBoundAgentDisplayModels` (a
  *same-provider* model change doesn't rotate, so the selector must recompute) +
  `rotateChangedDmProviders` (rotate any DM whose agent was re-pointed at another
  provider) — then the **deleted-agent** notice (`noticeRemovedAgentDms`, deduped
  through a per-conversationId set). The **send-side** read-only block is
  `InputController`'s `teamChatDmBoundAgentId` guard (`InputController.ts:290`): a DM
  whose agent left the roster blocks the turn (it would run without the agent's
  persona/model) and is self-healing on agent re-creation.
- **Presence is a cross-leaf projection.** `projectCrossLeafPresence` aggregates
  streaming DM tabs across ALL chat leaves (the open coordinator single-mounts each
  DM in one leaf, so an agent streaming in leaf A must show `busy` in leaf B),
  surface-filtered to `surface === 'team-chat'` (an ordinary sidebar chat launched
  with a roster agent also carries `boundAgentId`, but must not light the roster
  dot). Pure — recomputed on each `emitTeamChatChange` and on the `teamChat:presence`
  broadcast, no map to reconcile. Base idle/busy only.
- **Teardown / restore.** `TabManager.destroy` sets `isDestroying` synchronously and
  `drainThenDestroy`s (per-conversation saves + full controller/island disposal, not
  the leaky runtime-only path). Every in-flight `selectAgent` open guards on
  `isSelectionStale` (`selectionGeneration` bump + manager-identity check), so a
  superseded select or a torn-down/replaced manager (re-entrant `onOpen`, `onClose`)
  is a silent no-op instead of a `createTab` into a dead manager. Restore
  (`restoreTeamChatDmTabs`) adds the guards `TabManager.restoreState` lacks:
  validates each tab is a real DM (`surface === 'team-chat'` AND `boundAgentId` —
  else a synced/hand-edited `surface:'chat'` tab would escape the surface
  protections), honors the Team Chat budget (`trimRestorableDmsToBudget`), dedups
  cross-leaf per `conversationId`, and creates no blank fallback. After restore the
  view emits `chat:tabs-changed` so the Agent Board work-order queue re-ticks
  (`TeamChatView.ts:240`).
- **Work-order capacity: a Team Chat leaf NEVER hosts work-order tabs** (it creates
  chat-kind DM tabs only). `PluginViewActivator.getTabSlotUsage` therefore
  **allowlists `VIEW_TYPE_SPECORATOR`** as the WO-hosting host
  (`PluginViewActivator.ts:128`) — a mid-restore Team Chat leaf must not trip the
  `anyMidRestore` gate and stall the whole work-order queue. (Allowlisting the
  WO host also excludes any future non-WO view type by default.)
- **Persistence isolation.** Team Chat's DM layout is leaf-owned via per-leaf
  `getState()` / `setState()`, round-tripped through Obsidian view state. It NEVER
  writes the global `persistTabManagerState()` slot (the sidebar's fallback), so two
  Team Chat leaves can't clobber each other or the sidebar's restore.
- **Avatars are image-first.** `TeamRosterAvatar` renders through the shared
  `renderAgentAvatar` (`avatarImage` → emoji → icon → initials → default,
  `agentAvatar.ts:37`); a missing/renamed image falls through so it never blanks the
  chip. Rendered into a template ref via `watchEffect` so an avatar edit re-renders
  in place.

## Storage

| Path | Contents |
|------|----------|
| `.specorator/team-chat/threads.json` | `roomKey → conversationId` DM map (`{ version, rooms }`); `roomKey === agentId` in increment 1 |

## Tests

`tests/unit/features/teamChat/` (thread store + factory, open coordinator, DM
tabs/LRU/rotation, presence, and the view's `selectAgent`/refresh/lifecycle paths)
and `tests/vue/teamChat/` (roster select, top bar — identity + provider chip +
edited-files strip, presence, view mount).

## Known limitations

- **Spurious LRU eviction under a rare full-budget race.** When the hot-DM budget
  is full and a new-agent selection's eviction is mid-flight (the victim's async
  save/close), a second click on an ALREADY-OPEN DM supersedes the first: the first
  selection still commits the eviction, then aborts without opening (superseded),
  while the second merely switches to its existing tab and never needed the freed
  slot — so one LRU DM is evicted unnecessarily. Self-recovering: the evicted DM's
  mapping persists, so re-selecting its agent reopens it. The per-leaf selection
  serialization (`selectionOpenTail`) + the pre-close staleness check cover the
  common cases; this residual is the generation bump landing DURING the awaited
  close. Left as-is by decision (benign + rare); a create-before-evict reordering
  would close it.
- **Live provider-rotation is edge-case-dense.** Auto-rotating a DM to a fresh
  thread when its agent's provider changes (retained per spec §4) is inherently
  intricate — reload recovery, streaming-turn interruption, active-DM focus
  preservation, and displaced-slot reuse are each handled, but the class stays
  narrow-edge-prone. A simpler "provider changed — reopen to switch" affordance
  (matching the app's existing new-chat-to-change-provider rule) would retire the
  class; deferred. Two concrete residuals of that density are the next two entries.
- **Overlapping provider rotations can strand the middle DM.** During a RAPID A→B→C
  re-point of one agent's provider, two `roster:changed` reconciliations overlap: the
  second observes B as `previousConversationId` while its collected
  `displacedConversationId` still names A, so the `displaced ??` fallback discards B.
  The first rotation closes A; the second opens C without activating it and tries to
  close A again — leaving B's runtime on the now-stale provider. Self-recovering (the
  next `roster:changed`/select re-rotates B, since its `providerId` ≠ expected) and
  requires re-pointing one agent's provider three times with overlapping
  reconciliations. Serializing `resolveOrCreate` + collection onto the selection tail
  would close it; left as-is (bizarre input + recoverable).
- **Composer attachments aren't reserved before the removed-agent roster read.** The
  reserve-before-await (the removed-agent DM send/steer guard) snapshots only the
  composer TEXT; images and file/mention pills are read LIVE at turn-build
  (`buildTurnSubmission` reads the context managers with no chokepoint). So adding an
  attachment during that sub-second roster await misattributes it to the
  already-submitted turn and drops it from the next draft. A clean reserve would have
  to restructure the turn-build attachment path (`buildTurnSubmission`'s signature +
  both call sites + a selective clear + the init-failure rollback) — disproportionate
  to the window; left as-is.
- **A queued DM can be lost if its agent is deleted mid-steer-dispatch.** The steer
  path reserves the queued message before its removed-agent roster read, but the
  actual send is deferred one macrotask (`dispatchQueuedMessage`'s `setTimeout` →
  `requestSend`). If the agent is deleted in that window, the deferred content-override
  send is rejected by `InputController`'s authoritative removed-agent guard, and
  because it consumed no textarea its rollback can't restore the queued text/images.
  Sub-second window + requires deleting the agent exactly as a steer dispatches; the
  content is user-recoverable by re-typing.
