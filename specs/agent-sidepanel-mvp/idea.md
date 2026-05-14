---
id: IDEA-ASM-001
title: "Agent Sidepanel MVP — Increment 1"
stage: idea
feature: agent-sidepanel-mvp
status: accepted
owner: pm
created: 2026-05-14
updated: 2026-05-14
references:
  - path: "inputs/sidepanel-design-2026-05/README.md"
  - path: "inputs/sidepanel-design-2026-05/Sidepanel_Design_Brief.html"
  - path: "inputs/sidepanel-design-2026-05/Sidepanel_MVP.html"
  - spec: "specs/claude-cli-chat-sidebar/idea.md"
  - spec: "specs/claude-cli-chat-sidebar/requirements.md"
  - spec: "specs/claude-cli-chat-sidebar/design.md"
---

## Problem statement

The shipped chat sidebar (`claude-cli-chat-sidebar`, REQ-CCS-001 through REQ-CCS-028) only talks to Claude through the Agent SDK with an `ANTHROPIC_API_KEY`. Many Specorator users hold a Claude.ai subscription and have no API key — they are locked out of the sidebar entirely (it shows the REQ-CCS-018 "API key missing" degraded state). The sidebar is also read-only: it can reference the active file but cannot propose vault changes. Increment 1 of the Agent Sidepanel design brief (May 2026) closes both gaps: subscription users can chat, and the assistant can offer file-creation proposals the user explicitly accepts before anything is written.

## Primary users

- **Subscription holders without an API key** — currently blocked from the sidebar; the largest cohort per the design brief.
- **Existing API-key users** (REQ-CCS-001 path) — unaffected on the transport side, but gain JSON-structured file-creation proposals.
- **Stage-driven workflow users** who want the assistant's answers shaped by the active feature's `workflow-state.md`.

## Success criteria

- A user with an active Claude subscription and no API key can open the sidebar, send a prompt, and receive a reply — without ever pasting credentials into the plugin.
- A user with only an API key continues to chat exactly as today (REQ-CCS-013 behaviour preserved).
- Every prompt the user sends and every reply the model returns is persisted so the conversation survives Obsidian restarts.
- When both a working `ANTHROPIC_API_KEY` and a discoverable `claude` CLI are present, transport selection is deterministic and user-visible (no silent switching mid-session).
- When the assistant proposes a new file, it appears as a proposal card; nothing lands in the vault until the user clicks Accept.
- The prompt sent to the model is automatically enriched with the active file (reusing REQ-CCS-005) and a stage-aware preamble derived from the active feature's `workflow-state.md`.
- Replies used for structured operations (file proposals) are valid JSON and validated at the boundary; free-text chat replies remain plain text.

## Constraints

- **Anthropic Terms of Service** forbid brokering claude.ai login. The plugin must never read or transmit `~/.claude/.credentials.json`; the user installs the `claude` CLI themselves and the plugin shells out to it.
- **Two transports, one port.** Keep the existing `ClaudeCliAdapter` (Agent SDK + `ANTHROPIC_API_KEY`); add a second adapter that spawns the user's local `claude` binary. Both sit behind the same narrow domain port (ADR-008).
- **Do not pass `--bare`** to the subscription subprocess — bare mode disables OAuth and forces an API key, defeating the whole point.
- **Structured output** uses `--output-format json --json-schema '<schema>'`; the plugin reads the `structured_output` field and validates with Zod at the application boundary.
- **Session continuity** captures `session_id` from the CLI's `system/init` event and resumes with `--resume <id>`. The plugin stores only the `session_id` and its own message log — never duplicating the JSONL files under `~/.claude/projects/...`.
- **PATH discovery is unreliable** from GUI-launched Electron; a Settings field ("Claude CLI path") with auto-detection via `sh -lc 'command -v claude'` is mandatory.
- **DDD + narrow ports** (ADR-008): both adapters live in `src/infrastructure/`, the Vue sidebar imports neither; new vault writes route through `VaultPort`.
- **Trust-first writes:** no model-proposed file lands in the vault without an explicit user accept gesture.

## Research questions

- What is the JSON schema for the structured envelope? Minimum is `{ action: 'createFile', path, content }`; should it also carry a rationale, folder hint, or diff for future edits?
- How does the CLI subprocess stream stdout under Obsidian's Electron renderer — line-buffered, chunked, or fully buffered? Does `stream-json` parse cleanly with Node's `child_process` line reader?
- Where should per-session message logs live? Options: `specs/<active-feature>/sessions/<session-id>.md`, top-level `.specorator/sessions/`, or plugin data dir — affects portability and Obsidian Sync (cf. REQ-CCS-028).
- How does the plugin detect on first run whether the user has a subscription, an API key, both, or neither — and what is the fallback ordering?
- How should we surface CLI-not-installed errors in plain language, consistent with REQ-CCS-019?

## Preliminary scope

**In scope (Increment 1):** transport selection (API-key vs CLI subprocess adapter) behind one narrow port; stage-aware system-prompt assembly from `workflow-state.md`; JSON output discipline with Zod validation; per-session message log persisted to a deterministic vault path; active-file auto-context (reuses REQ-CCS-005, REQ-CCS-006); LLM-proposed file creation as accept/reject proposal cards via `VaultPort`; Settings field for the `claude` binary path with auto-detection.

**Out of scope (deferred per design brief):** autonomy dial UI, vault folder filter, streaming step log, redirect/stop controls (Increment 2); Tasks tab, Session tab, undo window (Increment 3); slash command palette and PR lifecycle cards (Increment 4); stage tracker and lifecycle gate (Increment 5).
