# Chat Feature

Main sidebar chat interface. `SpecoratorView` assembles tabs, controllers, provider-backed services, and three Vue 3 + Pinia islands around the shared `ChatRuntime` boundary. The outer frame — header, tab-badge strip, and tab-content host (ADR 0005 sub-project 1) — the per-tab transcript rendering (`MessageRenderer` + block renderers, ADR 0005 sub-project 2), AND the per-tab composer (toolbar, chips, textarea host, ADR 0005 sub-project 3) are now Vue islands under `ui/vue/`, mounted over the untouched imperative engine (`TabManager`, controllers, `ChatState`, stream-consumption state machines). See "Chat Shell Vue Island", "Transcript Vue Island", and "Composer Vue Island" below. Still-imperative: the remaining side panels (status panel, navigation sidebar) — the final sub-project.

## Provider Boundary Status

- Chat features depend on `ChatRuntime`, `ProviderCapabilities`, and provider-neutral conversation data. `InputController` builds `ChatTurnRequest`; runtimes own prompt encoding through `prepareTurn()`.
- Session bookkeeping lives in `Conversation.providerState` and is usually updated through `ChatRuntime.buildSessionUpdates()`, with fork/bootstrap state also seeded through provider history services. Feature code must not read provider-specific fields directly.
- Provider-owned services are resolved through registries
  - `ProviderRegistry`: runtime, title generation, instruction refinement, inline edit, task-result interpretation
  - `ProviderWorkspaceRegistry`: command catalogs, agent mention providers, MCP managers, CLI resolution
- Current feature split (capability flags in `src/providers/<id>/capabilities.ts`; illustrative, not exhaustive)
  - Claude exposes rewind, fork, plan mode, instruction mode, runtime command discovery, in-app MCP controls, `/` commands, `$` skills, and subagents
  - Codex exposes fork, history reload, plan mode, instruction mode, images, inline edit, `$` skills, and subagents, but not rewind or in-app MCP
  - Opencode exposes plan mode (managed `plan` mode; post-plan approval card gated), runtime-discovered slash commands, subagents, and Opencode-managed MCP, but not fork or rewind
  - Cursor exposes plan mode, history reload, images, and inline edit, but not fork, rewind, in-app MCP, or subagents

## Architecture

```text
SpecoratorView (lifecycle + assembly)
├── SpecoratorViewWorkOrderBridge (Agent Board integration: task-run tab launch + commit-turn routing)
├── ChatState
├── Controllers
│   ├── ConversationController
│   ├── StreamController
│   ├── SubagentStreamCoordinator
│   ├── ProviderLifecycleSubagentCoordinator
│   ├── InputController
│   ├── InlinePromptController
│   ├── ChatDropController
│   ├── SelectionController
│   ├── BrowserSelectionController
│   ├── CanvasSelectionController
│   └── NavigationController
├── Services
│   ├── SubagentManager
│   └── BangBashService
├── Transcript Vue island (ui/vue/transcript/, ADR 0005 sub-project 2)
│   ├── TranscriptRoot → MessageList (windowed) → MessageBubble → BlockList
│   │   ├── TextBlock / ThinkingBlock / ToolCall / WriteEditView + DiffView
│   │   ├── TodoListView / WebSearchView / AskQuestionResult / SubagentBlock
│   │   └── ContextCompactedMarker / RuntimeErrorCard
│   ├── cards/ (MessageActionBar, MessageContextCard, MessageImages, WorkOrder*Card)
│   ├── StreamingIndicator (reactive isThinking/isWriting/elapsed)
│   ├── MarkdownHost (async Obsidian markdown seam, generation token)
│   └── inline/ (InlineApproval, InlineAskUserQuestion, InlineExitPlanMode, InlinePlanApproval)
├── Tabs
│   ├── TabManager
│   ├── TabProviderCommandCoordinator
│   └── Tab
├── Composer Vue island (ui/vue/composer/, ADR 0005 sub-project 3)
│   ├── ComposerRoot → ComposerWrapper (toolbar + chips + textarea host)
│   ├── ComposerToolbar → 9 widgets (Model/Mode/Thinking/ServiceTier/…)
│   ├── context/ (FileChips, ImageChips, SelectionIndicators host)
│   └── dropdowns/ (Slash/Mention/ResumeSession, coordinator-driven)
└── UI Components
    ├── FileContextManager
    ├── ImageContextManager
    ├── StatusPanel
    ├── ConversationHistoryView
    ├── NavigationSidebar
    ├── InstructionModeManager
    └── BangBashModeManager
```

## Chat Shell Vue Island

The outer frame — header, tab-badge strip, and tab-content host — is a Vue 3 +
Pinia island under `ui/vue/` (ADR 0005, mirroring the Agent Board's ADR 0004
seam). `SpecoratorView.mountChatShell()` mounts `ChatShellRoot.vue` into
`viewContainerEl` via a per-leaf `createApp` (Pinia singleton from
`ui/vue/globalPinia.ts`); the engine — `TabManager`, controllers, `ChatState`,
and each tab's imperative DOM — is untouched and mounted afterward into the
Vue-provided content host.

- **Store**: `ui/vue/stores/chatShellStore.ts` (`useChatShellStore`) is a
  reactive read-model over `TabManager` — `tabs: TabBarItem[]`, `header`
  chrome (title, boundAgent, activeProviderId, tabBarPosition, visibility
  flags), and `activeTabId`. Setters replace whole values/arrays (`shallowRef`)
  so a change fires the watch without deep-proxy overhead; I/O and truth stay
  in `TabManager`.
- **Event routing**: `ui/vue/useChatShellEventRouting.ts` subscribes once on
  mount and pushes a fully-projected `ChatShellSnapshot` (`tabs`, `header`,
  `activeTabId`) into the store's setters, disposing on unmount. It never
  invents new events — `SpecoratorView` still owns the real `TabManager`
  callbacks (`onTabCreated` / `onTabSwitched` / `onTabClosed` /
  `onTabStreamingChanged` / `onTabTitleChanged` / `onTabAttentionChanged` /
  `onTabConversationChanged` / `onTabProviderChanged`) and re-projects on each
  one via `emitChatShellChange()`, which fans out through the
  `ChatShellSubscribe` seam (`ui/vue/chatShellCallbacks.ts`) that
  `useChatShellEventRouting` subscribes to.
- **Callbacks contract**: `ChatShellCallbacks` (`ui/vue/chatShellCallbacks.ts`,
  provided via `CALLBACKS_KEY`) is the Vue→engine seam — thin delegators
  (`onTabClick`, `onTabClose`, `onNewTab`, `onOpenHistory`,
  `onOpenWorkOrders`, `onQuickActions`, `onRename`, `mountHistoryHost`,
  `mountWorkOrderHost`, `mountGitActionHost`, `resolveNavRowEl`,
  `renderProviderLogo`, …) to existing `SpecoratorView` / `TabManager`
  methods. Vue never reaches into the engine directly.
- **Content-host seam**: `TabContentHost.vue` renders the
  `specorator-tab-content-container` element once and hands it to the engine
  via `CONTENT_HOST_KEY` on mount (captured synchronously before
  `initTabContentEngine()` runs). Vue owns the element but treats its children
  as opaque — no `v-for`, never re-rendered — so the imperative `tabFactory`
  can keep `createDiv`-ing each tab's `specorator-tab-content` subtree into it
  and toggling `specorator-hidden` on switch, with every tab's live streaming
  DOM and scroll position surviving shell re-renders. Same "leave-me-alone
  host" contract as the Agent Board's lane-editor mount.
- **Dual-mode header + nav-row Teleport**: `store.header.tabBarPosition`
  (`'header'` | `'input'`, projected from `plugin.settings.tabBarPosition`)
  drives `ChatHeader.vue`'s layout. In `'header'` mode the tab strip and
  header actions render in place in the header chrome. In `'input'` mode they
  `<Teleport>` into the active tab's `navRowEl` (resolved via
  `cb.resolveNavRowEl(activeTabId)`), re-targeting reactively when the active
  tab changes; a null target (no active tab yet) disables the Teleport and
  falls back to in-place rendering rather than erroring on a missing target.
- **Still imperative**: the conversation-history and work-order-activity
  dropdowns (`ConversationHistoryView`, the work-order dropdown) and the
  `GitActionButton` are unchanged imperative widgets — `HeaderActions.vue`
  exposes container refs and the callbacks (`mountHistoryHost`,
  `mountWorkOrderHost`, `mountGitActionHost`) host them into the Vue tree
  ("island hosts imperative widget"). They migrate to Vue with a later
  sub-project (side panels).
- **Out of scope for this island**: transcript rendering migrated separately in
  ADR 0005 sub-project 2 (see "Transcript Vue Island" below), and the composer
  in ADR 0005 sub-project 3 (see "Composer Vue Island" below). The remaining
  side panels (status panel, navigation sidebar) stay imperative — the final
  sub-project of the larger chat Vue migration (see ADR 0005 and
  `docs/superpowers/specs/2026-07-11-chat-shell-vue-migration-design.md`).

## State Flow

```text
User Input
  -> InputController
  -> ensure runtime for active provider
  -> ChatRuntime.prepareTurn()
  -> ChatRuntime.query()
  -> StreamController
  -> mutate the in-flight ChatMessage's contentBlocks/toolCalls as DATA
  -> ChatState persistence + TabTranscriptProjection.emit()
  -> Vue TranscriptRoot renders from the reactive store
```

The feature layer consumes provider-neutral `StreamChunk` values. Providers own prompt encoding, history/session fallback, and task-result interpretation. There is no separate live-render path: the streaming turn is an ordinary `ChatMessage` whose `contentBlocks`/`toolCalls` grow as data during the turn, and the Vue transcript renders it through the same components as any stored message.

## Controllers

| Controller | Responsibility |
|------------|----------------|
| `ConversationController` | Session switching, history reload, save, and rewind. Delegates the history-dropdown list UI to `ConversationHistoryView` (in `ui/`), passing it the two lifecycle escapes — `switchTo` and `loadActive` — as callbacks |
| `StreamController` | Consume stream chunks, update streaming state, auto-scroll, abort handling. Delegates subagent chunks (`tool_use`/`tool_result`/`subagent_*`/`async_subagent_result`) to the two subagent coordinators |
| `SubagentStreamCoordinator` | The `SubagentManager`-mediated Task subagent state machine (sync/async Task, child `subagent_*` chunks, `TaskOutput`, async hydration/retry, Task tool-call ↔ subagent linking). Reached via `StreamController`'s `dispatchToolUse`/`handleToolResult`/`handleSubagentChunk`/`handleAsyncSubagentResult` delegations; streaming primitives arrive as `deps` callbacks |
| `ProviderLifecycleSubagentCoordinator` | Provider lifecycle subagents (spawn → wait/close) for CLI providers; owns the spawn-callId/agentId tracking maps. Distinct mechanism from the `SubagentManager` Task path above |
| `InputController` | Text input, mentions, images, resume dispatch, command dispatch, and post-plan approval flow. Delegates the inline blocking prompts (tool approval, ask-user, exit-plan-mode, post-plan approval) to `InlinePromptController` |
| `InlinePromptController` | Inline prompts that block a turn on user input — tool-approval cards, ask-user-question, exit-plan-mode, post-plan approval — plus the input-container hide/restore and the "needs attention" tab badge. Reached through `InputController`'s RuntimeHost-wired delegators |
| `SelectionController` | Editor selection polling and CM6 decorations |
| `BrowserSelectionController` | Browser view selection tracking |
| `CanvasSelectionController` | Canvas selection tracking |
| `ChatDropController` | Drag-and-drop lifecycle for one chat tab — overlay, payload routing, vault/external/image dispatch |
| `NavigationController` | Vim-style keyboard navigation |

## Transcript Vue Island

The per-tab transcript — every stored and live turn — is a Vue 3 + Pinia island
under `ui/vue/transcript/` (ADR 0005 sub-project 2, mirroring the shell island's
sub-project 1 seam one level deeper, into each tab's `messagesEl`). The
imperative top-level/stored renderers and the DOM-patching streaming write-side
were deleted; only detached lifecycle adapters still used by the stream
coordinators remain under `rendering/`. Transcript output changed from raw DOM
mutation to reactive-data mutation; `TabManager`, controllers, `ChatState`, and
`StreamController` keep ownership of lifecycle and block transitions.

- **Mount**: `mountTranscript(containerEl, plugin, component, callbacks)` (per
  tab, mirror of `mountChatShell`) `createApp(TranscriptRoot)` + a FRESH per-leaf
  `createTranscriptPinia()` (never a shared singleton — each tab owns its own
  `ChatState.messages`), provides `APP_KEY`/`COMPONENT_KEY`/`PLUGIN_KEY`/
  `CALLBACKS_KEY`, and captures the Vue-rendered `.specorator-messages` scroll
  element through `SCROLL_HOST_KEY` so the imperative engine (StreamController
  auto-scroll, NavigationController scan, drop overlay) keeps a direct handle.
- **Store**: `ui/vue/transcript/stores/transcriptStore.ts` — `messages` +
  `activeStream` + welcome/loading/hydration transients, all `shallowRef`
  (whole-value replacement, no deep-proxy). Truth + I/O stay in `ChatState`.
- **Projection seam + identity**: `tabs/tabTranscript.ts`'s
  `TabTranscriptProjection` is the per-tab `TranscriptCallbacks.subscribe`
  source (mirror of the shell's `emitChatShellChange`). It fans a fully-projected
  `TranscriptSnapshot` (`conversationId`, monotonic `projectionRevision`,
  `messages`, `activeStream`, greeting, loadingText, hydrationError) to every
  observer. `TranscriptRoot` resets window/scroll state when conversation
  identity changes and ignores stale revisions. Emit points are `emit()` (streaming
  transitions + message add/remove, called from `InputController`/coordinators),
  `setGreeting`/`setLoadingText`/`setHydrationError` (engine-pushed transients),
  and `refreshMessage(id)` (off-stream mutations).
- **Message-identity-refresh reactivity contract (the C1/C2 fix)**: the engine
  mutates the SAME `ChatMessage` object IN PLACE (`msg.content += chunk`,
  `contentBlocks.push`, `toolCall.result = …`), so the object identity never
  changes — but `MessageBubble` is a keyed `v-for` child, so an unchanged
  identity makes Vue skip the patch and the live turn renders blank. On each
  snapshot the projection gives the actively-streaming message (`activeMessageId`)
  AND any off-stream-dirtied message (`refreshMessage`, chiefly async/background
  subagent completions) a fresh identity — including fresh tool-call and nested
  `subagent` references, since those reach `ToolCall`/`SubagentBlock` by object
  reference. Snapshot-only: the clone never touches `ChatState.messages`, so the
  engine's live `msg` keeps growing the original. `tests/vue/chat/transcript/`
  `liveMutation.regression.test.ts` locks C1 (live growth of the streaming
  object) and C2 (async subagent completing on a non-active message).
- **`.specorator-*` DOM contract**: Vue owns the transcript DOM but FOUR
  still-imperative consumers read it by class/attribute and are out of scope —
  `NavigationController`/`NavigationSidebar` (scan `.specorator-message-user` +
  `offsetTop`), the three selection controllers, `ChatDropController` (overlay),
  and `StreamController` auto-scroll (`.specorator-messages`). The components
  therefore emit the exact legacy `.specorator-*` classes/attributes alongside
  the `.specorator-vue` baseline. `domContract.test.ts` mounts the real
  `TranscriptRoot` over a fixture exercising every block type + user/assistant +
  streaming + chrome and asserts every consumer-queried class/attribute — the
  regression backstop until the composer/side-panel sub-projects migrate too.
- **`MarkdownHost` async seam**: the single Vue-hostile surface. It owns one
  element, treats its children as opaque (no `v-for`, never diffed), re-renders
  through Obsidian's async `MarkdownRenderer` on text change, and drops stale
  renders with a monotonic generation token (renders into a detached element,
  swaps only after the token check). `nodeType`/`ownerDocument` guards keep
  popout leaves safe.
- **Inline blocking cards** (`inline/`): `InlinePromptController` still owns the
  promise the runtime awaits + the composer-hide (ref-counted) + `needsAttention`
  badge; the Vue card (`InlineApproval` / `InlineAskUserQuestion` /
  `InlineExitPlanMode` / `InlinePlanApproval`) is mounted via the
  `mountInlineCard` seam, captures input, and calls an injected `resolve`.
  Abort/`dismissPendingApproval` resolves the promise with `null` (never rejects).
  Both plan cards share `useInlinePlanCard` for focus, keyboard delegation,
  optional abort, unmount, and exactly-once resolution.
- **Runtime errors**: `RuntimeErrorCard.vue` renders the classified
  runtime-error card — `classifyRuntimeError` (cli-not-found / unauthenticated /
  context-too-large / generic) with open-settings, provider login hint, and real
  retry re-dispatch through the callbacks seam.
- **Migration-debt cleanup**: top-level/stored shadow renderers and the obsolete
  `toolCallElements` DOM map are gone. Tool name/summary/blocking logic and web
  search branching are shared DOM-free view models consumed by Vue and the
  remaining detached subagent adapter. Auto-turn retry suppression consistency
  remains a tracked parity follow-up; custom streaming-indicator text is now
  projected through `ActiveStreamState.label`.
- **`ThinkingRenderCoordinator`** / **`ProviderLifecycleSubagentCoordinator`**: streaming thinking and provider-lifecycle spawn tools mutate reactive `ChatMessage` data only; Vue's `ThinkingBlock` / `blockListViewModel.projectProviderLifecycleSubagent` render the cards (no imperative subagent/thinking DOM).

## Composer Vue Island

The per-tab composer — the input toolbar (nine widgets), file/image/current-note
chips, the edited-files bar, the wrapper-mode classes, the textarea host, and the
caret-anchored slash/mention/resume dropdowns — is a Vue 3 + Pinia island under
`ui/vue/composer/` (ADR 0005 sub-project 3, the shell/transcript island seam
pushed into each tab's `composerHostEl`). The imperative `InputToolbar`,
`ui/toolbar/*` pure-render widgets, `FileChipsView`, `EditedFilesView`, and the
composer's imperative DOM assembly were deleted or reduced to state-only;
`InputController`, `tabInputWiring`, every controller, and `ChatState` are
unchanged. The engine still owns truth + I/O; only the composer *output* changed
from DOM assembly to reactive-data projection.

- **Mount**: `mountTabComposer(tab, plugin, component, toolbarWiring)`
  (`tabs/tabComposerMount.ts`, per tab, mirror of `mountTranscript`) constructs
  the projection + the `ComposerDropdownCoordinator`, builds the toolbar-action
  callbacks, then calls `mountComposer(composerHostEl, …)`
  (`ui/vue/composer/mountComposer.ts`) — `createApp(ComposerRoot)` + a FRESH
  per-leaf `createComposerPinia()` (never a shared singleton — each tab owns its
  own input state). It runs BETWEEN `createTab` and `initializeTabUI`, so the
  child SFCs' `onMounted` registers (`register*`) write every `tab.dom.*` handle
  before any controller reads them. A rejected toolbar action surfaces a `Notice`
  (restoring the deleted widgets' behavior), then re-projects.
- **Store**: `ui/vue/composer/stores/composerStore.ts` (`useComposerStore`) is a
  reactive read-model over one tab's composer — `toolbar` / `chips` /
  `editedFiles` / `streaming` / `dropdown` / `inputMode` / `draftMeta` /
  `wrapperMode`, all `shallowRef` (whole-value replacement, no deep-proxy). Truth
  + I/O stay in `InputController` / `ChatState` / the toolbar-setting owners / the
  context + mode managers. Two subtleties: `wrapperMode` OWNS the three
  `.specorator-input-*-mode` wrapper classes (`ComposerWrapper` binds
  plan/instruction/bang-bash) — the engine's former imperative `classList.toggle`
  is gone, so a re-patch can't drop them (locked by the DOM-contract test's
  re-projection guard); and `chips.currentNote` is projected + removed SEPARATELY
  from `chips.files` (removing it nulls `FileContextManager.currentNotePath` so
  `shouldSendCurrentNote()` stops re-attaching, whereas files/folders detach their
  pill). The store NEVER holds the draft string — the textarea `.value` is
  engine-owned.
- **Projection seam**: `tabs/tabComposer.ts`'s `TabComposerProjection` is the
  per-tab `ComposerCallbacks.subscribe` source (mirror of `TabTranscriptProjection`).
  It reads the tab lazily at emit time and fans a fully-projected
  `ComposerSnapshot` (all eight slices) to every observer; `useComposerEventRouting`
  subscribes SYNCHRONOUSLY during setup (so a same-turn emit is not dropped) and
  fans it into the store setters. Emit points: `emit()` (any composer-relevant
  engine change — settings, chips, streaming, mode, dropdown), and the toolbar
  delegators re-project after each action. External-context mutations re-project
  ASYNC through the selector's `onChange` (never a synchronous emit — the picker
  resolves on a microtask, so a sync emit would carry the stale list).
- **Callbacks contract**: `ComposerCallbacks` (`ui/vue/composer/composerCallbacks.ts`,
  provided via `CALLBACKS_KEY`) is the only Vue→engine path — the toolbar-action
  delegators (`onSetModel` / `onSetMode` / `onSetEffortLevel` / `onSetThinkingBudget`
  / `onSetServiceTier` / `onSetPermission` / `onTogglePlanMode` / `onToggleMcpServer`
  / external-context add/remove/persist), the unified `onRemoveChip(key, kind)`
  (`kind` `'current' | 'file' | 'folder' | 'image'`; `key` is a vault path except
  images, keyed by id), `onOpenImage` / `onOpenFile` / `onOpenEditedFile`, the
  dropdown navigation delegators, and the element-handle registers
  (`registerInputContainer` / `registerNavRow` / `registerInputWrapper` /
  `registerContextRow` / `registerQueueRow` / `registerInputEl` +
  `registerSelectionIndicator` / `registerBrowserIndicator` / `registerCanvasIndicator`).
  There is NO `onSend`/`onCancel` — send is keyboard-only (Enter / Mod+Enter via
  `tabInputWiring`), and there is no send button (strict parity).
- **Engine-driven hosts** (Vue renders the node, the engine owns its behavior):
  the `textarea.specorator-input` — `ComposerTextarea.vue` renders it and hands
  back the raw node; the engine owns `.value` / caret / IME composition / height
  AND `placeholder` (`TriggerInputMode` sets it directly for `#`/`!` modes), Vue
  never binds a v-model or reactive attrs. The `.specorator-input-queue-row` —
  `QueuedMessageController.updateQueueIndicator()` builds the
  `.specorator-queue-indicator-*` DOM into it and toggles its visibility; Vue
  never renders its children. The three selection indicators
  (`.specorator-selection-indicator` / `-browser-selection-indicator` /
  `-canvas-indicator`) — `SelectionIndicators.vue` renders the `<div>`s (legacy
  classes + initial `.specorator-hidden`) and hands the raw nodes to the untouched
  `SelectionController` / `BrowserSelectionController` / `CanvasSelectionController`,
  which mutate `textContent` + `.specorator-hidden` directly. Each is a
  leave-me-alone host — no `v-for`, never diffed.
- **`.specorator-*` DOM contract**: Vue owns the composer DOM but several
  still-imperative consumers read it by class or hold raw handles and are OUT of
  scope — `ChatDropController` (drop overlay on `.specorator-input-wrapper`),
  `InlinePromptController` (hides `.specorator-input-container`), the shell nav-row
  Teleport (`resolveNavRowEl` → `.specorator-input-nav-row`), the three selection
  controllers, `QueuedMessageController` (queue row), `updateContextRowHasContent`
  (reads chip `.specorator-visible-flex`, toggles `.has-content`), and
  `tabInputWiring`/`InputController` (`textarea.specorator-input`). The components
  therefore emit the exact legacy `.specorator-*` classes + register every handle.
  `tests/vue/chat/composer/composerDomContract.test.ts` mounts the real
  `mountTabComposer` over a rich projection and asserts every consumer-read class,
  every element handle, and the three engine-driven-host drives — the regression
  backstop until the side-panels sub-project migrates the remaining consumers.
- **Dropdowns**: the caret-anchored slash/mention/resume overlays are Vue
  (`ui/vue/composer/dropdowns/`), driven by `store.dropdown.kind`; keyboard
  navigation still flows through `tabInputWiring` → the detectors →
  `ComposerDropdownCoordinator` (which owns `{ kind, items, activeIndex, anchorRect }`
  and re-projects on each mutation). The chat composer delegates entirely to that
  coordinator; the imperative `shared/components/SlashCommandDropdown.ts` is
  retained ONLY for the inline-edit flow, which keeps its own shared DOM widget.

## Key Patterns

### Lazy Runtime Initialization

Tabs stay cold until the first send. The tab wiring exposes `ensureServiceInitialized()` so provider runtime creation happens only when needed.

### Message Streaming

```typescript
const preparedTurn = runtime.prepareTurn(request);

for await (const chunk of runtime.query(preparedTurn, history)) {
  streamController.handleStreamChunk(chunk);
}
```

### Auto-Scroll

- Enabled by default during streaming
- User scroll-up disables it
- Scroll-to-bottom re-enables it
- Resets to the saved setting on a new query

## Gotchas

- Work-order run tabs are real `TabManager` tabs but hidden from the visible tab badge row. The chat header Work Orders dropdown is the navigation affordance for active work-order tabs; ordinary tab badges render chat tabs only. Tab-slot accounting (`PluginViewActivator.getTabSlotUsage`) aggregates work-order tabs across **all** open Specorator leaves, not just the active view.
- `TabManager.runTabMutation` serializes tab create/switch/close/open-conversation mutations; runtime init carries a generation counter and shared promise so stale init/cleanup cannot race teardown. `ConversationController.dispose()` and `destroyTab`'s awaited `pendingRuntimeCleanup` complete the teardown contract.
- `ConversationStore` tracks delete tombstones + per-conversation revisions; hydration/save paths reject stale results, and conversation delete quiesces every view before metadata removal then repairs tabs afterward (`main.ts` split helpers).
- Transcript snapshots carry `conversationId` + `projectionRevision` so history switches cannot render against the wrong conversation; `InputController` rolls back optimistic user/assistant placeholders and restores composer text/pills when runtime init fails before the first chunk.
- Per-leaf tab layout persists through `SpecoratorView.getState()` / `setState()` (preferred over global plugin state on restore).
- `SpecoratorView.startTaskRunInFreshTab` / `injectCommitTurnForConversation` are thin delegators to `SpecoratorViewWorkOrderBridge` (the Agent Board integration surface `ChatTabExecutionSurface` calls). The bridge never imports `SpecoratorView` — the cross-view conversation lookup is supplied as a `findConversationTab` callback — so there's no view↔bridge cycle. The view builds the bridge lazily so prototype-only test instances resolve it through the same callbacks.
- `SpecoratorView.onClose()` must abort active tabs and dispose runtimes
- `ChatState` is per-tab; `TabManager` coordinates tab-level operations such as fork targets, and delegates provider-aware command-catalog + runtime-warmup coordination (the per-tab command cache, in-flight warmup dedup, warmup-mode resolution, and cache-key construction) to `TabProviderCommandCoordinator`. The manager builds it via a lazy getter and feeds it live tab-set accessors (`getTabs`/`getActiveTab(Id)`/`filterTabsByProvider`) as callbacks, so there is no manager↔coordinator import cycle and prototype-only test instances still resolve it; the manager keeps thin delegators (`getSdkCommands`, `invalidateProviderCommandCaches`, `primeProviderRuntime`) so external callers stay green
- Title generation runs concurrently per conversation and routes by the global title-generation model selection, not by the active chat tab provider
- `/compact`
  - Claude skips context injection so the provider recognizes the built-in command and persists the compaction boundary
  - Codex routes compact turns to `thread/compact/start` and persists the durable `context_compacted` boundary from JSONL history
- Plan mode
  - Claude uses provider/runtime events for enter and exit plan mode
  - Codex sets `collaborationMode` on `turn/start` and triggers shared post-plan approval from consumed turn metadata
- Bang-bash mode bypasses provider runtimes and executes a local shell command directly
  - It is available only when an enabled provider exposes it in `ProviderChatUIConfig` (currently Claude)
- Forking is provider-owned under the hood
  - Both Claude and Codex support fork
  - `ChatRuntime.resolveSessionIdForFork()` and provider history services own the provider-specific fork/session mapping
- Mod+Enter composer send fires from two places by design
  - Textarea-level handler in `tabInputWiring.ts` runs first and short-circuits via `sendTabInputMessageFromExplicitEnterShortcut` before the slash dropdown / resume / mention handlers, so the dropdown can't swallow the shortcut
  - Vault-level `SpecoratorView.scope.register(['Mod'], 'Enter', ...)` is the safety net; gated by `requireInputFocus: true` so it only sends when the composer textarea is `document.activeElement`, and guards `e.isComposing` (IME) and `e.defaultPrevented`. Returns `false` on send (Obsidian "stop bubbling") and `undefined` on miss
