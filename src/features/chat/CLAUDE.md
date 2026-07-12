# Chat Feature

Main sidebar chat interface. `SpecoratorView` assembles tabs, controllers, renderers, and provider-backed services around the shared `ChatRuntime` boundary. The outer frame — header, tab-badge strip, and tab-content host — is a Vue 3 + Pinia island (`ui/vue/`, ADR 0005) mounted over the untouched imperative engine (`TabManager`, controllers, `ChatState`, per-tab DOM). See "Chat Shell Vue Island" below.

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
├── Rendering
│   ├── MessageRenderer (orchestration; delegates to the three below)
│   │   ├── MessageSubagentRenderer (Task / provider-lifecycle subagent projection)
│   │   ├── MessageImageRenderer (attachment src resolution + image modal)
│   │   └── MessageActionBar (copy / rewind / fork / registered-action toolbar)
│   ├── ToolCallRenderer
│   ├── ThinkingBlockRenderer
│   ├── WriteEditRenderer
│   ├── DiffRenderer
│   ├── TodoListRenderer
│   ├── SubagentRenderer
│   ├── InlineExitPlanMode
│   ├── InlinePlanApproval
│   ├── InlineAskUserQuestion
│   └── InlineRuntimeError
├── Tabs
│   ├── TabManager
│   ├── TabProviderCommandCoordinator
│   └── Tab
└── UI Components
    ├── InputToolbar
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
- **Out of scope for this island**: transcript rendering (`MessageRenderer` +
  block renderers), the composer + input toolbar, and the remaining side
  panels (status panel, navigation sidebar, file/image context) stay fully
  imperative — each is its own future sub-project of the larger chat Vue
  migration (see ADR 0005 and
  `docs/superpowers/specs/2026-07-11-chat-shell-vue-migration-design.md`).

## State Flow

```text
User Input
  -> InputController
  -> ensure runtime for active provider
  -> ChatRuntime.prepareTurn()
  -> ChatRuntime.query()
  -> StreamController
  -> MessageRenderer + ChatState persistence
```

The feature layer consumes provider-neutral `StreamChunk` values. Providers own prompt encoding, history/session fallback, and task-result interpretation.

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

## Rendering Pipeline

| Renderer | Handles |
|----------|---------|
| `MessageRenderer` | Main message orchestration + interrupt markers; delegates subagent projection (`MessageSubagentRenderer`), image attachments (`MessageImageRenderer`), and the copy/rewind/fork action toolbar (`MessageActionBar`) |
| `ToolCallRenderer` | Tool blocks and tool state |
| `ThinkingBlockRenderer` | Thinking / reasoning summaries |
| `WriteEditRenderer` | File writes and edits with diff previews |
| `DiffRenderer` | Inline diff rendering |
| `InlineExitPlanMode` | Claude tool-driven exit-plan approval |
| `InlinePlanApproval` | Shared post-plan approval flow driven by consumed turn metadata (currently Codex) |
| `InlineAskUserQuestion` | Ask-user cards emitted by provider runtimes |
| `InlineRuntimeError` | Actionable runtime-error cards — classified via `classifyRuntimeError` (cli-not-found / unauthenticated / context-too-large / generic) with open-settings, provider login hint, and real retry re-dispatch |
| `TodoListRenderer` | Todo items and status icons |
| `SubagentRenderer` | Background agent lifecycle rendering |

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

- Work-order run tabs are real `TabManager` tabs but hidden from the visible tab badge row. The chat header Work Orders dropdown is the navigation affordance for active work-order tabs; ordinary tab badges render chat tabs only.
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
