---
id: AUDIT-CLAUDIAN-BACKEND
title: Claudian Reboot — Backend / Runtime / MCP / Settings / Cross-cutting Audit
status: draft
owner: analyst
created: 2026-05-24
epic: claudian-reboot
reference: D:\Projects\claudian-main   # MIT, read-only structural reference
charter: specs/claudian-reboot/parity-charter.md   # §3.6–§3.9, §4 (P7–P12), §6
scope: provider runtime, MCP, settings shell, cross-cutting (i18n / a11y / security)
companion: claudian-audit-frontend.md (chat & composer surfaces, P1–P6)  # not produced by this pass
---

# Claudian Reboot — Backend Surface Audit (P7–P12 + P1 provider seam)

Per-surface audit of Claudian's **provider runtime, MCP, settings, and cross-cutting**
layers, mapped onto the Specorator DDD architecture (narrow ports + three bridges +
`Result<T,E>`). This is the design-input reference for charter phases **P7 (approvals)**,
**P8 (MCP)**, **P9 (providers Codex/Opencode + registry)**, **P10 (settings shell)**,
**P11 (i18n)**, **P12 (a11y)** — plus the **P1 `ChatRuntime` port seam** that everything
hangs off.

> **Method note.** Claudian is a desktop-only Obsidian plugin that drives external CLIs as
> Node subprocesses (Electron renderer with Node integration). It is *not* DDD-layered: it
> uses a flat `core/` (provider-agnostic) + `providers/<id>/` (provider-specific) +
> `features/` + imperative DOM builders. The central design decision for the reboot is to
> wrap each subprocess/transport behind a **narrow port** so the UI never touches Node, and
> the Mock/LocalStorage bridges can stub the agent runtime for `npm run dev` and the GitHub
> Pages demo. Throughout, **provider-agnostic** logic = domain/application; **provider-
> specific subprocess/transport** = infrastructure.

---

## 0. The core/providers split (orientation)

Claudian already separates two registries — preserve this seam in Specorator:

- **`core/runtime/ChatRuntime.ts`** — the chat-facing contract (one streaming agent turn).
- **`core/providers/ProviderRegistry.ts`** — *chat-facing* provider registration: runtime
  factory, capabilities, model-routing UI config, history service, aux service factories.
- **`core/providers/ProviderWorkspaceRegistry.ts`** — *workspace* services: CLI resolver,
  command catalog, MCP manager, agent/plugin managers, settings-tab renderer. Initialised
  once at plugin load (`initializeAll`), then queried by id.
- **`providers/<id>/registration.ts`** — wires one provider's concrete classes into the
  registry (`claude` / `codex` / `opencode`).
- **`providers/acp/`** — shared ACP (Agent Client Protocol) JSON-RPC-over-stdio transport,
  reused by Opencode (and structurally the model Codex's own RPC transport mirrors).

The two registries are the cleanest evidence that **provider selection is data, not branch
logic** — Specorator should mirror this with a registry object behind a port, not `if
(provider === 'claude')` scattered through use cases.

---

## Provider runtime model

### ChatRuntime contract (the P1 seam) — charter §3.6 · Phase P1 (regrows in P9)
- Claudian source:
  - `src/core/runtime/ChatRuntime.ts` — the runtime interface (one provider = one impl).
  - `src/core/runtime/types.ts` — `ChatTurnRequest`, `PreparedChatTurn`,
    `ChatRuntimeQueryOptions`, `ChatRewindResult`/`ChatRewindMode`, `ChatTurnMetadata`,
    approval/ask-user/exit-plan callback types, `SubagentRuntimeState`.
  - `src/core/runtime/QueuedTurn.ts` — turn queueing primitive.
- Contract / behaviour:
  - `query(turn, history?, opts?): AsyncGenerator<StreamChunk>` is the heart — an **async
    generator** streaming `StreamChunk`s (assistant text deltas, tool-call start/delta/end,
    thinking, usage, session-init, context-window events). Reboot must preserve the
    streaming generator shape end-to-end (composable → use case → port).
  - Lifecycle: `ensureReady(opts?)` (lazy session creation / cold-start gate) →
    `prepareTurn(request)` (pure: builds prompt, extracts MCP `@mentions`, compact flag) →
    `query(...)` → `cancel()` / `resetSession()`. `isReady()`, `onReadyStateChange()` drive
    the toolbar's enabled state. `steer?(turn)` is optional mid-turn injection (Codex only).
  - Session identity: `getSessionId()`, `consumeSessionInvalidation()`,
    `setResumeCheckpoint()`, `syncConversationState(state, externalPaths?)`,
    `buildSessionUpdates({conversation, sessionInvalidated})`, `resolveSessionIdForFork()`.
  - Callbacks injected by the chat shell (not return values): `setApprovalCallback`,
    `setAskUserQuestionCallback`, `setExitPlanModeCallback`, `setPermissionModeSyncCallback`,
    `setAutoTurnCallback`, `setSubagentHookProvider`, `setApprovalDismisser`. These are the
    UI→runtime control channel for interactive blocks (P4/P7).
  - `getCapabilities()` (see below), `getSupportedCommands()` (slash/skill discovery),
    `getAuxiliaryModel?()`, `reloadMcpServers()`, `rewind(userMsgId, asstMsgId, mode)`,
    `loadSubagentToolCalls?/loadSubagentFinalResult?`.
  - Edge cases: session expiry → `consumeSessionInvalidation()` returns true, shell rebuilds;
    cold-start (`forceColdStart`) for one-shot aux queries vs persistent query for live chat.
- CSS / visual: n/a (no settings surface; toolbar enabled state in `header.css`/`input.css`).
- Specorator mapping:
  - **Layer:** the `ChatRuntime` interface itself is a **domain port** (declared in
    `src/domain/ports/`); concrete provider runtimes live in **infrastructure**
    (`src/infrastructure/agent/<provider>/`). A **`ChatRuntimePort`** is the narrow port the
    UI/application consumes — but note the streaming-generator + injected-callback shape is
    richer than the existing 6 ports. Recommend a `ChatRuntimePort` that exposes
    `ensureReady`, `prepareTurn`, `query` (async generator), `cancel`, `rewind`, session
    accessors, and `setXxxCallback` registration; keep `Result<T,E>` for the non-streaming
    methods (`ensureReady`, `rewind`, `buildSessionUpdates`) and let `query` yield a
    discriminated `StreamChunk` union where error is a chunk variant (generators can't return
    `Result` per-chunk cleanly).
  - **Bridge:** production `ObsidianBridge` constructs the real provider runtime (subprocess);
    `MockBridge` returns a scripted generator (canned stream for `npm run dev` + tests);
    `LocalStorageBridge` returns a "demo" runtime (replays a fixture transcript — no
    subprocess on GitHub Pages).
  - **Subprocess location:** all `child_process.spawn` stays in infrastructure behind the
    port; UI never imports `obsidian` or `node:child_process`.
- Parity-critical: streaming feel (token-by-token), cancel responsiveness, cold-start
  latency hidden by persistent query, session resume, the exact `StreamChunk` taxonomy so
  rich renderers (P2) get identical inputs.
- Open questions: do we expose `steer` in the port from P1 (Codex-only) or add in P9? The
  callback-registration pattern fights ADR-008's "one method per call" cleanliness — confirm
  a `ChatRuntimePort` may carry registration setters (it is still one narrow port for one
  consumer, the chat session store).

### Provider capabilities — charter §3.6 · Phase P1/P9
- Claudian source: `src/core/providers/types.ts` (`ProviderCapabilities`),
  `src/providers/claude/capabilities.ts`, `src/providers/codex/capabilities.ts`,
  `src/providers/opencode/capabilities.ts`.
- Contract / behaviour: a frozen flag bag per provider —
  `supportsPersistentRuntime`, `supportsNativeHistory`, `supportsPlanMode`, `supportsRewind`,
  `supportsFork`, `supportsProviderCommands`, `supportsImageAttachments`,
  `supportsInstructionMode`, `supportsMcpTools`, `supportsTurnSteer?`, `reasoningControl`
  (`'effort'|'token-budget'|'none'`), `planPathPrefix?`. The UI reads these to show/hide
  toolbar widgets (P6) and gate features. Claude = everything true; Codex = no rewind, no
  provider commands, **no MCP tools** (CLI-managed), supports steer; Opencode = ACP modes/
  models, narrower.
- CSS / visual: drives presence of toolbar widgets only.
- Specorator mapping: a plain **domain value object** (`ProviderCapabilities`), surfaced via
  the registry port (below). No bridge needed — pure data. Use cases branch on capability
  flags, not provider id (mirrors Claudian's discipline).
- Parity-critical: the exact flag set per provider so the toolbar shows the same widgets.
- Open questions: §6 — are Codex/Opencode capability gaps (no rewind / no in-app MCP) in
  scope for P9, or do we ship Claude-complete and stub the others?

### Provider registry + model routing — charter §3.6 · Phase P9
- Claudian source: `src/core/providers/ProviderRegistry.ts` (static registry, runtime/aux
  factories, capability lookup, `resolveProviderForModel`, enabled-provider ordering by
  `blankTabOrder`), `src/core/providers/modelRouting.ts` (thin wrappers),
  `src/core/providers/ProviderSettingsCoordinator.ts`,
  `src/core/providers/providerConfig.ts` (opaque per-provider settings bag get/set).
- Contract / behaviour:
  - `register(id, registration)` at module load; `createChatRuntime({plugin, providerId?})`
    factory; `getCapabilities/getChatUIConfig/getSettingsReconciler/getConversationHistory
    Service/getTaskResultInterpreter/getSubagentLifecycleAdapter` by id.
  - **Model→provider routing:** `resolveProviderForModel(model, settings, opts)` asks each
    provider's `chatUIConfig.ownsModel(model)` — so typing a model id auto-selects its
    provider. `resolveSettingsProviderId` picks the active settings tab; `RoutedTitle
    GenerationService` routes title-gen to the provider that owns `titleGenerationModel`.
  - `getEnabledProviderIds(settings)` filters by `isEnabled(settings)` and sorts by
    `blankTabOrder` (opencode 10, codex 15, claude 20) — drives the "new tab" provider menu.
- CSS / visual: provider menu / blank-tab order (tabs css, P3); per-provider icon
  (`ProviderIconSvg` composite SVG) shown in model selector (`model-selector.css`, P6).
- Specorator mapping:
  - **Layer:** application/infrastructure boundary. The registry is **infrastructure** (it
    constructs runtimes = subprocesses), exposed to the UI via a **`ProviderRegistryPort`**
    (domain port): `listEnabledProviders(settings)`, `getCapabilities(id)`,
    `resolveProviderForModel(model, settings)`, `getDisplayName(id)`, `getModelOptions(id)`.
    Runtime construction stays behind `ChatRuntimePort` (the registry hands back a runtime
    the port wraps).
  - **Bridge:** `ObsidianBridge` registers claude/codex/opencode; `MockBridge` registers a
    single fake provider; `LocalStorageBridge` registers a demo provider.
  - `Result<T,E>`: `resolveProviderForModel` returns a value (has fallback), no Result needed;
    `createChatRuntime` may fail (workspace not initialised) → `Result`.
- Parity-critical: model id → provider auto-routing; blank-tab provider ordering; the active-
  provider settings projection (`settingsProvider`, `savedProviderModel/Effort/...` maps).
- Open questions: Specorator currently has *one* feature domain — introducing multi-provider
  selection is a new aggregate. Confirm whether P1 ships single-provider (Claude) with the
  registry seam stubbed, expanding in P9 (recommended by charter §4).

### Provider chat-UI config + settings reconciler — charter §3.6/§3.8 · Phase P6/P9/P10
- Claudian source: `ProviderChatUIConfig` + `ProviderSettingsReconciler` in
  `src/core/providers/types.ts`; impls `providers/<id>/ui/<Id>ChatUIConfig.ts`,
  `providers/<id>/env/<Id>SettingsReconciler.ts`.
- Contract / behaviour: provider owns its model list, reasoning options
  (effort vs token-budget), context-window size, permission-mode toggle descriptor,
  service-tier toggle descriptor, mode selector, bang-bash enablement, and the provider icon
  SVG. The reconciler reacts to environment changes (custom models from env vars,
  invalidating conversations whose model disappeared). This is how the toolbar (P6) is
  *fully provider-driven* with no provider-specific UI code.
- CSS / visual (settings surfaces): `toolbar/model-selector.css`,
  `toolbar/thinking-selector.css`, `toolbar/service-tier-toggle.css`,
  `toolbar/permission-toggle.css`, `toolbar/mode-selector.css`,
  `settings/opencode-model-picker.css`.
- Specorator mapping: a **domain port `ProviderUiConfigPort`** (or fold into
  `ProviderRegistryPort`) returning plain DTOs (`ProviderUIOption[]`,
  `ProviderReasoningOption[]`, toggle descriptors) — these cross the Pinia store boundary as
  DTOs (ADR-003 compliant). Reconciler = application service operating on settings DTO.
- Parity-critical: exact model lists, reasoning controls per model, toggle labels/microcopy.
- Open questions: env-derived custom models (`getCustomModelIds`) couple model lists to the
  env-snippet feature (P10) — confirm sequencing.

### Sessions / history / fork / rewind storage (per provider) — charter §3.6 · Phase P3
- Claudian source:
  - Shared: `src/core/bootstrap/SessionStorage.ts`, `src/core/bootstrap/storage.ts`
    (`SharedAppStorage` — claudian settings, tab state, session metadata),
    `src/core/bootstrap/StoragePaths.ts` (`.claudian/`, `.claudian/sessions`, legacy
    `.claude/` migration), `src/core/storage/VaultFileAdapter.ts` (vault-rooted FS),
    `src/core/storage/HomeFileAdapter.ts` (home-rooted FS via `node:fs`/`os.homedir()`).
  - Claude: `providers/claude/history/ClaudeHistoryStore.ts` (`loadSDKSessionMessages`,
    subagent sidecar), `ClaudeConversationHistoryService.ts` (hydrate / delete / resolve
    session id / fork provider-state), `sdkSessionPaths.ts`, `sdkBranchFilter.ts`,
    `sdkMessageParsing.ts`; rewind: `providers/claude/runtime/ClaudeRewindService.ts`.
  - Codex: `providers/codex/history/CodexHistoryStore.ts` — parses **JSONL** session files
    (`parseCodexSessionFile/Content/Turns`, `findCodexSessionFile`, `deriveCodexSessionsRoot`),
    `CodexConversationHistoryService.ts`, `CodexSessionFileTail.ts` (live tail).
  - Opencode: `providers/opencode/history/OpencodeConversationHistoryService.ts`.
- Contract / behaviour:
  - `ProviderConversationHistoryService` (core types): `hydrateConversationHistory`,
    `deleteConversationSession`, `resolveSessionIdForConversation`,
    `isPendingForkConversation`, `buildForkProviderState(sourceSessionId, resumeAt,
    sourceState)`, `buildPersistedProviderState?`. **Fork = derive new provider-state
    pointing at a source session + resume offset; not a file copy.** Rewind (Claude) uses the
    SDK's `RewindFilesResult` to roll back code + conversation (`ChatRewindMode`:
    `'conversation' | 'code-and-conversation'`), returning files-changed/insertions/deletions.
  - History is **provider-native**: Claude reads the Agent-SDK session store; Codex reads its
    own JSONL under the Codex sessions root; Opencode via ACP `loadSession`/`listSessions`.
    Provider-neutral *metadata* (title, timestamps, model) lives in `SharedAppStorage`.
- CSS / visual: `components/history.css`, `features/resume-session.css`,
  `modals/fork-target.css`, nav-sidebar (P3).
- Specorator mapping:
  - **Layer:** the session-metadata store maps cleanly to a Specorator-native **application
    service over `VaultPort`** (`.claudian/sessions/*` lives in the vault). Provider-native
    history (SDK store, Codex JSONL, home-dir paths) needs a **`HistoryStorePort`** (per-
    provider impl in infrastructure) because some reads hit the **home directory** (outside
    the vault) — `VaultPort` is insufficient. Recommend a `ProviderHistoryPort` with
    `hydrate(conversation)`, `delete(conversation)`, `resolveSessionId`, `buildForkState`,
    `rewind(...)` returning `Result`.
  - **Bridge:** `ObsidianBridge` reads vault (VaultPort) + home (a new `HomeFsPort` —
    see below); `MockBridge` returns in-memory transcripts; `LocalStorageBridge` reads
    fixtures from localStorage.
  - **Home-dir access is a new concern** Specorator's 6 ports don't cover. Introduce a narrow
    **`HomeFsPort`** (`readFile/writeFile/exists/listFolders` rooted at `os.homedir()`),
    mirroring Claudian's `HomeFileAdapter`. Only `ObsidianBridge` implements real FS; Mock/
    LocalStorage stub it. This is desktop-only by nature.
- Parity-critical: resume picks up the exact session; fork preserves lineage; rewind reports
  files changed; title metadata survives restart; `.claude/`→`.claudian/` migration.
- Open questions: Specorator's vault-only `VaultPort` assumption breaks for home-dir history
  (Codex/Claude SDK store). The `HomeFsPort` is desktop-only — on LocalStorage/Mock it must
  be a no-op/fixture. Confirm an ADR for adding `HomeFsPort` (it widens the Obsidian-API
  surface beyond the vault). §6: is full Codex/Opencode history parity in scope?

### Auxiliary services (title-gen / inline-edit / instruction-refine) — charter §3.2/§3.4 · Phase P3/P5
- Claudian source:
  - Contracts: `src/core/runtime/types.ts` / `core/providers/types.ts`
    (`TitleGenerationService`, `InlineEditService`, `InstructionRefineService`).
  - Shared impls: `src/core/auxiliary/AuxQueryRunner.ts` (the one-shot query primitive),
    `QueryBackedTitleGenerationService.ts`, `QueryBackedInlineEditService.ts`,
    `QueryBackedInstructionRefineService.ts`.
  - Prompts: `src/core/prompt/{titleGeneration,inlineEdit,instructionRefine,mainAgent}.ts`.
  - Per-provider factories in each `registration.ts` (`createTitleGenerationService`, etc.).
- Contract / behaviour: each is a small stateful service that runs a **cold-start one-shot
  query** (not the persistent chat runtime) via `AuxQueryRunner.query(config, prompt)`.
  Title-gen streams a short title then calls back (`TitleGenerationCallback`); inline-edit
  returns edited/inserted text + optional clarification (`InlineEditResult`, modes
  `selection`/`cursor`); instruction-refine is a mini multi-turn conversation
  (`refineInstruction` → `continueConversation`) emitting `InstructionRefineResult`.
  All are cancelable and accept a model override (`getAuxiliaryModel`).
- CSS / visual: `features/inline-edit.css` (modal + word-level diff), `modals/instruction.css`.
- Specorator mapping:
  - **Layer:** application services (`GenerateTitleUseCase`, `RefineInstructionUseCase`,
    `InlineEditUseCase`) that depend on the same **`ChatRuntimePort`** (cold-start mode) — no
    new port needed; the `AuxQueryRunner` is just a one-shot wrapper over `query()`. Returns
    `Result<T,E>`.
  - **Bridge:** reuses the runtime bridge; Mock returns canned titles/edits.
- Parity-critical: auto-title timing (after first turn), inline-edit diff preview, the
  refine-conversation loop microcopy.
- Open questions: which model auxiliary calls use (cheap model default `haiku`); confirm
  these are P3 (title) / P5 (inline-edit) per charter.

---

## MCP

### MCP server manager + config parser + types — charter §3.7 · Phase P8
- Claudian source:
  - `src/core/mcp/McpServerManager.ts` — in-memory list of `ManagedMcpServer`, active-server
    filtering, context-saving `@mention` gating, disallowed-tool collection.
  - `src/core/mcp/McpConfigParser.ts` — `parseClipboardConfig` (4 paste formats) +
    `tryParseClipboardConfig`.
  - `src/core/types/mcp.ts` — `McpServerConfig` (stdio/sse/http union), `ManagedMcpServer`
    (enabled/contextSaving/disabledTools/description), `ManagedMcpConfigFile` (`_claudian`
    metadata sidecar), `getMcpServerType`, `isValidMcpServerConfig`.
  - `src/utils/mcp.ts` — `extractMcpMentions`, `transformMcpMentions`, `parseCommand`.
- Contract / behaviour:
  - **Transports:** stdio (local command + args + env), SSE (`type:'sse'`, url+headers),
    HTTP (`type:'http'` or bare url, url+headers). `getMcpServerType` defaults bare-url→http.
  - **Context-saving mode:** an enabled server with `contextSaving:true` is only injected
    into the runtime when its name is `@mentioned` in the prompt (`getActiveServers
    (mentionedNames)`); otherwise it pre-registers as a *disallowed* tool to avoid cold-start
    when later mentioned (`getAllDisallowedMcpTools`). Tool ids are `mcp__<server>__<tool>`.
  - **Config storage:** vault file `.claude/mcp.json`-style `mcpServers` map + a `_claudian`
    sidecar holding per-server enabled/contextSaving/disabledTools/description.
- CSS / visual: settings — `settings/mcp-settings.css`; toolbar selector —
  `toolbar/mcp-selector.css`.
- Specorator mapping:
  - **Layer:** `McpServerManager` is provider-agnostic application logic over a storage port.
    Config parsing = pure domain functions (move to `src/domain/mcp/`, return `Result`).
  - **Port:** **`McpConfigStorePort`** (`load(): ManagedMcpServer[]`, `save(servers)`) backed
    by **`VaultPort`** in `ObsidianBridge` (writes `.claude/mcp.json` in the vault); Mock/
    LocalStorage stub. The manager itself needs no port (operates on loaded list).
  - `Result<T,E>`: `parseClipboardConfig` throws today → convert to `Result`.
- Parity-critical: the 4 paste formats; context-saving `@mention` gating; `mcp__a__b` tool id
  format; per-server disabled-tools; the `_claudian` metadata round-trip.
- Open questions: vault-relative MCP config path under Specorator's `.claudian` vs `.claude`
  (Claudian uses `.claude/mcp.json`) — confirm the canonical path; ADR-005 sink implication.

### MCP tester (live connection probe) — charter §3.7 · Phase P8
- Claudian source: `src/core/mcp/McpTester.ts` — `testMcpServer(server)`, `createNodeFetch`.
- Contract / behaviour: opens a real MCP client connection using the official
  `@modelcontextprotocol/sdk` (`Client` + `StdioClientTransport` /
  `StreamableHTTPClientTransport` / legacy `SSEClientTransport`), lists tools, returns
  `{success, serverName, serverVersion, tools[], error?}`. **Desktop concerns:** stdio spawns
  via the SDK with `env: {...process.env, ...config.env, PATH: getEnhancedPath(...)}` and
  `stderr:'ignore'`; remote transports use a **custom Node `http`/`https` fetch**
  (`createNodeFetch`) to bypass the Electron renderer's CORS, while still using SDK protocol
  semantics. 10-second `AbortController` timeout. Partial success: connect OK but `listTools`
  fails → success with empty tools.
- CSS / visual: `modals/mcp-modal.css` + the test modal (`McpTestModal.ts`) — loading
  spinner, server name/version header, per-tool list with enable/disable checkboxes,
  bulk-toggle, error states with friendly messages (EACCES/ENOSPC/JSON-corrupt).
- Specorator mapping:
  - **Layer:** infrastructure — wraps the MCP SDK + Node http/spawn. Exposed via
    **`McpClientPort`** (`testServer(config): Promise<Result<McpTestResult>>`,
    optionally `listTools(config)`). Only `ObsidianBridge` implements (needs Node);
    `MockBridge` returns canned tool lists; `LocalStorageBridge` returns "unavailable on web".
  - The test **modal** is a blocking flow → Specorator uses an Obsidian `Modal` subclass
    (per CLAUDE.md) for the imperative shell, or a Vue modal component fed by the port.
- Parity-critical: 10s timeout + partial-success semantics; per-tool enable/disable persisted
  back to `disabledTools`; CORS-free remote probing; friendly error mapping.
- Open questions: GitHub Pages demo cannot run MCP (no Node) — `McpClientPort` must degrade
  gracefully on `LocalStorageBridge`. Bundling `@modelcontextprotocol/sdk` adds a runtime dep
  (record rationale per AGENTS.md §8).

### MCP wiring split: Claude in-app vs Codex CLI-managed — charter §3.7 · Phase P8/P9
- Claudian source: `providers/claude/app/ClaudeWorkspaceServices.ts` (constructs
  `McpServerManager` from `claudeStorage.mcp`, wires into the runtime);
  `providers/codex/ui/CodexSettingsTab.ts` (lines ~405–415: "Codex manages MCP servers via
  its own CLI… configure with `codex mcp`"); Opencode surfaces MCP via ACP.
- Contract / behaviour: **Claude owns vault MCP in-app** — the `McpServerManager` injects
  servers into the Agent-SDK options and gates by `@mention`. **Codex does NOT** —
  `supportsMcpTools:false`; MCP is configured out-of-band via the Codex CLI's own config and
  surfaced read-only. So the MCP settings UI + selector + tester apply to **Claude only**;
  Codex shows an informational note linking to its docs.
- CSS / visual: same MCP css; Codex tab shows a plain description, no manager.
- Specorator mapping: `McpConfigStorePort` + `McpClientPort` are wired only for providers
  whose `capabilities.supportsMcpTools === true`. The MCP toolbar selector (P6) and settings
  section (P8) are gated on that flag — same capability-driven discipline as the runtime.
- Parity-critical: MCP UI only appears for Claude; Codex shows the doc note; the toolbar MCP
  selector is hidden when `supportsMcpTools` is false.
- Open questions: §6 — do we support Codex-CLI-managed MCP read-out at all in P9, or defer?

---

## Settings shell

### Settings root + provider tabs — charter §3.8 · Phase P10
- Claudian source: `src/features/settings/ClaudianSettings.ts` (root settings tab —
  Obsidian `PluginSettingTab`), per-provider tab renderers
  `providers/claude/ui/ClaudeSettingsTab.ts`, `providers/codex/ui/CodexSettingsTab.ts`,
  `providers/opencode/ui/OpencodeSettingsTab.ts`; the renderer contract
  `ProviderSettingsTabRenderer` (`core/providers/types.ts`) + `ProviderSettingsTabRenderer
  Context` (helpers: `renderHiddenProviderCommandSetting`, `refreshModelSelectors`,
  `renderCustomContextLimits`).
- Contract / behaviour: the root tab renders shared settings (locale, keyboard nav, tab/UI
  prefs, shared env) then delegates a section per **enabled** provider via its registered
  `settingsTabRenderer.render(container, context)`. Provider tabs render: CLI path (device-
  keyed via `cliPathsByHost` + hostname key), safe-mode, model/custom-model config, agent/
  skill/subagent settings, slash-command settings, provider env, MCP (Claude only),
  per-model context limits. Settings persist to `.claudian/claudian-settings.json` via
  `SharedAppStorage.saveClaudianSettings`; opaque per-provider bags via `providerConfig.ts`.
- CSS / visual: `settings/base.css`, `settings/plugin-settings.css`,
  `settings/agent-settings.css`, `settings/slash-settings.css`,
  `settings/opencode-model-picker.css`.
- Specorator mapping:
  - **Layer:** Specorator already has `src/plugin/settings.ts` (Obsidian `PluginSettingTab`)
    + `src/domain/settings/PluginSettings.ts` + **`SettingsPort`**. Extend `PluginSettings`
    with the Claudian fields (provider configs, env, snippets, locale, keyboard nav, custom
    context limits). The provider-tab delegation maps to the **`ProviderRegistryPort`** (list
    enabled providers → render each section). Settings IO stays on **`SettingsPort`**.
  - **Build the settings UI in Vue** (charter forbids imperative DOM); Claudian's
    `Setting`-builder code becomes Vue SFC sections + `data-testid` PageObjects.
  - `Result<T,E>`: settings save returns `Result`.
- Parity-critical: section ordering, device-keyed CLI path, safe-mode semantics, the
  provider-tab layout, microcopy.
- Open questions: Specorator settings are a single Vue tree vs Obsidian's `PluginSettingTab`
  imperative API — confirm whether settings render in the embedded Vue view or a native
  settings tab (affects how `SettingsPort` + Vue interoperate).

### Environment settings + env-snippet manager — charter §3.8 · Phase P10
- Claudian source: `src/features/settings/ui/EnvironmentSettingsSection.ts`,
  `src/features/settings/ui/EnvSnippetManager.ts`;
  classification engine `src/core/providers/providerEnvironment.ts`;
  parser `src/utils/env.ts` (`parseEnvironmentVariables`).
- Contract / behaviour: a scoped env-var textarea (`shared` vs `provider:<id>`) with a live
  **ownership-review warning** — keys are classified into shared-known (PATH, *_PROXY, CA
  bundles, TMPDIR…), provider-owned (by `environmentKeyPatterns` regex, e.g. `^ANTHROPIC_`,
  `^OPENAI_`, `^OPENCODE_`), or shared-unknown (flagged for review). **Env snippets** are
  saved named bundles (`EnvSnippet`: id/name/desc/envVars/scope/contextLimits) that can be
  restored/applied; `getEnvironmentScopeUpdates` splits a pasted blob into the right scopes;
  `inferEnvironmentSnippetScope` auto-detects scope. Custom-model context limits ride along.
- CSS / visual: `settings/env-snippets.css`.
- Specorator mapping:
  - **Layer:** `providerEnvironment.ts` classification + `env.ts` parsing are **pure domain**
    (`src/domain/environment/`) — no Obsidian dep, returns `Result`. Snippet CRUD = application
    service over **`SettingsPort`** (snippets are part of `PluginSettings`).
  - The **runtime PATH-enhancement** (`getEnhancedPath`, `findNodeExecutable`) is Node-only
    infrastructure (see desktop section) behind the runtime/`HomeFsPort`.
- Parity-critical: the key-ownership classifier (shared vs provider vs review), snippet
  apply/restore, scope inference on paste, the review-warning microcopy.
- Open questions: storing raw env (incl. potential secrets/API keys) in plugin settings JSON
  — see secret-storage port question below. Confirm secrets handling policy.

### Agent / skill / subagent / slash-command settings — charter §3.8 · Phase P10
- Claudian source: `providers/claude/ui/AgentSettings.ts`,
  `providers/claude/ui/SlashCommandSettings.ts`,
  `providers/claude/ui/PluginSettingsManager.ts`, `providers/codex/ui/CodexSkillSettings.ts`,
  `providers/codex/ui/CodexSubagentSettings.ts`, `providers/opencode/ui/OpencodeAgentSettings.ts`;
  storage contracts `AppAgentStorage`/`AppSkillStorage`/`AppCommandStorage`/`AppPluginManager`/
  `AppAgentManager` in `core/providers/types.ts`; types `core/types/agent.ts`,
  `core/types/settings.ts` (`SlashCommand`), `core/types/plugins.ts`;
  built-ins `core/commands/builtInCommands.ts`.
- Contract / behaviour: CRUD over provider-owned definitions stored as files — Claude agents
  in vault `.claude/agents/`, Codex subagents in `.codex/agents/` (TOML), skills/slash
  commands per provider. `SlashCommand` carries `kind:'command'|'skill'`, `allowedTools`,
  `model` override, `context:'fork'`+`agent` (subagent), `disableModelInvocation`,
  `userInvocable`, pass-through `hooks`. These feed the composer's `/`, `$`, `@` dropdowns
  (P4) and the runtime `getSupportedCommands()`.
- CSS / visual: `settings/agent-settings.css`, `settings/slash-settings.css`.
- Specorator mapping:
  - **Layer:** application services over storage ports. Agent/skill/command files live in the
    vault (`.claude/agents/`) or home — so backed by **`VaultPort`** (+ `HomeFsPort` for
    home-scoped). Recommend a thin **`AgentStorePort`** / **`CommandStorePort`** only if the
    file layout/format logic justifies a dedicated port; otherwise compose over `VaultPort`.
  - Definitions cross the store boundary as DTOs (ADR-003).
- Parity-critical: file locations + formats (TOML for Codex), the `SlashCommand` shape that
  the composer dropdowns rely on, built-in command set.
- Open questions: §6 — Claude **plugins** subsystem (`providers/claude/plugins`,
  `PluginSettingsManager`) is charter-flagged niche; confirm in/out for P10.

### Keyboard navigation settings — charter §3.8 · Phase P10/P12
- Claudian source: `src/features/settings/keyboardNavigation.ts`; type
  `KeyboardNavigationSettings` (`core/types/settings.ts`) — vim-style scroll keys
  (`scrollUpKey` 'w', `scrollDownKey` 's', `focusInputKey` 'i').
- Contract / behaviour: configurable keys for message-pane scroll + input focus; consumed by
  the chat surface keyboard handler.
- CSS / visual: n/a (behavioural); a11y focus styles in `accessibility.css`.
- Specorator mapping: settings stored via **`SettingsPort`**; key-handling is a UI composable.
  Pure-ish; no new port.
- Parity-critical: default key bindings + the focus/scroll behaviour.
- Open questions: none significant.

### Approvals / permissions settings — charter §3.8/§3.9 · Phase P7 (see Security)
- Covered under Cross-cutting → Security/approvals below; settings surface is the approval-
  rules list + permission-mode default.

---

## Cross-cutting

### Security / approvals (ApprovalManager + permission updates) — charter §3.9 · Phase P7
- Claudian source:
  - `src/core/security/ApprovalManager.ts` — **pure** functions: `getActionPattern`,
    `getActionDescription`, `matchesRulePattern` (bash exact/wildcard, file path-prefix with
    segment boundaries, other-tool prefix).
  - `src/providers/claude/security/ClaudePermissionUpdates.ts` — `buildPermissionUpdates`
    (maps an approval decision to SDK `PermissionUpdate[]`, destination `session` vs
    `projectSettings` for allow-always).
  - `src/providers/claude/runtime/ClaudeApprovalHandler.ts` — wires the runtime's
    `CanUseTool` callback to the UI approval callback.
  - Types: `ApprovalDecision` (`allow`/`allow-always`/`deny`/`cancel`/`select-option`),
    `ApprovalCallback`/`ApprovalCallbackOptions` (`core/runtime/types.ts`,
    `core/types/settings.ts`).
- Contract / behaviour: when the agent wants a tool, the runtime invokes the injected
  `ApprovalCallback(toolName, input, description, options?)` → UI shows the approval block
  (inline or modal) with decision options, optional network/blocked-path context →
  resolves to `ApprovalDecision`. `allow-always` persists a rule (`addRules`, scoped to
  project settings); `allow` is session-scoped. Rule matching gates *future* identical
  actions without re-prompting. Bash rules require explicit wildcards (`git *`, `npm:*`) —
  intentional security stance. Plan mode and `exit-plan-mode` flow through related callbacks.
- CSS / visual: `toolbar/permission-toggle.css` (yolo/plan/normal toggle),
  `components/status-panel.css` (running/approval state); approval block rendering is a P2/P4
  chat surface.
- Specorator mapping:
  - **Layer:** `ApprovalManager` pattern-matching = **pure domain** (`src/domain/security/`,
    returns booleans/`Result`). Rule persistence = application service over **`SettingsPort`**
    (or a dedicated `ApprovalRuleStorePort` if rules live outside settings). The runtime↔UI
    approval channel is the `ChatRuntimePort.setApprovalCallback` registration (P1 seam).
  - The provider-specific SDK `PermissionUpdate` mapping stays in infrastructure
    (`ClaudePermissionUpdates`).
  - **Blocking approval UI:** per CLAUDE.md, blocking confirmations use an Obsidian `Modal`
    subclass — but Claudian renders approvals **inline** in the chat too; reboot should use a
    Vue inline block (non-blocking) + the callback resolves on user click. No `window.confirm`.
- Parity-critical: the exact rule-matching semantics (bash wildcard rules, file path-prefix,
  segment boundaries), session vs project-settings persistence, decision-option labels,
  network/blocked-path context display, the yolo/plan/normal permission modes.
- Open questions: where approval rules persist (project `.claude/settings.json` vs plugin
  settings) — Claudian writes SDK `projectSettings`; confirm Specorator's store + an ADR. §6:
  full network-approval context UI in scope for P7?

### i18n — charter §3.9 · Phase P11
- Claudian source: `src/i18n/i18n.ts` (the `t()` mechanism, locale set/get, fallback),
  `src/i18n/types.ts` (`Locale`, `TranslationKey` — typed dot-paths),
  `src/i18n/constants.ts`, `src/i18n/locales/*.json` (10 files: en, zh-CN, zh-TW, ja, ko, de,
  fr, es, ru, pt).
- Contract / behaviour: `t(key, params?)` does **dot-path lookup** into the current-locale
  JSON dict, falls back to `en` if a key is missing in a non-default locale, then to the raw
  key. Params interpolate `{name}` placeholders. Locale JSONs are statically imported (bundled
  — no async fetch). **Key structure: 3 top-level namespaces — `common`, `chat`, `settings`**
  (~221 leaf keys in en.json). `setLocale` validates against available locales;
  `getLocaleDisplayName` provides native names ("简体中文", "日本語"…).
- CSS / visual: none directly; RTL not present (all 10 locales are LTR) — note for a11y P12.
- Specorator mapping:
  - **Layer:** the existing fake-ports factory already exposes a **`TranslationPort`** stub —
    formalise a real **`TranslationPort`** (`t(key, params?)`, `setLocale`, `getLocale`,
    `availableLocales()`). The locale JSON bundles + lookup live in infrastructure
    (`src/infrastructure/i18n/`); UI consumes via a `useTranslationPort` composable.
  - Locale selection persists via **`SettingsPort`** (`PluginSettings.locale`).
  - No bridge variation needed (pure data); all three bridges share the same translator.
- Parity-critical: all 10 locales present, the `common`/`chat`/`settings` key namespaces, the
  `{param}` interpolation + en fallback, native locale display names. **Reuse Claudian's JSON
  values** (MIT) as the translation source-of-truth for parity.
- Open questions: Claudian's `TranslationKey` is a hand-maintained typed union — confirm
  whether Specorator generates types from `en.json` or hand-maintains. Microcopy meaning must
  match charter §1 even though brand strings change (Claudian→Specorator naming).

### Accessibility — charter §3.9/§3.10 · Phase P12
- Claudian source: `src/style/accessibility.css` (only 40 lines — `:focus-visible` outlines
  on interactive elements using `var(--interactive-accent)`), plus behavioural a11y scattered
  in components (focus management, keyboard nav above).
- Contract / behaviour: focus-visible rings (2px accent outline, varied offset/radius per
  element class) on tool/thinking/subagent headers, buttons, chips, history items, modal
  controls. Charter §1 raises the bar: keyboard nav, forced-colors, reduced-motion, WCAG 2.2
  AA — "meet or beat" Claudian's stylesheet.
- CSS / visual: `accessibility.css` → maps to `--sp-*` accent token; the AUX feature's
  `lint-style-tokens` guard regrows here (no raw Obsidian var leak).
- Specorator mapping: **UI/styling layer only** — no port. Focus management lives in Vue
  components + composables; `:focus-visible` styles use `--sp-*` tokens. forced-colors /
  prefers-reduced-motion media queries to be added (charter mandates beyond Claudian).
- Parity-critical: every interactive element from Claudian's list keeps a visible focus ring;
  reduced-motion + forced-colors support (new, charter-required); WCAG 2.2 AA contrast.
- Open questions: Claudian has no RTL or forced-colors handling — these are *additive* parity-
  beating requirements, confirm they belong in P12 scope.

### Plugin commands + ribbon entry — charter §3.9 · Phase P10/P12
- Claudian source: command/ribbon registration in `main.ts` (not deeply read; out of this
  pass's core focus). Specorator equivalent: `src/plugin/main.ts` registers Obsidian commands
  + ribbon — already exists for the Specorator shell; extend with chat-open / new-tab /
  inline-edit commands.
- Specorator mapping: plugin layer (`src/plugin/`), no port. Uses `WorkspacePort` to open the
  view.
- Open questions: which commands/hotkeys to mirror (open chat, new tab, inline edit, plan
  toggle) — enumerate in P10/P12 requirements.

---

## Desktop / Node-subprocess concerns (cross-phase, behind ports + bridges)

Claudian is desktop-only because every provider drives a CLI/SDK as a Node child process in
the Electron renderer. The reboot must quarantine all of this in **infrastructure behind
ports**, with Mock/LocalStorage stubbing it so `npm run dev` and GitHub Pages work.

- **Subprocess spawning:**
  - Claude: `providers/claude/runtime/customSpawn.ts` — wraps `child_process.spawn`,
    normalises Node-backed CLI paths (`cliPathRequiresNode`, `findNodeExecutable`),
    `windowsHide:true`, and **manual abort handling** (does NOT pass `AbortSignal` to spawn —
    Electron realm mismatch breaks `instanceof EventTarget` in Node internals). Critical
    Electron gotcha to reproduce.
  - Codex: `providers/codex/runtime/CodexAppServerProcess.ts` — JSON-RPC app-server over
    stdio; **Windows `.cmd` shell-quoting** (`cmd.exe /d /s /c`, `windowsVerbatimArguments`).
  - ACP/Opencode: `providers/acp/AcpSubprocess.ts` — stdio pipe, SIGTERM→SIGKILL (3s) graceful
    shutdown, stderr ring-buffer (8KB), close/exit listeners.
- **Transports:** `providers/acp/AcpJsonRpcTransport.ts` (line-delimited JSON-RPC 2.0 over
  stdio: requests w/ timeout+abort, notifications, server→client request handlers),
  `providers/codex/runtime/CodexRpcTransport.ts` (Codex app-server RPC).
- **CLI / Node discovery + PATH:** `src/utils/env.ts` — `getEnhancedPath` (augments PATH with
  CLI dir + Node dir + app-provided paths), `findNodeExecutable`/`findNodeDirectory`,
  `cliPathRequiresNode` (shebang/extension sniff), `getMissingNodeError` (user-facing "install
  Node" message), `getHostnameKey` (device-keyed settings). CLI path resolution:
  `providers/claude/runtime/ClaudeCliResolver.ts` — device-specific → legacy → auto-detect,
  with caching + non-absolute-path rejection (cf. repo commit `d3d92ed`).
- **Home-dir FS:** `src/core/storage/HomeFileAdapter.ts` (`node:fs` rooted at
  `os.homedir()`) — Codex/Claude session stores live outside the vault.

**Port placement:**
- `ChatRuntimePort` (production impl spawns/transports; Mock yields canned stream;
  LocalStorage replays fixtures).
- `HomeFsPort` (new — production = real FS; Mock/LocalStorage = in-memory/no-op). This is the
  one genuinely new Obsidian-surface widening (beyond-vault FS) and needs an ADR.
- `McpClientPort` (production = MCP SDK + Node http; web = unavailable).
- CLI/Node discovery + PATH building are *internal to* the production `ChatRuntimePort` impl —
  not their own port (no other consumer).

---

## Recommended new narrow ports

> ADR-008 discipline: one port per consumer, named, Result-returning where non-streaming.
> `ChatRuntimePort` is the exception that proves the rule — its streaming generator + callback
> registration is richer than the 6 existing ports and likely warrants its own ADR.

| Port | Methods (sketch) | Consumer | Phase | Bridge(s) implementing |
|---|---|---|---|---|
| **ChatRuntimePort** | `ensureReady(opts):Result<bool>`, `prepareTurn(req):PreparedTurn`, `query(turn,history?,opts?):AsyncGenerator<StreamChunk>`, `cancel()`, `resetSession()`, `getSessionId()`, `consumeSessionInvalidation():bool`, `rewind(u,a,mode):Result<RewindResult>`, `steer?(turn):Result<bool>`, `setApprovalCallback/setAskUserQuestionCallback/setExitPlanModeCallback/setAutoTurnCallback(cb)`, `getSupportedCommands():Result<SlashCommand[]>`, `reloadMcpServers():Result<void>`, `getCapabilities()` | chat session store (application) | **P1** (Claude), extend P9 | ObsidianBridge=real subprocess; MockBridge=scripted stream; LocalStorageBridge=fixture replay |
| **ProviderRegistryPort** | `listEnabledProviders(settings):ProviderInfo[]`, `getCapabilities(id)`, `resolveProviderForModel(model,settings):id`, `getDisplayName(id)`, `getModelOptions(id,settings):UIOption[]`, `getReasoningOptions/getToggles(...)` | toolbar + new-tab + settings (UI/application) | **P9** (seam stubbed P1) | ObsidianBridge=3 providers; MockBridge=1 fake; LocalStorageBridge=demo |
| **ProviderHistoryPort** | `hydrate(conv):Result<void>`, `delete(conv):Result<void>`, `resolveSessionId(conv):string\|null`, `buildForkState(srcId,resumeAt,srcState):Record`, `listSessions():Result<SessionMeta[]>` | history / resume / fork (application) | **P3** | ObsidianBridge=vault+home FS; MockBridge=in-memory; LocalStorageBridge=fixtures |
| **HomeFsPort** *(new Obsidian-surface — needs ADR)* | `readFile(p):Result<string>`, `writeFile(p,c):Result<void>`, `exists(p):bool`, `listFolders(p):string[]`, `ensureFolder(p)` (rooted at `os.homedir()`) | ProviderHistoryPort + runtime impl | **P3/P9** | ObsidianBridge=`node:fs`; MockBridge/LocalStorageBridge=in-memory/no-op |
| **McpConfigStorePort** | `load():Result<ManagedMcpServer[]>`, `save(servers):Result<void>` | McpServerManager (application) | **P8** | ObsidianBridge=VaultPort(`.claude/mcp.json`+`_claudian`); Mock/LocalStorage=in-memory |
| **McpClientPort** | `testServer(config):Result<McpTestResult>`, `listTools(config):Result<McpTool[]>` | MCP test modal / settings (application) | **P8** | ObsidianBridge=`@modelcontextprotocol/sdk`+Node http; Mock=canned; LocalStorage=unavailable |
| **TranslationPort** *(formalise existing stub)* | `t(key,params?):string`, `setLocale(l):bool`, `getLocale():Locale`, `availableLocales():Locale[]` | every UI component | **P11** | all three share one infra translator (bundled JSON) |
| **SecretStorePort** *(decision-gated — see below)* | `getSecret(key):Result<string\|null>`, `setSecret(key,val):Result<void>`, `listKeys():string[]` | env settings / runtime env (application) | **P10** | ObsidianBridge=settings JSON or OS keychain (TBD); Mock/LocalStorage=in-memory |
| **ApprovalRuleStorePort** *(optional — may fold into SettingsPort)* | `loadRules():Result<Rule[]>`, `addRule(r):Result<void>`, `clear():Result<void>` | approvals (application) | **P7** | ObsidianBridge=project `.claude/settings.json` or plugin settings (TBD); Mock/LocalStorage=in-memory |

Existing ports reused without change: **SettingsPort** (plugin settings, env, snippets,
locale, keyboard nav, custom context limits), **VaultPort** (MCP config, agent/command files
in vault), **WorkspacePort** (open chat view), **NotificationPort** (errors/notices —
including friendly MCP/Node errors), **LoggerPort** (debug stream), **CommunityPluginPort**
(unaffected).

---

## Out-of-scope decisions to confirm (feeding charter §6)

1. **Codex / Opencode completeness (P9).** Claudian itself flags these "may be incomplete"
   (no rewind, no in-app MCP for Codex; narrower Opencode). Confirm: ship Claude-complete and
   Codex/Opencode as best-effort, or hold P9 to full parity? Recommend best-effort + capability
   gating. *(charter §6 bullet 1)*
2. **Claude plugins subsystem** (`providers/claude/plugins`, `PluginSettingsManager`,
   `AppPluginManager`). Niche. Confirm in/out for P10. Recommend defer unless a user needs it.
   *(charter §6 bullet 2)*
3. **`HomeFsPort` — beyond-vault filesystem access.** Codex/Claude session history lives in
   the home dir, outside the vault. This widens the Obsidian-API surface the architecture
   exposes. Needs an ADR. Desktop-only by construction; Mock/LocalStorage stub it. Confirm.
4. **Secret handling.** Claudian stores raw env (incl. `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`)
   in plain `.claudian/claudian-settings.json`. Confirm whether the reboot keeps that or
   introduces a `SecretStorePort` (OS keychain). Affects P10 + supply-chain posture.
5. **Approval-rule persistence target.** Claudian writes SDK `projectSettings` (`.claude/
   settings.json`). Confirm Specorator's store (project file vs plugin settings) + ADR. P7.
6. **MCP for non-Claude providers.** Codex MCP is CLI-managed (read-only note in Claudian).
   Confirm whether to surface Codex/Opencode MCP at all in P8/P9, or restrict MCP UI to Claude.
7. **Network-approval context UI (P7).** Claudian's `ApprovalNetworkContext` (host/protocol)
   and `blockedPath` surfacing — confirm full reproduction or simplified approval block.
8. **`ChatRuntimePort` shape vs ADR-008.** The streaming async-generator + callback-
   registration setters are unlike the 6 existing simple ports. Confirm an ADR blessing this
   port shape (it is still one narrow port for one consumer).
9. **Provider auth beyond CLI/env** (OpenRouter / Kimi compatibility). Confirm in/out.
   *(charter §6 bullet 4)*
10. **Bundling `@modelcontextprotocol/sdk`** as a runtime dependency (P8) — record rationale
    per AGENTS.md §8 (license, maintenance, why-not-existing).
11. **i18n type generation.** Generate `TranslationKey` union from `en.json` vs hand-maintain
    (Claudian hand-maintains a 247-line `types.ts`). Confirm tooling choice for P11.
