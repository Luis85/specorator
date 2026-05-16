---
id: IDEA-CIB-001
title: "Claude CLI IDE bridge — vault-aware terminal sidepanel"
stage: idea
feature: claude-cli-ide-bridge
status: accepted
owner: pm
created: 2026-05-16
updated: 2026-05-16
references:
  - specs/terminal-sidepanel/idea.md
  - specs/claude-cli-chat-sidebar/idea.md
---

## Problem statement

A transparent `claude` interactive session embedded in the Obsidian sidepanel (IDEA-TSP-001) is a strong baseline but treats Claude as a black box: the model has no awareness of the active note, the user's selection, which files the user has open, or where the vault root sits. The user must paste paths, copy text, and narrate context by hand — exactly the friction the plugin exists to remove. Claude Code already ships a documented IDE integration protocol (used by the VS Code and JetBrains plugins, and reverse-engineered by Neovim, Emacs, Nova, and at least one Obsidian community plugin) that solves this by exposing a local WebSocket MCP server. When the CLI is launched with the right environment variables, it discovers the IDE through a lock file in `~/.claude/ide/`, authenticates, and gains access to a fixed set of editor-state tools (`getCurrentSelection`, `getOpenEditors`, `getWorkspaceFolders`, `openFile`, `openDiff`, etc.) plus inbound notifications (`selection_changed`, `at_mentioned`). This feature wires that protocol to the Obsidian workspace so the embedded terminal session is no longer transparent — it is ambient-context-aware in the same way the VS Code and JetBrains integrations are.

## Primary users

- **Developers and technical PMs** already using the terminal sidepanel (IDEA-TSP-001) who want Claude to see the active note and selection without re-pasting them every turn.
- **Plugin authors and contributors** who want to ask Claude about the file they are currently editing, request a diff against it, and accept or reject the change without leaving Obsidian.
- **Any vault user** who runs Claude Code locally and expects the same "Cursor-like" awareness they get in their code editor when they bring their notes into the picture.

## Success criteria

- Opening the terminal sidepanel with Claude installed launches an interactive session **and** simultaneously starts a localhost WebSocket MCP server bound to `127.0.0.1` on a random high port.
- Before the `claude` subprocess is spawned, the plugin writes `~/.claude/ide/<port>.lock` (mode `0600` in a `0700` directory) containing the documented schema: `pid`, `workspaceFolders`, `ideName: "Obsidian"`, `transport: "ws"`, and a per-session UUID `authToken`.
- The plugin sets `CLAUDE_CODE_SSE_PORT=<port>` and `ENABLE_IDE_INTEGRATION=true` in the environment of the spawned subprocess so Claude auto-discovers the bridge.
- Claude can call at least the core five tools and receive correct Obsidian state: `getCurrentSelection`, `getLatestSelection`, `getOpenEditors`, `getWorkspaceFolders`, `openFile`.
- The plugin handles `openDiff` by rendering a side-by-side diff modal inside Obsidian, blocks the JSON-RPC response until the user accepts or rejects, and returns `FILE_SAVED` or `DIFF_REJECTED` to Claude exactly as the protocol specifies.
- The plugin emits `selection_changed` notifications (debounced at 150 ms) when the active editor's selection or active leaf changes.
- The existing "Add to chat context" right-click action (REQ-CCS-009) sends an `at_mentioned` notification to Claude in addition to its current chat-sidebar effect, so Claude is told about the file the user just pinned.
- WebSocket upgrade requests without a valid `x-claude-code-ide-authorization` header matching the session `authToken` are rejected with HTTP 401 (CVE-2025-52882 mitigation).
- When the terminal panel closes or the plugin unloads, the WebSocket server is stopped, the lock file is deleted, and any in-flight `openDiff` deferrals resolve as `DIFF_REJECTED` so Claude is not left hanging.
- Without Claude CLI installed, the bridge still starts (so other Claude clients on the same machine could connect) but the terminal panel shows the existing TSP not-installed message; the two states are independent.

## Constraints

- **Builds on IDEA-TSP-001.** The terminal sidepanel is a prerequisite. If `terminal-sidepanel` ships without the bridge, this feature layers on top; if both are merged together, the bridge launches alongside the PTY. No reimplementation of PTY or xterm.js work.
- **Narrow port (ADR-008).** A new domain port `IDEServerPort` declares `start(workspaceFolders)`, `stop()`, `isRunning()`, `notify(method, params)`, and `onToolCall(handler)`. No call site imports `ws`, `http`, or Node networking primitives.
- **Tool-handler boundary.** A separate `IDEToolHandlerPort` (or an `IDEServerPort` constructor parameter) routes inbound `tools/call` JSON-RPC requests to Obsidian state via `WorkspacePort`, `VaultPort`, and a new diff-modal helper. Vue components and the domain layer never see raw JSON-RPC.
- **Auth correctness.** The `authToken` is a v4 UUID generated per session, written to the lock file with `chmod 0600`, validated on every WebSocket upgrade, and never logged. Compare in constant time to defeat timing attacks.
- **Localhost only.** Server binds to `127.0.0.1` (not `0.0.0.0`); reject upgrades from any non-loopback `Host` header.
- **Reverse-engineered protocol.** The schema is not contractually guaranteed by Anthropic. Tool handlers must validate inbound shapes (Zod or hand-rolled) and degrade gracefully on unknown fields. A single tool-name registry isolates protocol drift to one file.
- **No mobile.** The bridge requires Node networking and a localhost subprocess — desktop Electron only. The standalone browser UI and mobile platforms must hide the feature entirely.
- **Mocks for dev.** `MockIDEServerPort` records calls and lets tests assert tool routing without opening a socket. The bridge must not start in MockBridge or LocalStorageBridge contexts.
- **Existing chat sidebar untouched.** The `claude-cli-chat-sidebar` feature continues to work via the SDK's `query()` headless path; this bridge does not alter `ClaudeCliPort` or `ClaudeCliAdapter`.

## Research questions

- Which Node WebSocket implementation is acceptable inside an Obsidian plugin bundle — `ws` (most common, MIT, no native deps) vs. a hand-rolled server using `http.createServer` + the upgrade handshake from `crypto.createHash('sha1')`? Bundle size and CSP/sandbox compatibility decide.
- The protocol spec is reverse-engineered from `coder/claudecode.nvim`'s `PROTOCOL.md`. What is the minimum tool surface Claude Code actually invokes during a normal session? `getCurrentSelection`, `getOpenEditors`, `openDiff` are confirmed; the rest may be optional. Cap the v1 surface to what proves out the bridge.
- How does `openDiff`'s blocking semantics interact with Obsidian's `Modal` lifecycle? The protocol expects the JSON-RPC response to be deferred until the user clicks accept or reject. Pattern: keep a `Map<requestId, deferredResolve>` and complete it from the modal's `onClose` handler.
- `checkDocumentDirty` and `saveDocument` assume an IDE that does not autosave. Obsidian autosaves. What is the right answer — always report `isDirty: false`, or track unsaved edits via the `editor-change` event?
- `getDiagnostics` expects language-server style errors. The vault has no LSP. Return an empty array, or attempt a markdown linter integration (out of scope for v1)?
- The `executeCode` tool runs Python in a Jupyter kernel. Should the bridge stub it with a "not supported" response, or omit it from `tools/list` entirely?
- Where should the diff modal accept-action persist its result — overwrite the vault file directly via `VaultPort.writeFile`, or stage it through a workflow review queue?
- Will running the bridge on a port collide with a concurrent VS Code or JetBrains IDE on the same machine? Both write to `~/.claude/ide/`. Confirm Claude's discovery logic picks the lock file whose port matches `CLAUDE_CODE_SSE_PORT` and ignores siblings.

## Preliminary scope

**In scope:**
- `IDEServerPort` narrow domain port (`src/domain/ports/IDEServerPort.ts`).
- `LocalIDEServer` infrastructure implementation using `ws` (or hand-rolled handshake) — lock file write/delete, auth header validation, `127.0.0.1` binding, JSON-RPC 2.0 framing, MCP `initialize` / `tools/list` / `tools/call` handlers, deferred-response support for blocking tools.
- `ObsidianIDEToolHandlers` (infrastructure/obsidian) implementing the five core tools (`getCurrentSelection`, `getLatestSelection`, `getOpenEditors`, `getWorkspaceFolders`, `openFile`) and `openDiff` plus the cleanup tools (`close_tab`, `closeAllDiffTabs`).
- Stub responses for `checkDocumentDirty`, `saveDocument`, `getDiagnostics`, `executeCode` so Claude never receives a JSON-RPC error from a `tools/list`-advertised tool.
- `IDEDiffModal` Vue/Obsidian modal — side-by-side or unified diff view, accept/reject buttons, blocks the underlying tool-call response until dismissed.
- Notification emitters: workspace `active-leaf-change` and editor selection events → debounced `selection_changed` over WS.
- `at_mentioned` notification on the existing "Add to chat context" file-menu action.
- Env-var injection (`CLAUDE_CODE_SSE_PORT`, `ENABLE_IDE_INTEGRATION`) in the terminal sidepanel's PTY spawn call (extends IDEA-TSP-001 wiring).
- Server lifecycle hooks: start on panel open, stop on panel close and `onunload`; clean up the lock file in both paths and on unexpected exit.
- `MockIDEServerPort` for dev/test; bridge disabled in MockBridge and LocalStorageBridge contexts.

**Out of scope:**
- `getDiagnostics` integration with any real linter — return `[]`.
- `executeCode` Jupyter execution — return `not supported`.
- Multi-tab diff queueing or persistent review history — each `openDiff` is a single modal lifetime.
- Cross-vault or multi-root workspace support — `getWorkspaceFolders` returns the single vault root.
- Sharing the bridge between the chat sidebar and the terminal panel (the user has chosen 4A; 4B/dual-runtime is a follow-on scope).
- Windows PTY support inherits from IDEA-TSP-001's out-of-scope list; the bridge itself is platform-portable, but the terminal it accompanies is not.
- Sharing connection state across plugin reloads or vault switches.
- Authentication beyond the per-session UUID (no OAuth, no API-key-derived tokens).
