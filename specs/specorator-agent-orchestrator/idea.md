---
id: IDEA-SAO-001
title: "Specorator Agent Orchestrator — Symphony-inspired autonomous agent dispatch"
stage: idea
feature: specorator-agent-orchestrator
status: accepted
owner: pm
created: 2026-05-09
updated: 2026-05-09
references:
  - external: "https://github.com/openai/symphony/blob/main/SPEC.md"
  - feature: "agent-interaction-placeholder"
  - feature: "claude-cli-chat-sidebar"
---

## Problem statement

Specorator users manually advance features through workflow stages and manually draft every stage artifact. For teams with many in-flight features — or solo users who want to delegate drafting to an AI agent — there is no automation layer. Every stage advance, every document draft, every follow-up prompt is manual. This bottleneck becomes acute as the number of active features grows, and it leaves significant value on the table: the plugin has full context (vault structure, workflow state, stage history) that an agent could use to do meaningful autonomous work.

The plugin needs a continuous orchestration layer — inspired by OpenAI Symphony — that reads active features from the vault, dispatches isolated Claude Code CLI agents to draft stage artifacts and advance workflow stages, and manages retries, concurrency, and workspace isolation without requiring manual intervention per feature.

## Primary users

- **Product managers with many in-flight features** who want drafts generated automatically when a feature reaches a new stage, reviewed and accepted via the plugin UI.
- **Solo developers** who want to set a feature in motion and return to a drafted artifact without babysitting each stage.
- **Engineering leads** who want a repeatable, auditable automated process for moving features from idea to implementation-log without manual prompt engineering.

## Success criteria

- A background orchestrator polls the vault and dispatches agents to eligible features without user action.
- Advancing a feature stage from the UI automatically queues an agent run for the new stage.
- The user can manually dispatch an agent to a specific feature from the sidebar or command palette.
- Each agent run executes in an isolated git worktree (`git worktree add`) scoped to the feature slug.
- On success, the agent's output is merged back and the feature stage is advanced automatically.
- Failed runs retry with exponential backoff up to a configurable maximum; users are notified via `NotificationPort` on exhaustion.
- A status panel shows all running and queued agent sessions with token counts.
- The orchestrator is disabled by default (`enabled: false`); users opt in via plugin settings.
- The feature degrades gracefully when `ClaudeCliPort` is absent (Claude CLI not installed).

## Constraints

- Must follow ADR-008 narrow ports: `WorktreePort` and `OrchestratorPort` are new domain ports; no direct `child_process` calls from domain or application layers.
- `ClaudeCliPort` (from `claude-cli-chat-sidebar`) is a hard dependency — SAO must not reimplement it.
- `agent-interaction-placeholder`'s `IAgentBridge` seam should be evolved to expose `OrchestratorPort`; SAO is the v2.0 implementation that satisfies that interface.
- `WorktreePort` must be absent (stub returning `not-available`) in `LocalStorageBridge` — SAO is disabled on GitHub Pages.
- Workspace path containment is mandatory: all worktree paths must remain under `agentWorktreeRoot`.
- No persistent database for orchestration state; recovery on plugin load uses vault + worktree filesystem scan.
- All Claude CLI subprocess execution is confined to the per-feature worktree directory.

## Research questions

- What is the minimum prompt template surface that produces useful stage drafts across all 12 stage slugs without per-stage fine-tuning?
- How should worktree merge strategy be handled on success — cherry-pick (clean history) vs. `git merge --no-ff` (preserves merge context)?
- Should the per-feature `AGENT.md` template override be required for MVP or deferred to a follow-up iteration?
- What is the right concurrency default (`maxConcurrentAgents: 2`) given Obsidian's single-process environment and Claude CLI's token consumption?
- How should the reconciliation loop detect stalled agents (timeout vs. process liveness check)?

## Preliminary scope

**In scope:** `AgentOrchestrator` with three-trigger dispatch (background poll, stage-advance hook, manual); `WorktreeManager` with git worktree lifecycle and four hook points; `ClaudeAgentRunner` using `ClaudeCliPort`; per-stage prompt templates in `templates/agent-stages/`; `WorktreePort` and `OrchestratorPort` narrow ports; `AgentStatusPanel.vue` status surface; `PluginSettings.agentOrchestrator` config block; restart recovery via filesystem scan; exponential-backoff retry with `NotificationPort` exhaustion alert; `MockBridge` stubs for both new ports.

**Out of scope:** Per-feature `AGENT.md` template overrides (deferred), HTTP dashboard API (Symphony optional extension — not needed for Obsidian), persistent retry queue across restarts (deferred), pluggable tracker adapters beyond vault (deferred), provider selection UI, API key management.
