---
id: IDEA-TSP-001
title: "Terminal sidepanel — embedded Claude CLI interactive session"
stage: idea
feature: terminal-sidepanel
status: accepted
owner: pm
created: 2026-05-10
updated: 2026-05-10
references:
  - specs/claude-cli-chat-sidebar/idea.md
---

## Problem statement

The full Claude CLI chat sidebar (IDEA-CCS-001) requires a custom streaming chat UI, five-layer context assembly, write-operation review cards, and SDK subprocess management — a significant implementation surface. Users need a working AI interaction point in the plugin now, not after all of that is built. The simplest credible first version is: spawn a `claude` CLI interactive session as a child process and display it in the Obsidian sidepanel through an embedded terminal emulator. The user gets the full Claude CLI experience — slash commands, multi-turn conversation, tool use — without the plugin needing to mediate any of it.

## Primary users

- **Developers and technical PMs** who are comfortable with a CLI and want to start using Claude inside Obsidian immediately.
- **Any user** who has Claude CLI installed and wants AI assistance scoped to their vault without switching applications.

## Success criteria

- Opening the terminal sidepanel launches a `claude` interactive session inside Obsidian with no extra configuration.
- The terminal renders ANSI colors, cursor movement, and interactive input correctly (full PTY semantics, not line-buffered pipe).
- The user can type, submit, and receive multi-turn responses exactly as they would in a system terminal running `claude`.
- When Claude CLI is not installed or not on `PATH`, the panel shows a plain-language install prompt rather than a blank or broken terminal.
- The session persists while the sidepanel is open; closing and reopening the panel starts a fresh session (no zombie processes left behind).
- The terminal respects the Obsidian theme (background, text color) and is legible in both light and dark mode.
- Works in the Obsidian desktop app (Electron); gracefully disabled in the standalone browser UI with an explanatory message.

## Constraints

- Obsidian runs on Electron. The terminal emulator library (`xterm.js`) and PTY library (`node-pty`) must be compatible with Obsidian's bundled Electron and Node.js versions. `node-pty` is a native addon and must be pre-built for the correct Electron ABI (via `electron-rebuild` or bundled prebuilds).
- `TerminalPort` must be a narrow domain port (ADR-008 pattern) — a stable seam so the implementation can evolve without changing call sites in the UI.
- All process lifecycle operations (spawn, write, resize, kill) go through `TerminalPort`; no direct `child_process` or `node-pty` calls from Vue components.
- The terminal sidepanel must not be registered or rendered in MockBridge or LocalStorageBridge environments (standalone browser UI, tests) — those contexts have no process-spawning capability.
- No modification to the Claude CLI session itself: no system-prompt injection, no automatic file reads, no intercepted output. The terminal is a transparent passthrough.
- Must degrade gracefully: if `claude` is not found on `PATH`, show a clear message with install instructions; all other plugin features remain available.

## Research questions

- What is the correct approach to bundle `node-pty` (a native Node.js addon) inside an Obsidian plugin without breaking the Electron sandbox? Does `electron-rebuild` work reliably, or are prebuilt binaries for each Electron version the better path?
- Does Obsidian's CSP and plugin sandbox allow loading `node-pty`'s `.node` binary at runtime?
- How should terminal resize events be communicated from the `xterm.js` component to the `node-pty` process? (FitAddon + ResizeObserver is the standard approach — confirm it works inside Obsidian's leaf view.)
- Is there a risk of zombie `claude` processes if Obsidian closes unexpectedly, and how should cleanup be handled in the plugin's `onunload` hook?
- Should the initial working directory for the spawned `claude` session be set to the vault root, so Claude CLI's file tool calls land in the vault by default?

## Preliminary scope

**In scope:**
- `TerminalPort` narrow port interface (`spawn`, `write`, `resize`, `kill`, `onData`, `onExit`) in `src/domain/ports/`
- `ObsidianTerminalAdapter` implementing `TerminalPort` via `node-pty` in `src/infrastructure/obsidian/`
- `TerminalSidepanelView` — Obsidian `ItemView` subclass registered in `src/plugin/`
- Vue component `TerminalPane.vue` wrapping `xterm.js` and its `FitAddon`
- Graceful not-installed state: detect `claude` on `PATH` at panel open; show install guidance if missing
- Process cleanup in plugin `onunload` and on panel close
- `NullTerminalAdapter` stub for non-Obsidian environments (returns capability flag `supported: false`)

**Out of scope:**
- Context injection (vault files, workflow state) into the Claude CLI session — that is IDEA-CCS-001 territory
- Custom commands or slash-command interception
- Conversation history persistence
- MockBridge or LocalStorageBridge terminal implementations
- Any UI chrome beyond the raw terminal (no toolbar, no title bar, no controls in v1)
- Windows support (PTY semantics on Windows differ; v1 targets macOS/Linux only)
