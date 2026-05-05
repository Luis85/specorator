---
term: "ClaudeCliPort"
aliases: ["claude-cli-port", "ClaudeCliPort interface"]
category: technical
status: stable
version: "v1"
related:
  - runtime-port.md
  - narrow-port.md
  - chat-sidebar.md
  - mcp-server.md
issues:
  - "#161"
  - "#23"
last_updated: 2026-05-05
---

# ClaudeCliPort

The narrow port interface that abstracts the Claude CLI subprocess from the chat sidebar UI. Defined in `src/domain/ports/` as part of the W13 port set (#163), it is the **v2.0 upgrade seam**: in v2.0 it is replaced by `RuntimePort` without any change to the sidebar UI.

## Interface

```ts
interface ClaudeCliPort {
  isAvailable(): Promise<boolean>;
  sendMessage(params: {
    systemPrompt: string;           // assembled context layers; never shown to user
    conversationHistory: Message[];
    userMessage: string;
  }): AsyncIterable<string>;        // streaming token chunks
}
```

## Why this seam exists

The chat sidebar must not know whether it is talking to a local `claude` subprocess (v1) or a `specorator-runtime` orchestration session (v2.0). `ClaudeCliPort` is the boundary that enforces this ignorance. The port has a mock implementation for `npm run dev` (no subprocess needed) and an `ObsidianClaudeCliAdapter` for production.

## v1 implementation

`ObsidianClaudeCliAdapter` spawns the `claude` CLI subprocess configured with `--mcp-server` pointing to Specorator's native MCP server. The subprocess streams token chunks back through the port.

## v2.0 migration

`RuntimePort` satisfies the same interface, routing through `specorator-runtime` instead of a CLI subprocess. The sidebar Vue component never needs to change; only the port binding changes.
