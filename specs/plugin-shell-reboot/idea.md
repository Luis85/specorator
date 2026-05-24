# Idea — Plugin shell reboot (P0)

> Phase P0 of the **claudian-reboot** epic. Seed captured from the 2026-05-24
> brainstorming dialogue; to be refined by the analyst at `/spec:idea`.

## Problem

The agent surface has been built up incrementally across five features
(claude-cli-chat-sidebar → agent-sidepanel-v2/v3 → MPS → AUX). The decision
(eyes-open, sunk cost acknowledged) is to rebuild the whole plugin clean from a
Claudian-shaped baseline rather than continue layering on the current surface.

P0 establishes the **foundation** for that rewrite: a minimal, booting plugin
that keeps the proven architectural skeleton and discards everything feature- or
workflow-specific, so phases P1+ build the Claudian-shaped agent surface on clean
ground.

## Goal

On `feature/plugin-shell-reboot` (off `next`): strip the codebase to its
architectural skeleton and prove it still boots in Obsidian with an empty agent
sidebar view registered.

## Keep (architecture — not Claudian-specific, already proven)

- Build / test / lint / CI config: `vite.config`, `vitest.config`, ESLint flat
  config + custom rules, `package.json` scripts, `.github/workflows/**`,
  `manifest.json`, `versions.json`.
- ADR-008 **core** narrow ports + their three bridge implementations:
  `SettingsPort`, `VaultPort`, `WorkspacePort`, `NotificationPort`, `LoggerPort`,
  `CommunityPluginPort` — across `ObsidianBridge`, `MockBridge`,
  `LocalStorageBridge`.
- Per-port `InjectionKey`s + composables.
- `Result<T,E>`, `EventBus`/envelope, `FeedbackService`, `ErrorBoundary`.
- Test harness: `tests/__fakes__/fake-ports.ts`, PageObject conventions.

## Delete (feature + workflow surface — regrown later)

- `Feature` aggregate, `Slug`, `FeatureStep`/`FeatureStatus`, `FeatureRepository`,
  workflow-state codec, and all feature use cases (`CreateFeature`,
  `AdvanceFeatureStage`, …) + `IFeatureService`.
- Current agent/chat surface: `AgentSidepanelView`/`AgentSidepanelRoot`,
  `ChatSidebar`/`ChatInput`, `MessageList` & block components, MPS/AUX primitives,
  `ChatTurnOrchestrator`, `StreamDeltaReducer`, transport adapters
  (`ClaudeCliAdapter`/`ClaudeSubprocessAdapter`), proposal/approval stores.
- `SpecoratorView`, onboarding wizard + nudges, design-canvas, prototype builder.
- Obsidian MCP server adapter + tools.
- Feature-specific ports (ChatTransport / Canvas / Metadata / McpServer / Secret /
  Markdown / Icon / ConfirmModal / Approval) — re-introduced per phase as needed.

*(Exact file inventory is finalized in the P0 design stage; the lists above are
the scoping intent.)*

## Definition of Done

- `npm run verify` green on the gutted tree (typecheck, lint, unit, build,
  build:web, docs:api, audit).
- Plugin builds and loads in Obsidian; registers a single empty agent sidebar
  view with no console errors.
- `ADR-PSR-001` filed: records the reboot and that it supersedes the
  feature-facing scope of ADR-008 and the MPS/AUX agent-surface features.
- CLAUDE.md / AGENTS.md architecture sections updated (or flagged) to reflect the
  gutted state without misleading references to deleted subsystems.

## Open questions (for analyst / design)

- OQ-PSR-1: Keep `LocalStorageBridge` + the GitHub Pages standalone build path in
  P0, or defer until a phase actually needs the browser demo?
- OQ-PSR-2: Does any kept infra (e.g. `EventBus` typed `EventMap`) carry
  feature-specific event keys that must be pruned to compile cleanly?
- OQ-PSR-3: Minimum viable settings surface for P0 — empty settings tab, or none?

## Reference

Claudian baseline: `D:\Projects\claudian-main` (MIT). Read-only structural
reference; no code copied verbatim — reimplemented in this stack.
