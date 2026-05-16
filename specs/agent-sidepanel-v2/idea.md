---
id: IDEA-ASV-001
title: 'Agent Sidepanel v2 — Dedicated single-purpose sidepanel'
stage: idea
feature: agent-sidepanel-v2
status: accepted
owner: pm
created: 2026-05-16
updated: 2026-05-16
references:
  - spec: 'specs/agent-sidepanel-mvp/idea.md'
  - spec: 'specs/agent-sidepanel-mvp/requirements.md'
  - spec: 'specs/agent-sidepanel-mvp/design.md'
  - spec: 'specs/claude-cli-chat-sidebar/idea.md'
  - spec: 'specs/claude-cli-chat-sidebar/requirements.md'
  - external: 'https://github.com/YishenTu/claudian'
---

## Problem statement

Today the chat (`ChatSidebar.vue`) is mounted inside `SpecoratorView` alongside the Home, Features and Settings routes (`src/ui/router/index.ts:23`, `src/ui/layouts/MainLayout.vue:21`). Users reach it by clicking the "Chat" tab in `MainLayout`. This pattern has three problems:

1. **Single-purpose surfaces are clearer.** The chat is a continuous, agent-driven workspace; the rest of `SpecoratorView` is feature-management UI. Putting them behind the same nav strip muddles the mental model and steals horizontal space from the chat content.
2. **Workspace ergonomics.** A user who wants to keep the chat visible while editing a note loses the chat the moment they leave the panel for any other view. Obsidian's sidebar pattern (one ItemView per panel) handles this case natively — open the chat in the right sidebar, navigate features in the centre, and both are visible.
3. **Discoverability.** A dedicated ribbon icon ("Open Specorator Agent") and a single-purpose `VIEW_TYPE` advertise the chat as a first-class surface in Obsidian rather than a tab buried inside another panel.

Increment 1 of v2 is a structural lift: the existing chat (`ChatSidebar.vue` and every supporting component, store, adapter, port — all of REQ-CCS and REQ-ASM are preserved verbatim) is moved into its own `ItemView` (`VIEW_TYPE = 'specorator-agent'`), the `/chat` route is removed from the tabbed shell, and Obsidian's command palette and ribbon learn the new surface.

Increment 2+ then adopts Claudian-style UX (https://github.com/YishenTu/claudian): multi-turn message list, streaming responses, slash-command palette, and `@`-file mentions for vault-scoped context-attach without round-tripping through the workspace file menu.

## Primary users

- **Specorator power users who keep the chat open beside their work** — currently can't, because opening Features or Settings replaces the chat view. v2 lets them dock the agent panel in the right sidebar and switch the centre panel freely.
- **Existing single-turn chat users (REQ-CCS-013 path)** — unchanged after Increment 1; Increment 2 lets them see prior turns at a glance rather than only the latest response (`ChatResponse.vue`).
- **Subscription-transport users (REQ-ASM)** — unchanged transport behaviour; they get a clearer surface for the same conversation.

## Success criteria

**Increment 1 — Structural lift:**

- Opening the Specorator agent from the ribbon, command palette, or `specorator://?action=open-chat` URI surfaces a dedicated right-sidebar leaf whose only content is the chat — no Home/Features/Settings tabs.
- Every existing chat behaviour (REQ-CCS-001…028, REQ-ASM-001…055) is preserved bit-for-bit: transport selection, session-id persistence, file-write proposals, stage-aware system prompt, context files, degraded states.
- The Vue `/chat` route, `ChatSidebarView.vue`, and the "Chat" entry in `MainLayout.vue`'s nav are removed; the URI handler routes to the new sidepanel instead.
- All 1375+ existing tests still pass; new tests cover the new `ItemView` mount path and its provides.
- The plugin's `chatThreads` persistence (REQ-ASM-037 / SPEC-ASM-001 §9.3) continues to debounce + flush correctly; an open panel reload survives Obsidian restart.

**Increment 2 — Claudian-inspired UX (deferred to a follow-up PR):**

- Conversation history is rendered as a scrollable message list (user + assistant turns) per active thread, not just "the last response".
- Assistant responses stream in incrementally where the transport supports it (SDK `messages.stream()` and subscription `--output-format stream-json`).
- A `/` keystroke at the start of the input opens a slash-command palette (`/create-file`, `/clear`, `/new-thread`, future expansion).
- An `@` keystroke at the start of a word opens a vault-file picker that, on selection, adds the file as a context entry — no need to switch to the file menu.
- A "Stop generating" control aborts the in-flight request.

## Constraints

- **DDD + narrow ports (ADR-008) preserved.** The new `ItemView` is plugin-layer only. All Obsidian API access still goes through the six narrow ports plus `ClaudeCliPort` and `ConfirmModalPort`. No Vue component imports `obsidian`.
- **`Result<T,E>` (ADR-004) preserved.** No new throw sites — error paths use the existing discriminated unions.
- **Vue 3 `<script setup>` + hash-mode router (ADR-003) preserved.** The new sidepanel mounts its own Vue app (own Pinia, own `App` root) but does not need the hash router because it is a single-route surface — the router is dropped from the agent panel's mount to remove the "is this a tab in another shell?" ambiguity.
- **Two ItemViews share one set of services.** Both `SpecoratorView` and `AgentSidepanelView` need `ClaudeCliPort`, `ConfirmModalPort`, the transport selector, and the chat-threads persistence pipeline. These continue to live on the plugin instance — the panel is a thin Vue mount that consumes them.
- **Trust-first writes (NFR-ASM-011).** The proposal-card flow is preserved verbatim. `FileWriteProposalCard.vue` and `commitFileWriteProposal` are unchanged.
- **No re-spawning subprocesses on view-rotate.** Closing the panel must not shut down the underlying `ClaudeSubprocessAdapter` — adapters are plugin-scoped, not view-scoped, today (`src/plugin/main.ts:140,171`) and stay so.
- **`chatStore` Pinia store stays DTO-only (ADR-003).** Increment 2's multi-turn list needs a `messages` field on the store, still plain DTOs; no domain class crosses the store boundary.
- **Tests-mirror layout (ADR-009).** The new `AgentSidepanelView.ts` test lives at `tests/plugin/AgentSidepanelView.test.ts`; the new shell component's test (if any) lives at `tests/ui/components/agent-sidepanel/<Component>.test.ts` with a co-located `.po.ts`. Existing chat tests under `tests/ui/components/chat/` keep their paths.
- **Anthropic ToS posture preserved.** No reads of `~/.claude/`; the existing `local/no-claude-home-reads` ESLint rule still applies.

## Research questions

- **Mounting strategy.** Does the new `AgentSidepanelView` mount its own Vue app with its own Pinia instance, or share the existing `SpecoratorView` Pinia store via cross-view singleton? Sharing keeps thread state consistent across mounts; independent stores risk drift but simplify isolation.
- **Router or no router.** The current panel uses `vue-router` purely for the four-tab nav. The agent panel is single-route — does it need a router at all? If not, dropping it removes the `createWebHashHistory` URL pollution that today sets `#/chat` on the panel's iframe-like surface.
- **Multi-turn message model.** Increment 2 needs a `messages: Message[]` field on the store. Should `Message` be a fresh DTO or should it reuse `SessionTurnBlock` from `src/application/chat/SessionLog.ts`? Reuse is tempting but couples UI rendering to the vault-mirror schema.
- **Streaming wiring.** The SDK adapter (`ClaudeCliAdapter`) and subprocess adapter (`ClaudeSubprocessAdapter`) currently only expose `query()`. Adding a `queryStream(prompt, opts) → AsyncIterable<Delta>` to `ClaudeCliPort` requires both adapters to implement it. Should streaming land in Increment 2 or be split further?
- **Slash-command palette and `@`-mention picker.** Are these implemented as headless `<input>` enhancements, or as floating dropdowns over the textarea? Claudian appears to use floating dropdowns — confirm during design.
- **Ribbon icon and command id.** "agent" vs "chat" naming: the plugin already has an `open-specorator` command. Add `open-specorator-agent` (and keep `open-chat` URI action as alias). Confirm naming with PM during requirements stage.
- **What to do with the existing `nav.chat` i18n key.** Drop it (clean) or alias to "Open agent" elsewhere. Decide during requirements stage.

## Preliminary scope

**In scope, Increment 1 (PR-ASV-1):**

- New `src/plugin/AgentSidepanelView.ts` ItemView (`VIEW_TYPE = 'specorator-agent'`, icon `'message-square'`, title "Specorator Agent").
- New `src/ui/agent/AgentSidepanelRoot.vue` (root component mounted by the new view — wraps the existing `ChatSidebar.vue` initially; in Increment 2 grows into a richer shell).
- Plugin registration: new ribbon icon, new command (`open-agent-sidepanel`), new `activateAgentSidepanel()` activation method, URI action `open-chat` rerouted to the new view.
- Remove `/chat` route from `src/ui/router/index.ts`; delete `src/ui/views/ChatSidebarView.vue`; remove the "Chat" nav link from `MainLayout.vue` and its `nav.chat` translation key.
- Move chat-threads hydration + Pinia store seeding into `AgentSidepanelView.onOpen()`; `SpecoratorView.onOpen()` stops seeding chat threads.
- Add the new view's lifecycle to `onunload()` (`detachLeavesOfType(VIEW_TYPE_AGENT)`).
- Tests for new view: `tests/plugin/AgentSidepanelView.test.ts` + co-located PageObject for any new Vue component.
- Update `chat-handlers` tests (`tests/plugin/main.chat-handlers.test.ts`) for the new activation path.
- Documentation: bump `CLAUDE.md` mention of the chat surface; mark `specs/agent-sidepanel-v2/workflow-state.md` advance to next stage on PR merge.

**Out of scope, deferred to Increment 2+ (separate PRs, tracked from this spec):**

- Multi-turn message list (`MessageList.vue` + `messages` store field).
- Streaming responses (`ClaudeCliPort.queryStream`, SDK + subprocess implementations).
- Slash-command palette (`/create-file`, `/clear`, `/new-thread`).
- `@`-file mention picker over the textarea.
- "Stop generation" control + cancellation through both adapters.
- Model picker (subscription transport only).
- Per-thread sidebar / thread switcher UI.

**Not in scope, will not be done in v2 at all:**

- New transports beyond api-key and subscription (e.g. raw Bedrock).
- Persisting full message bodies to plugin data (vault session log remains the canonical mirror per REQ-ASM-040; plugin data only stores `chatThreads` metadata).
- Removing or changing any REQ-CCS / REQ-ASM behaviour.
