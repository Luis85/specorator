---
id: RESEARCH-CCS-001
title: "Claude CLI chat sidebar"
stage: research
feature: claude-cli-chat-sidebar
status: complete
owner: analyst
inputs:
  - IDEA-CCS-001
created: 2026-05-14
updated: 2026-05-14
---

# Research — Claude CLI chat sidebar

## Research questions

These carry forward from `idea.md`. Answered against the code that is already on `develop`.

| ID | Question | Status |
|---|---|---|
| Q1 | What is the minimum context payload (Layer 0–4) that makes responses meaningfully more relevant without exceeding Claude CLI's context limits for typical vault sizes? | answered |
| Q2 | How should conversation history be managed across sessions — persisted in the vault, in plugin settings, or kept in memory only? | answered (memory-only, v1 scope) |
| Q3 | What is the right interaction model for the proposal review card — inline in the chat stream, or a separate review panel? | open — deferred past v1 |
| Q4 | How should suggested conversation starters be determined per stage — hardcoded per stage slug, or driven by active artifact state? | open — deferred past v1 |

### Q1 — Context payload

`buildPrompt()` (`src/application/chat/buildPrompt.ts`) defines the answer in code.

- **Token cap:** 50 000 tokens (constant `DEFAULT_TOKEN_CAP`).
- **Character budget:** `tokenCap × 4` = 200 000 chars (4 chars/token approximation).
- **Active file floor:** 500 chars (`MIN_ACTIVE_FILE_CHARS`). The active file is never trimmed below this floor.
- **Context sources:** active file (auto, `isAuto: true`, always at index 0) plus user-pinned manual files (`isAuto: false`).
- **Preamble format:** `"The following files are provided for context:\n\n"` followed by one `---\nFile: <path>\n---\n<content>\n\n` block per file, then `---\n\n` + the user's message.

Multi-layer persona/stage context (the "Layer 0–4" concept from the idea) is not yet assembled by `buildPrompt()`. The function is a pure prompt assembler; persona and workflow-state injection are deferred to a future `buildSystemPrompt()` use case. For v1, only file content and user text are assembled.

### Q2 — Conversation history

`chatStore.ts` stores `response` (last successful text) and `userText` in memory-only Pinia refs. There is no persistence to vault or plugin settings data. History is cleared on `reset()` and on every `beginRequest()` call (`response` is nulled). This is consistent with the idea's "out of scope: conversation history persistence to vault (deferred)".

### Q3 — Proposal review card

Not implemented in v1. Deferred per the idea's out-of-scope list. Open for v2 design.

### Q4 — Stage-aware suggested starters

Not implemented in v1. Deferred. Open for v2 design.

---

## Market / ecosystem

| Solution | Approach | Strengths | Weaknesses | Source |
|---|---|---|---|---|
| Cursor AI panel | Native IDE sidebar backed by OpenAI / Anthropic APIs; streaming SSE | First-class UX; deep editor integration | Cursor-only; not embeddable in Obsidian | https://www.cursor.com |
| Obsidian Copilot plugin | Community plugin; uses OpenAI / other LLM APIs via `fetch`; no subprocess | Works inside Obsidian today; no CLI dependency | No streaming in all versions; provider lock-in via plugin settings exposed to user | https://github.com/logancyang/obsidian-copilot |
| Obsidian Smart Connections | Embedding-based semantic search + chat; local model option | Vault-aware via embeddings; privacy-friendly | Embedding infra heavy; not suitable for general-purpose agentic chat | https://github.com/brianpetro/obsidian-smart-connections |
| Claude Code SDK (`@anthropic-ai/claude-agent-sdk`) | Node.js SDK wrapping Claude CLI subprocess; `query()` async generator | Official Anthropic tooling; supports tool calls; subprocess isolation | Requires Node.js runtime and binary resolution; cold-start latency | https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk |
| Direct Anthropic Messages API (`@anthropic-ai/sdk`) | REST client; streaming via SSE | No subprocess; simple; browser-compatible | No built-in tool-call loop; no MCP plumbing; API key exposed in renderer process | https://www.npmjs.com/package/@anthropic-ai/sdk |

---

## User needs

These are inferred from the problem statement in `idea.md` and the GitHub issues referenced there (#161, #163, #164, #165). No primary user interviews were conducted before implementation began; the feature was driven by maintainer-authored issues.

- Non-technical users (founders, PMs) need to ask open-ended questions without leaving Obsidian and without writing their own prompts. *(issue #161)*
- Users want AI responses that are aware of what file they are looking at right now, not generic answers. *(issue #163 — active file context)*
- Users need graceful degradation: if Claude CLI is not set up, the rest of the plugin must still work. *(issue #164 — availability check)*
- The interface must not expose AI terminology or configuration surface; it must feel like a first-class feature of Specorator. *(idea.md constraints)*

**Assumptions that must be validated post-ship:**
- The 50 000-token cap is sufficient for typical vault files (< 200 KB) without users ever hitting the trim notice.
- Cold-start latency on `startup()` (adapter init) is imperceptible because it is deferred to `onLayoutReady`.
- Users find a single-turn (maxTurns: 1) response adequate for v1; multi-turn is not missed at this stage.

---

## Alternatives considered

### Alternative A — `@anthropic-ai/claude-agent-sdk` (implemented)

The production adapter (`ClaudeCliAdapter`) imports `query` from `@anthropic-ai/claude-agent-sdk` version `^0.2.141` (pinned range in `package.json`). The SDK exposes an async generator. The adapter iterates it in `_runSdkQuery()`, collecting only `message.type === 'result'` frames, and returns the final `message.result` as a string.

Call signature used in the adapter:

```
sdkQuery({ prompt, options: { maxTurns: 1, abortController: controller } })
```

- `maxTurns` is fixed at 1 in v1; values > 1 are clamped with a warn log.
- `abortController` wires the timeout race: an `AbortController` is created per call, and `controller.abort()` is called in the timeout branch and the `finally` block.

Binary resolution uses `require.resolve('@anthropic-ai/claude-agent-sdk/bin/claude')` (injectable for tests via `resolveCliPath` constructor parameter). The resolved path is validated to be absolute before the adapter marks itself ready.

**Pros:**
- Official Anthropic tooling with subprocess isolation.
- Supports tool calls and MCP plumbing in future turns (v2 path open).
- Narrow port means the call site (`ClaudeCliPort`) never imports from the SDK package.
- The SDK manages subprocess lifecycle; no manual `spawn`/`kill` required.

**Cons:**
- Requires the CLI binary to be resolvable at runtime; adds a hard npm dependency to the plugin bundle.
- Cold-start: `startup()` is called in `onLayoutReady`, not immediately, so the first query after a cold boot may incur init latency.
- The async generator pattern requires iterating to completion to get a result; streaming-to-UI is not exposed in v1 (result is buffered then returned as a string).
- `^0.2.141` is an early semver range; breaking changes in a 0.x SDK are within semver contract.

### Alternative B — `child_process.spawn` (not taken)

A direct Node.js subprocess calling the `claude` CLI binary via `spawn('claude', ['--print', prompt])` and collecting stdout.

**Pros:**
- Zero extra npm dependency beyond Node.js builtins.
- Full control over process lifecycle, stdin/stdout encoding, and streaming.

**Cons:**
- Requires the `claude` binary to be on `PATH` or a known absolute path — unreliable across OS and install methods.
- Manual process management: piping, buffering, exit code handling, timeout via `process.kill()`.
- No access to structured message types; output parsing is fragile.
- Windows `PATH` resolution differs from Unix; the plugin must handle both.
- Harder to test: test doubles must mock the Node.js `child_process` module.
- No forward path to tool calls or MCP without re-implementing what the SDK provides.

### Alternative C — Direct Anthropic Messages REST API (`@anthropic-ai/sdk`)

Use `anthropic.messages.create()` (or the streaming variant) over HTTPS directly from the renderer/plugin process.

**Pros:**
- Browser-compatible; works in standalone UI without a subprocess.
- Streaming SSE is supported; tokens arrive incrementally.
- No binary dependency.

**Cons:**
- The API key would be read in the renderer process and included in every HTTPS request — a weaker security boundary than subprocess isolation.
- No built-in tool-call agent loop; each tool call requires manual orchestration.
- Diverges from the `@anthropic-ai/claude-code` constraint stated explicitly in `idea.md`.
- MCP wiring (the v2 path) requires additional SDK work not present in the REST client.

---

## Technical considerations

### SDK version stability

`@anthropic-ai/claude-agent-sdk@^0.2.141` is a `0.x` release. The `^` range allows patch and minor bumps but semver does not protect against breaking changes in `0.x`. The `_runSdkQuery` loop depends on the `message.type === 'result'` and `message.result` shape. If the SDK renames these fields in a future `0.x` release, the adapter will silently return `undefined` (caught by the `resultText === undefined` guard and converted to a `QUERY_FAILED` error). Monitor the SDK changelog on npm/GitHub before every version bump.

### Binary path resolution and Windows

`require.resolve('@anthropic-ai/claude-agent-sdk/bin/claude')` resolves the path inside `node_modules` — it does not depend on system `PATH`. This is correct and cross-platform. The `isAbsolute(binaryPath)` check is an additional guard. On Windows, `require.resolve` returns a backslash path; `isAbsolute` from Node's `path` module handles this correctly.

### API key handling

The API key (`settings.anthropicApiKey`) is written to `process.env.ANTHROPIC_API_KEY` in both `startup()` and `query()` (re-read at call time so settings changes take effect without restart). The key value is never logged. The `_mapError` helper redacts authentication errors before surfacing them as `API_KEY_MISSING` codes.

### Timeout and abort

Timeout range is clamped to [1 000, 300 000] ms; default is 30 000 ms. The `AbortController` is created per call and aborted in the `finally` block unconditionally, preventing SDK resource leaks on both success and failure paths.

### Sidebar hosting

The chat panel is routed via Vue Router at the `/chat` path. `SpecoratorView` (Obsidian `ItemView` subclass) hosts the full Vue app; the router hash mode (`createWebHashHistory`) means `/chat` works inside Obsidian's embedded web view without a server. The `ClaudeCliAdapter` instance is passed from `main.ts` into `SpecoratorView` and from there into the Vue app via provide/inject using a dedicated `InjectionKey`.

### File-menu integration

The `file-menu` workspace event is registered in `onload()` via `this.registerEvent(...)`. The handler adds an "Add to chat context" item (icon `message-square-plus`) to every file's right-click menu. On click, `activateView()` is awaited, then `useChatStore(this._specoratorView.pinia).addContextFile(...)` is called. The `isAuto: false` flag is set explicitly; the auto slot is managed separately by the `active-leaf-change` event handler.

### Shutdown path

`this.register(() => { this._claudeCliAdapter?.shutdown() })` registers shutdown as an Obsidian plugin unload callback. `shutdown()` is synchronous and fire-and-forget — it resets `_sdkReady` and `_available` flags; no subprocess kill is needed because the SDK manages process lifecycle internally.

### MockClaudeCliPort (dev and test)

`MockClaudeCliPort` defaults `available = false`, so `npm run dev` renders the degraded state without a subprocess. Tests set `available = true` and control `cannedResponse` / `queryError` / `delayMs`. `queryLog` captures every prompt for assertion. The mock is a plain class with no framework dependency, satisfying the narrow-port contract.

---

## Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| RISK-CCS-001 | Claude CLI binary not resolvable (`NOT_INSTALLED`) | high | med | `startup()` catches `require.resolve` failures, sets `_available = false`, logs a warn. UI must render a plain-language install prompt. `isAvailable()` returns false; chat panel is hidden or degraded. |
| RISK-CCS-002 | `ANTHROPIC_API_KEY` missing or empty at query time | high | med | Checked in both `startup()` and `query()`. Returns `API_KEY_MISSING` error code. Settings tab must surface the key field. The key is re-read at call time, so a settings update takes effect without restart. |
| RISK-CCS-003 | Query timeout (default 30 s) under slow network or large prompt | med | med | `timeoutMs` is clamped and configurable per call. `TIMEOUT` error code maps to plain-language UI copy. Caller retains `userText` on timeout so the user can retry. |
| RISK-CCS-004 | SDK `0.x` breaking change — `message.result` field renamed or removed | med | low | Guard `if (resultText === undefined)` converts silently to `QUERY_FAILED`. Pin the `^0.2.141` range and review SDK changelog before upgrades. Add a test that asserts the shape of a real SDK response frame. |
| RISK-CCS-005 | Cold-start latency perceptible to user on first query | low | med | `startup()` is deferred to `onLayoutReady`, not `onload()`. If the vault opens and the user immediately opens chat before startup completes, `isAvailable()` returns false. The adapter's idempotency guard prevents double startup. |
| RISK-CCS-006 | `process.env.ANTHROPIC_API_KEY` visible to other Node.js modules in the same process | med | low | This is a property of running in Electron/Node.js. The key is not logged and not exposed to the renderer DOM. No mitigation within the current architecture; v2 could move the API call to a background worker or main-process IPC. |
| RISK-CCS-007 | Windows path handling edge cases in binary resolution | low | low | `isAbsolute()` guards against relative paths. `require.resolve` is cross-platform. Covered by unit tests with injectable `resolveCliPath`. |
| RISK-CCS-008 | Context truncation notice confuses non-technical users | low | med | `buildPrompt()` returns `truncated: true`; the store exposes `truncated` ref. UI must render a plain-language trim notice (REQ-CCS-012). Copy must not say "token" or "context window". |

---

## Recommendation

**Alternative A (`@anthropic-ai/claude-agent-sdk`) is the correct choice and is already implemented.**

The rationale:

1. The idea's constraint ("must use `@anthropic-ai/claude-code` SDK") rules out Alternatives B and C directly. Alternative A is the only option that satisfies that constraint.
2. The narrow `ClaudeCliPort` seam means the SDK is isolated to `ClaudeCliAdapter`; future versions can swap it (e.g., for a streaming adapter in v2) without changing any call site in the application or UI layers.
3. `require.resolve`-based binary path resolution is more reliable than `PATH`-based lookup (`spawn`) and is cross-platform, including Windows.
4. The `MockClaudeCliPort` provides a clean test double that covers all error modes without subprocess infrastructure.

**What still needs validating before Requirements are finalised:**

- The 50 000-token default cap and the 4 chars/token approximation should be validated against real vault file sizes from representative users.
- The `0.x` SDK dependency should be tracked; a renovation task to pin to a `1.x` release once the SDK stabilises would reduce upgrade risk.
- Streaming-to-UI (token-by-token rendering) is not delivered in v1. If user research confirms that perceived latency on large prompts is a pain point, the port interface will need a `queryStream()` method in v2. The current `ClaudeCliPort.query()` signature does not accommodate streaming without a breaking change.
- Multi-turn (`maxTurns > 1`) clamping to 1 is logged at warn. If the PM decides multi-turn is in scope for v1.x, the clamp must be lifted and `ClaudeCliAdapter._runSdkQuery()` updated to handle intermediate message frames.

---

## Sources

- @anthropic-ai/claude-agent-sdk on npm — https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
- Cursor AI sidebar — https://www.cursor.com
- Obsidian Copilot plugin — https://github.com/logancyang/obsidian-copilot
- Obsidian Smart Connections — https://github.com/brianpetro/obsidian-smart-connections
- Node.js path.isAbsolute documentation — https://nodejs.org/api/path.html#pathisabsolutepath
- Node.js require.resolve documentation — https://nodejs.org/api/modules.html#requireresolverequest-options
- @anthropic-ai/sdk (Messages REST client) — https://www.npmjs.com/package/@anthropic-ai/sdk

---

## Quality gate

- [x] Each research question is answered or marked open.
- [x] Sources cited.
- [x] >= 2 alternatives explored.
- [x] User needs supported by evidence (or assumptions explicit).
- [x] Technical considerations noted.
- [x] Risks listed with severity.
- [x] Recommendation made.
