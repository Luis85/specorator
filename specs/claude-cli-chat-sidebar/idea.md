---
id: IDEA-CCS-001
title: "Claude CLI chat sidebar"
stage: idea
feature: claude-cli-chat-sidebar
status: accepted
owner: pm
created: 2026-05-05
updated: 2026-05-05
references:
  - github: "luis85/specorator#161"
  - github: "luis85/specorator#163"
  - github: "luis85/specorator#164"
  - github: "luis85/specorator#165"
---

## Problem statement

Specorator users — including non-technical founders, product managers, and business analysts — need a natural, always-accessible way to interact with an AI assistant while working in their Obsidian vault. Without a chat interface, users must either operate manually through static plugin commands or leave Obsidian to use a separate AI tool. Neither option is acceptable: static commands lack the flexibility to handle the open-ended questions that arise at every workflow stage, and leaving Obsidian breaks the flow and loses vault context. The plugin must provide a first-class AI conversation surface that understands where the user is in their workflow and what is in their vault.

## Primary users

- **Non-technical founders and PMs** who want to express ideas in natural language and receive structured, actionable output.
- **Solo developers and engineering leads** who want AI assistance scoped to the active workflow stage without writing prompts manually.
- **Any user at any stage** who wants to ask a question, get a suggestion, or request a draft without knowing the underlying methodology.

## Success criteria

- A Cursor-like side panel is always visible in Obsidian and shows a warm, context-aware greeter using the user's name.
- The panel provides stage-appropriate suggested actions ("Write this up", "What should I do next?", "Help me think through this") that users can tap without typing.
- Sending a message streams the response in real time with visible progress.
- Agent responses are aware of: (1) the user's persona, (2) the active file and its metadata, (3) the current workflow stage, (4) opted-in vault context files.
- Agents interact with the vault through the embedded MCP server (tool calls), not through system-prompt text injection.
- Write operations surface as review cards in the sidebar; the user accepts or rejects before anything is applied to the vault.
- The interface uses plain language throughout — no AI terminology, prompt references, or methodology jargon.
- The sidebar is accessible via `obsidian://specorator?action=open-chat` and `obsidian://specorator?action=send-message&text=...`.

## Constraints

- Must use the `@anthropic-ai/claude-code` SDK for Claude CLI subprocess management.
- `ClaudeCliPort` must be a narrow domain port (ADR-008 pattern) — designed as a stable seam that v2.0 satisfies with `RuntimePort` without modifying call sites.
- Must degrade gracefully when Claude CLI is not installed: chat is hidden or shows a plain-language install prompt; all other plugin capabilities remain available.
- The sidebar must work in both Obsidian and standalone browser UI contexts (MockBridge and LocalStorageBridge).
- No AI terminology, system-prompt references, or configuration surface is exposed to the user.
- All context assembly (persona, active file, workflow state, opt-in files) happens silently before each message.

## Research questions

- What is the minimum context payload (Layer 0–4) that makes responses meaningfully more relevant without exceeding Claude CLI's context limits for typical vault sizes?
- How should conversation history be managed across sessions — persisted in the vault, in plugin settings, or kept in memory only?
- What is the right interaction model for the proposal review card — inline in the chat stream, or a separate review panel?
- How should suggested conversation starters be determined per stage — hardcoded per stage slug, or driven by active artifact state?

## Preliminary scope

**In scope:** `ClaudeCliPort` narrow port; `ClaudeCliAdapter` using `@anthropic-ai/claude-code` SDK; five-layer context assembly (`buildSystemPrompt()`); streaming response rendering; stage-aware suggested starters; write-operation proposal cards; `obsidian://specorator` URI handlers for chat actions; plain-language error messages; MockBridge stub for browser/test.

**Out of scope:** Conversation history persistence to vault (deferred), provider selection UI, API key management, fine-tuning or model configuration, multi-agent orchestration (v2.0), direct `agentonomous` integration.
