# Claude Provider

SDK adaptor wrapping `@anthropic-ai/claude-agent-sdk` behind `ChatRuntime`, with Claude Code CLI compatibility layered around it.

## Design Decisions

### Persistent Query — Why Not Restart

The persistent query stays alive across turns. Model, permission mode, MCP servers, and effort level are updated dynamically via SDK API calls (`setModel`, `setPermissionMode`, `setMcpServers`, `applyFlagSettings`). Restart is required when the effective system prompt, disabled-tool set, plugin set, settings source set, CLI path, Chrome enablement, or external context paths change.

### Text Deduplication

The SDK delivers assistant text twice: incrementally via `stream_event/content_block_delta`, and again as complete text in the `assistant` message. The handler tracks `sawStreamText` — if stream events were seen, the assistant message's text blocks are skipped. Without this, every response would render double.

### Usage Chunk Two-Phase Buffering

Usage info comes from two SDK messages:
1. **Assistant message**: accurate input-side token counts (`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`), but only from main-agent messages (`parent_tool_use_id === null` filter) — subagent messages are excluded to avoid inflated counts
2. **Result message**: authoritative `contextWindow` from `modelUsage` that corrects the estimated percentage

Using result-message token counts would be wrong because they aggregate across subagents. Using assistant-message context window would be wrong because it's estimated. The two-phase merge gets the input-side counts plus the final context-window value.

### `mergePromptUsage` — Latest Input, Max Cache

`mergePromptUsage` uses `next.inputTokens` directly (falling back to `current.inputTokens` only when next is zero) — the SDK may revise input downward across `stream_event`/`message_delta`, so high-water-marking would over-count. Cache fields (`cacheCreationInputTokens`, `cacheReadInputTokens`) stay `Math.max(current, next)` because cache reuse is monotone within a turn.

### Shared `buildUsageInfo` Funnel

`transformClaudeMessage.ts`'s local `buildUsageInfo` delegates to `src/core/providers/usage/buildUsageInfo.ts`. The fallback `model` for `intendedModel`-less code paths is `'sonnet'` (the canonical short id in `DEFAULT_CLAUDE_MODELS`) so the emitted `UsageInfo.model` round-trips through downstream lookups. `contextWindowIsAuthoritative` starts `false`; the `result` arm flips it `true` only after `modelUsage[model].contextWindow` is observed.

### History-backed `extractLastUsage`

`ClaudeConversationHistoryService.extractLastUsage` walks the latest assistant SDK message in the JSONL transcript backwards for a non-null `usage`, builds the `UsageInfo` via the shared builder, and resolves `contextWindow` from the result's `modelUsage[model].contextWindow` (authoritative) or the settings fallback (non-authoritative). Returns `null` on any parse failure — never throws.

### Custom Spawn — Electron Workarounds

`createCustomSpawnFunction()` works around two Obsidian/Electron-specific issues:
- Resolves `node` to a full path because GUI apps don't inherit shell PATH
- Does NOT pass `signal` to `spawn()` — Obsidian's Electron uses a different `AbortSignal` realm that breaks Node's internal `instanceof` check; manually calls `child.kill()` on abort instead

## Non-Obvious Behaviors

### SDK Amnesia Detection

When the SDK returns a different session ID than the one provided in `resume`, `SessionManager.captureSession()` sets `needsHistoryRebuild = true`. `ClaudeChatRuntime` detects this and injects full conversation history into the next user message before dispatching the turn. This handles the case where the SDK silently lost context without explicit error signaling.

**Fork interaction**: on the first `session_init` after a fork, `clearHistoryRebuild()` prevents the amnesia logic from triggering — the SDK legitimately returns a different session ID for forks.

### Crash Recovery

On consumer loop error, if `!crashRecoveryAttempted && lastSentMessage && !handler.sawAnyChunk` (first failure, message was sent, nothing was streamed yet): restart the persistent query with `preserveHandlers: true` and re-enqueue the message. Single retry only — second failure surfaces the error.

### Auto-Triggered Turns

The SDK can send messages without a registered handler (e.g., background subagent completion notifications). These chunks buffer in `_autoTurnBuffer` and deliver via `_autoTurnCallback` on the `result` event.

### MessageChannel Queue

- Text-only messages merge with `\n\n` up to 12000 chars while a turn is active (fast follow-up messages coalesce)
- Attachment messages replace the previous queued attachment (one at a time)
- Queue overflow beyond 8 messages drops the newest

### Branch Filtering

SDK session files are tree-structured — rewind + re-prompt creates branches. `sdkBranchFilter` finds the canonical branch by locating the latest leaf, walking ancestry to root, then including non-user-branch siblings (tool results belonging to ancestors). This is the most algorithmically complex part of the history layer.

### User-Scope Skill Discovery

`SkillStorage` scans two roots: the vault's `.claude/skills/` (editable) and, via an injected `HomeFileAdapter`, the user's global `~/.claude/skills/` (`loadUserAll`, read-only). `ClaudeCommandCatalog.listVaultEntries` always folds the home skills in with `readOnly: true` — surfaced as `scope: 'user'`, `isEditable/isDeletable: false`, and a **host-absolute `sourceFilePath`** so the Library's `isCloneableSkillPath` gate and `SkillEditorModal` keep them view/run only. Personal and project skills carry distinct ids (`user-skill-` vs `skill-`).

A same-named personal + project skill is **not** deduped — both are listed. Claude resolves `/name` to the personal skill (personal overrides project — https://code.claude.com/docs/en/skills.md), but a shared name is ambiguous over the `/name` wire, so dropping either side would break a consumer: drop the project skill and the settings slash-command manager loses its only edit/delete affordance for it; drop the personal skill and the Library hides what actually runs. The manager (`SlashCommandSettings`) additionally filters `scope: 'user'` out — it only manages editable vault entries; read-only user skills live in the Library.

This feeds the Library Skills tab and the cold-start dropdown fallback. The warm dropdown stays SDK-owned: the SDK discovers `~/.claude/skills/` natively when `settingSources` includes `'user'` (the `loadUserSettings` toggle), so it — not this listing — decides whether user skills are offered/resolvable in an active chat. Discovery here is deliberately **not** gated on that toggle: gating a cached listing on a runtime-mutable flag created cross-cache staleness (in-memory bucket, persisted index, SDK warm cache) with no clean single invalidation seam, so the Library simply shows what exists on disk. Specorator only sends `/name`; the provider resolves it.

`~/.claude/` is outside the vault (no file watcher), so freshness relies on the aggregator TTL + manual refresh. The persisted skill index (`.specorator/cache/skill-index.json`) can sync with the vault, so `serializePersistedSkillIndex` **redacts the host-absolute `sourceFilePath` of user-scope entries** — the home path never lands in a synced file; the entry is re-discovered with its real path in memory on the next fetch.

## Storage Traps

### CC Settings Merge

`CCSettingsStorage.save()` reads the existing `.claude/settings.json` first and merges — it only manages `permissions` and `enabledPlugins`. Without the merge, saving would clobber CC-owned fields (model, env, MCP settings) that users set via the CLI.

### MCP Dual-Namespace

`.claude/mcp.json` stores servers in two namespaces: `mcpServers` (CC-compatible, read by the CLI) and `_specorator.servers` (Specorator metadata: enabled, contextSaving, disabledTools, description). CC ignores the `_specorator` key. This avoids polluting the CC-compatible format with Specorator-specific data.

### Plugin Dual-Write

Plugin enabled state is written to both `.claude/settings.json` (so the CC CLI also respects it) and kept in `PluginManager.plugins[].enabled` (for Specorator's restart check). These must stay in sync.

### Slash Command ID Encoding

Dashes are escaped as `-_`, slashes become `--`. This is a reversible encoding for subdirectory support: `a/b-c.md` → `cmd-a--b-_c`.

## Gotchas

- `DISABLED_BUILTIN_SUBAGENTS = ['Task(statusline-setup)']` — disabled because it has no meaning in Obsidian
- `previousProviderSessionIds` tracks all prior SDK sessions for a conversation (e.g., after forks). All are loaded during history hydration to build the complete message set — not just the current session
- `EnterPlanMode` never hits `canUseTool` — the SDK auto-approves it; the runtime detects it in the stream to sync UI. `ExitPlanMode` does go through `canUseTool`
- Context window `selectContextWindowEntry()` handles multi-model scenarios (subagent uses different model) by matching model signatures — exact match first, then family match (haiku/sonnet/opus + 1M flag), null if ambiguous
- MCP server configs are SSRF-vetted (`core/mcp/mcpRuntimeVetting`) before they reach the SDK at both seams — cold start (`queryViaSDK`) and `applyClaudeDynamicUpdates`/`setMcpServers`. Unsafe URL-based servers are dropped per-server with a warning instead of failing the turn; loopback is allowed at runtime (the settings Test path stays strict)
