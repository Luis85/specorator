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

- **Tree**: `TeamChatRoot` → `TeamRoster` (header + collapse toggle, `TeamRosterToolbar`
  search/sort, `TeamRosterRow`s, `TeamRosterEmpty`) + `TeamRailSeparator` + a main pane
  holding `TeamChatTopBar` (avatar+`PresenceDot` + voice line + model/provider chips +
  `EditedFilesStrip` + overflow menu), `TeamChatStarters`, `TeamChatEmptyPane`, and an
  opaque tab-content host. `TeamChatRoot` captures that host synchronously on mount
  (`CONTENT_HOST_KEY`) and calls back into `initTabEngine` — same leave-me-alone
  content-host contract as chat's `TabContentHost` (Vue owns the element, the engine
  `createDiv`s each DM's DOM into it, no `v-for`). The DM-switch fade is therefore
  replayed by re-adding a class (`replayDmTransition`), never by keying the host: a
  `:key` bump would strand the tab engine on a detached node.
- **Read-model**: `teamChatStore` is a `shallowRef` store (`agents`, `selectedAgentId`,
  `editedFiles`, `presence`, `activeModelLabel`, `threads`, `unread`, `activeDmIsEmpty`, plus
  the per-leaf `railCollapsed`/`railWidth`); truth stays in
  `plugin.agentRosterStore` + the tab engine. `useTeamChatEventRouting` subscribes
  SYNCHRONOUSLY during setup (a restore-time emit fired inside the root's
  `onMounted` must not be dropped) and fans the view's `TeamChatSnapshot` into the
  setters. The view is the single writer, projecting on every change
  (`emitTeamChatChange`).
- **`selectAgent` re-projects once AFTER its open resolves.** `restoreConversation` sets
  `currentConversationId` BEFORE assigning `state.messages`, and that assignment re-emits only
  the transcript — so the tab-conversation callback's snapshot froze `activeDmIsEmpty: true`
  for a hydrating DM and nothing refreshed it, stacking the starters card above a populated
  transcript. The trailing emit is deliberately UNGUARDED by the staleness check: a superseded
  or torn-down selection just re-reads live state (a null manager projects an empty snapshot),
  so there is nothing stale to publish. Any future post-open state that only the engine writes
  is covered by the same emit.
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
- **`teamChatThreadMeta`** — the roster's per-agent DM projection: last-message preview
  (the TAIL message, not `ConversationStore`'s first-user-message `preview`, which is the
  right answer for a history dropdown and the wrong one for a DM list), activity timestamp,
  and the unread derivation. Pure + synchronous — it runs inside the snapshot projection on
  every stream frame, so an unmapped/unloaded conversation is omitted, never awaited.
- **`teamChatDmActions`** — the island's engine ACTIONS (close a DM, fill the composer from a
  starter, read the thread map, clamp the rail width), kept out of the view.
- **`teamChatCallbacksFactory`** — builds `TeamChatCallbacks` from a narrow host interface
  (never imports the view, so no cycle), plus the untrusted-view-state rail-geometry reader.
- **`teamChatLeafSubscriptions`** — every leaf subscription (presence, roster, thread remaps,
  hydration banner, DM host events) behind ONE dispose+recreate handle, so a re-entrant
  `onOpen` can't leak a listener pointing at the previous mount.
- **`teamChatLeafLifecycle`** — the re-entrant-remount teardown and the Vue island mount.
- **`teamChatRestoreCompletion`** — the ordered post-restore publish step.
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
- **Unread is a per-leaf, in-memory ACTIVITY signal, not a read model.** An agent is unread
  when its thread advanced past this leaf's last-seen stamp (`updateSeenBaseline` seeds every
  newly observed agent — so leaf-open means "everything so far is seen" — and re-stamps the
  ACTIVE agent every frame, so watching a DM stream and then switching away never marks it
  unread). It resets on close: losing a badge across a restart beats persisting a wrong one,
  and it needs no new file. A dot, never a count — a count would imply per-message tracking.
- **Transcript attribution is PUSHED through the projection, never pulled.** `messageIdentity`
  is a `TranscriptSnapshot` field (an engine-pushed transient like `greeting`), set by
  `refreshDmAgentPersonas` via `TabTranscriptProjection.setMessageIdentity(persona,
  conversationId)` and driven off `projectSelectedAgentFromActiveTab` — the one event meaning
  "a tab's conversation binding changed". Pushed, because the roster store is ASYNC: the
  persona lands AFTER the transcript mounts (and again on rename / re-avatar / delete), and a
  callback read from a render computed is untracked, so it would cache its first (null) value
  and leave restored transcripts anonymous and renamed agents stale. The projection keys the
  persona by conversation id, so a rotation invalidates it rather than attributing the fresh
  thread to the previous agent; a deleted agent pushes null (the DM renders anonymously rather
  than over a name that no longer exists). Consecutive assistant messages group under one
  header, computed against the FULL message list so a "load earlier" can't grow a spurious
  header at the window edge. Non-team-chat surfaces project null and so are byte-identical —
  locked by `tests/vue/chat/transcript/messageIdentity.test.ts`.
- **An empty DM shows ONE greeting.** The transcript's shared `WelcomeBanner` renders on
  exactly the same condition as `TeamChatStarters` (`messages.length === 0`), so the
  time-of-day greeting is suppressed on this surface (`greetingForSurface`) and the
  agent-specific starters card is the empty state.
- **The rail is a listbox, not a row of buttons.** One tab stop with a roving tabindex;
  arrows move FOCUS and Enter/Space commits, because each open resolves a thread, spawns a
  runtime, and consumes an LRU slot — select-follows-focus would be destructive here. Focus
  is tracked by AGENT ID and the index derived, because the default `recent` order re-sorts
  on every `conversation:saved`: an index would silently re-point at whichever agent slid
  into that slot, so the focused row lost `tabindex="0"` and Enter opened the wrong DM.
- **A leaf reporting width 0 must not auto-collapse the rail.** The responsive collapse
  treats `0` as "not measured yet" (a deferred/hidden leaf, or jsdom), so a restore or
  un-hide can't silently collapse the rail against the user's stored preference.
- **Collapsed is EFFECTIVE (`railIsCollapsed`), never the raw preference.** The root sizes the
  grid track from it while `TeamRoster` decides what to render; branching on `railCollapsed`
  alone left a narrow leaf rendering expanded rows clipped inside a 56px track. `railNarrow`
  (layout) is intentionally not exposed — only the derived value and its setter are — so no
  component can reintroduce that split. The toggle derives its new value from the EFFECTIVE
  state too: while narrow the button reads "Expand", and inverting the stored preference
  (still false) would persist `collapsed: true` — leaving the rail collapsed once the pane
  widens, the opposite of the action taken.
- **A user-initiated DM close is NON-FORCED and resolved CROSS-LEAF.** `closeTeamChatDmTab`
  forces by default (eviction and rotation must close regardless of state), but the menu
  action passes `force: false` so `closeTabImpl` re-checks `isStreaming` INSIDE
  `runTabMutation`: the caller's pre-check is stale once the close queues behind another tab
  mutation. It also resolves the owning tab through `findConversationAcrossViews`, not the
  clicking leaf's own manager — the open coordinator single-mounts each DM and reveals it
  wherever it lives, so a same-leaf lookup silently no-ops on a DM mounted in another leaf.
- **An EMPTY thread projects zero activity.** `createConversation` stamps `updatedAt` with the
  creation time, so a provider rotation's fresh replacement would otherwise read as brand-new
  activity — showing `now` and, for an already-seeded agent, an unread badge on a DM nobody
  has typed into. (`deriveUnreadAgents`'s "empty threads are never unread" rule only holds
  because the projection reports 0.) The `lastResponseAt ?? updatedAt` fallback stays for
  NON-empty threads, whose legacy records may lack `lastResponseAt`.
- **The roster's preview/timestamp read the STORED conversation, so they refresh on
  `conversation:saved`.** The projection also fires from `onTabStreamingChanged`, which runs
  BEFORE `ConversationController.save()` commits the turn, so without that subscription the
  rail sat one turn behind (`conversation:renamed` is not a substitute — it only fires when
  the title changes). Deliberately not read from the open tab's `ChatState.messages`: that
  getter COPIES, and the projection runs per stream frame for every mapped agent.
- **Row keystrokes belong to the focused control.** The listbox handler ignores keydowns
  originating in an interactive descendant; without that, Enter/Space on a row's `⋯` button
  bubbled up, got `preventDefault`ed, and opened the DM — making the keyboard-reachable action
  menu unreachable by keyboard. The check is `nodeType`-based, NOT `instanceof Element`: a
  popout leaf's nodes come from another realm's constructors and would fail `instanceof`,
  silently reinstating the bug in exactly the window this codebase already guards elsewhere.
  (`showAgentActionMenu`'s anchor discriminator is duck-typed on `preventDefault` for the
  same reason — and NOT on `'x' in anchor`, since a `MouseEvent` carries `x`/`y` aliases.)
- **The `⋯` button is never in the tab order** (`tabindex="-1"`, always). The listbox is one
  tab stop, and a focusable descendant would make the focused row two — the composite-widget
  rule. The keyboard route to the same menu is a row-level Shift+F10 / ContextMenu gesture,
  anchored to the focused row's box.
- **The top bar's model chip resolves its LABEL, not just the value.** It goes through
  `getComposerToolbarSettings` AND the provider's `getModelOptions()`, mirroring
  `tabComposer.ts:105`; resolving only the value still rendered a raw id beside a composer
  showing the friendly name — two names for one model in a single pane.
- **Relative timestamps ride a shared, ref-counted clock** (`useRelativeClock`). `Date.now()`
  inside a computed is not reactive, so a row labelled `now` would stay `now` indefinitely;
  one module-level interval serves every mounted row and stops with the last subscriber.
- **Both action menus share `showAgentActionMenu`**, so the roster row and the top bar can't
  drift about what a DM offers — or, more importantly, what it must NOT: fork, new session,
  and `/clear` are surface-gated off and must never reappear as a menu "convenience".
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
tabs/LRU/rotation, presence, thread-meta preview/unread derivation, roster sort +
relative time, and the view's `selectAgent`/refresh/lifecycle paths) and
`tests/vue/teamChat/` (roster select, rail search/sort/preview/unread/keyboard/menu/
collapse/resize, top bar identity + presence + model chip + overflow menu, empty states
and starters, presence, view mount — shared fixtures in `fixtures.ts`). Transcript
attribution lives in `tests/vue/chat/transcript/messageIdentity.test.ts`.

## Known limitations

- **A mapped DM that isn't open shows the agent description, not its last message, until
  first opened.** `ConversationStore.loadConversations()` restores every conversation with
  `messages: []` and Team Chat pre-warms only the tabs it restores, so a closed or
  LRU-trimmed DM reaches `projectThreadMetas` with a valid conversation and no messages. The
  row still carries the correct relative timestamp (that comes from metadata), and the
  description is the same fallback a never-messaged agent shows, so it degrades gracefully.
  Closing it needs either a persisted last-message preview in the session metadata schema or
  an async hydration pass over mapped-but-closed threads — both beyond a UX pass; deferred
  pending a decision.
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
- **`TeamChatThreadStore`'s session cache can clobber a mapping synced in mid-session
  (multi-device).** `loadRooms()` reads `threads.json` once and caches `this.rooms`
  for the session; `resolveOrCreateInner` then rewrites the WHOLE file from that cache
  (`writeThreads({ ...rooms, [key]: id })`). So a `roomKey → conversationId` mapping
  another device added via Obsidian Sync AFTER this session's initial read is not in
  the cache and is dropped on the next local `resolveOrCreate` write. The clobbered
  entry's *conversation* survives on disk (it is a separate conversation file), so
  re-selecting that agent can re-adopt it through the absent-mapping recovery
  (`findAdoptable` → provider-scoped orphan). Narrow: requires an external/sync writer
  updating `threads.json` between this leaf's first read and its next write. Documented,
  not fixed (human decision, Round-63). Fix direction: re-read + merge `threads.json`
  from disk inside the serialized write (in place of writing from the session cache),
  so a concurrently-synced mapping is preserved rather than overwritten.
