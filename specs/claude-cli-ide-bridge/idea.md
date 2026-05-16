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
depends_on:
  - IDEA-TSP-001
---

## Problem statement

An embedded `claude` interactive session in the Obsidian sidepanel (IDEA-TSP-001) cannot see the user's active note, current selection, list of open tabs, or vault root. Every turn of conversation forces the user to copy text, paste paths, and narrate context the model could have read for itself. The two existing AI surfaces in this plugin — the chat sidebar (IDEA-CCS-001) and the planned terminal panel — both inherit this blindness. Specorator needs a way to give Claude the same ambient awareness of the Obsidian workspace that the official VS Code and JetBrains plugins give Claude of those IDEs.

## Primary users

- **Developers and technical PMs** already using or planning to use the terminal sidepanel (IDEA-TSP-001) who want Claude's responses to be grounded in the note they are currently editing, not in pasted snippets.
- **Plugin contributors** who want to ask Claude about the file under the cursor and accept or reject a proposed change without leaving Obsidian.
- *Non-goal users:* non-technical founders and PMs covered by IDEA-CCS-001 — their interaction surface stays the chat sidebar; this feature is desktop + CLI-installed only.

## Success criteria

- With the terminal panel open and `claude` running, Claude responds correctly to questions that depend on knowing which note is currently active, what is selected in it, and which other notes are open — without the user typing or pasting that context.
- Claude can request to open a note in Obsidian and the correct note opens in the workspace.
- Claude can propose a change to a vault file; the user sees a side-by-side diff inside Obsidian, accepts or rejects, and Claude is told the outcome.
- Adding a file to chat context via the existing right-click action (REQ-CCS-009) makes the same file visible to the Claude session running in the terminal.
- When `claude` is not installed, the terminal panel's existing not-installed message is shown; the bridge silently does not start. The two surfaces degrade independently.
- The bridge has no perceptible effect on Obsidian startup time and no perceptible effect on responsiveness during normal note editing.
- Closing the terminal panel, unloading the plugin, or quitting Obsidian leaves no orphan processes, no listening sockets, and no stale state in `~/.claude/ide/`.
- A second Obsidian window or a concurrent VS Code / JetBrains session on the same machine does not interfere with this bridge and is not interfered with by it.

## Constraints

- **Depends on IDEA-TSP-001.** The terminal sidepanel is the spawn site; this feature does not duplicate PTY work. TSP must expose a hook for the bridge to inject environment variables into the spawned child before this feature reaches design.
- **Narrow ports (ADR-008).** Two new domain ports — one for the network server's lifecycle, one for the diff-confirmation modal (mirroring `ConfirmModalPort`). Tool dispatch is an application-layer service (a use case per protocol verb), not a port. Domain layer never imports `ws`, `http`, `obsidian`, or Vue.
- **Result type (ADR-004).** All fallible port methods return `Promise<Result<T, E>>` with discriminated error codes.
- **No new domain concepts leak into UI.** The diff modal is built with Obsidian helpers (`createEl`, `setText`) per the no-`innerHTML` / no-`v-html` rules in CLAUDE.md.
- **No `window.confirm`/`alert`/`prompt`.** Accept/reject flow uses an Obsidian `Modal` subclass behind a port, consistent with the existing `ConfirmModalPort` pattern.
- **Localhost-only network surface.** The WebSocket server binds to the loopback interface, validates the upgrade authorisation header before completing the handshake, rejects browser-origin requests, and is unreachable from outside the local machine. CVE-2025-52882 mitigations are the floor, not the ceiling.
- **Vault-scoped path validation.** Inbound tool calls that name a filesystem path are resolved and rejected unless they fall inside the active vault root. `VaultPort` semantics extend to the bridge.
- **No mutation of the plugin's own `process.env`.** Environment variables for Claude are passed through the spawn's `env` option only.
- **Reverse-engineered protocol.** The wire format is not contractually guaranteed by Anthropic. Inbound message shapes are validated, unknown fields are tolerated, and protocol drift is isolated to one adapter.
- **No mobile, no browser.** The bridge is disabled in MockBridge and LocalStorageBridge contexts and on Obsidian mobile. Composables resolve to a no-op stub in those environments so call sites do not need to branch.

## Research questions

### Protocol and integration
- The MCP `initialize` handshake's `protocolVersion`, `capabilities`, and `serverInfo` payload for this protocol family are pinned at `2024-11-05` by every open-source reverse-engineered implementation we have seen — confirm this is what the current `claude` CLI accepts and whether it will accept the next MCP version when negotiating.
- Which subset of the twelve protocol tools does Claude Code actually invoke during normal interactive use, and which are dead weight for a v1 surface?
- How does Claude resolve which lockfile to use when multiple are present in `~/.claude/ide/`? Confirm `CLAUDE_CODE_SSE_PORT` strictly disambiguates and there is no silent first-lockfile-wins fallback.
- `selection_changed` and `at_mentioned` debounce windows are implementation-defined across known clients; what window does Specorator want?

### Failure modes and lifecycle
- After an unclean Obsidian exit, who reaps stale lockfiles in `~/.claude/ide/`? Per-startup sweep that validates `pid` liveness is the working hypothesis — confirm cross-platform.
- What happens to an in-flight `openDiff` if the WebSocket disconnects, the plugin unloads, or the modal is dismissed without a decision? Default-reject is the working answer; confirm Claude tolerates it.
- Does the bridge's lifecycle belong to the terminal panel (start on panel open, stop on close) or to `PluginCore` (start on plugin load, stop on unload)? ADR target.
- How does the bridge co-exist with an Obsidian session that has multiple windows or multiple vaults open simultaneously?

### Security
- Beyond the loopback bind, `Origin` rejection, and the per-session UUID auth header, what additional defence in depth is justified — message-size caps, in-flight diff cap, connection cap, rate limits?
- The auth token sits in a file readable by any process running as the current user. Document this same-UID threat boundary and confirm it is acceptable for v1.
- On Windows, file mode bits are meaningless; what is the right ACL story for the lockfile and its parent directory? Or accept that the same-UID boundary is the practical floor on every platform?
- How is autosave (Obsidian) reconciled with `checkDocumentDirty` and `saveDocument` (assume manual save)? Hard-code `isDirty: false` is the working answer.

### UX and integration with existing features
- `openDiff` accept path: should the bridge write via `VaultPort.writeFile` directly, or route through the existing `proposeFileWrite` / `commitFileWriteProposal` envelope (per ADR-0032)?
- The "Add to chat context" file-menu action (REQ-CCS-009) currently mutates chat-store state. Should the bridge subscribe to a domain event emitted by that action, or should the action be lifted into an event-bus emitter that both the chat sidebar and the bridge consume?
- Which WebSocket library to bundle, what does it cost the plugin bundle, and is there any precedent in the existing Specorator dependency graph?
- Which Obsidian editor event surface gives a reliable "selection changed" signal — `editor-change`, `active-leaf-change`, or a CodeMirror 6 `EditorView.updateListener` registered via `registerEditorExtension`?

## Preliminary scope

**In scope**
- Two new domain ports — one for the local server's lifecycle, one for the diff confirmation modal — plus their adapter implementations and no-op stubs for MockBridge/LocalStorageBridge.
- An application-layer dispatcher with one use case per protocol tool, routing inbound tool calls through `WorkspacePort`, `VaultPort`, and the new diff-modal port.
- A side-by-side diff modal built with Obsidian primitives, blocking the in-flight tool response until the user decides.
- The full set of inbound tool verbs declared in the protocol, with the editor-state and file-action verbs (selection, open editors, workspace folders, open file, open diff, close tab) wired to Obsidian state, and the autosave/diagnostics/Jupyter verbs answered with documented no-op or "not supported" responses so Claude never receives an unknown-tool error.
- IDE-side notifications mapped from Obsidian workspace and editor events.
- An environment-variable hand-off to the terminal panel's spawn call so Claude discovers the bridge automatically.
- Lockfile lifecycle: write before spawn, delete on shutdown, sweep stale entries on next start.
- Cross-vault and multi-window safety — each Obsidian instance runs its own bridge on its own port, ignores siblings.

**Out of scope**
- Real language-server diagnostics or markdown-linter integration.
- Jupyter / `executeCode` integration.
- Persistence of accepted diffs as a review queue or history.
- A second runtime path — running the bridge alongside the headless chat sidebar (IDEA-CCS-001) instead of the terminal panel. That is a follow-on scope.
- Multi-root workspaces — `getWorkspaceFolders` returns the single vault root.
- Sharing connection state across plugin reloads or vault switches.
- Authentication beyond the per-session UUID — no OAuth, no API-key-derived tokens.
- Windows PTY support (inherits from IDEA-TSP-001's out-of-scope list).
- Sharing the bridge port across Obsidian windows or with non-Claude clients.
