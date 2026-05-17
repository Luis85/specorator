---
id: IDEA-ASV3-001
title: 'Agent Sidepanel v3 — Post-v2 deepening, perf, a11y, sec hardening'
stage: idea
feature: agent-sidepanel-v3
status: accepted
owner: pm
created: 2026-05-17
updated: 2026-05-17
references:
  - spec: 'specs/agent-sidepanel-v2/idea.md'
  - spec: 'specs/agent-sidepanel-v2/workflow-state.md'
---

## Problem statement

The agent-sidepanel v2 stack (17 PRs, merged 2026-05-16/17) shipped end-to-end Claudian-inspired UX: dedicated ItemView, multi-turn streaming, slash palette, `@`-mention picker, plan-mode approval, vault-loaded slash commands, Obsidian markdown renderer, secret-storage. It works — but six parallel post-merge reviews (architecture per Matt Pocock's `improve-codebase-architecture` skill, plus UX, security, performance, accessibility, testing) surfaced systemic friction that v2 didn't have time to address:

1. **Streaming consumption is smeared across three layers.** `ChatSidebar.vue` orchestrates turns, `chatStore` translates a 12-variant union, both adapters duplicate the translation. Bug fixes have shipped twice. The shape resists testing.
2. **`chatStore` mixes three lifecycles** (persisted threads, per-turn streaming state, proposals). `handleNewConversation` has to know 9 state slots; the streaming-reset-on-transport-change invariant is untested.
3. **Markdown re-renders the whole accumulated string per text delta.** Obsidian's `MarkdownRenderer.render` runs once per token. CPU pegs at 30–40 % on long streams.
4. **Subprocess transport double-pushes assistant text** (Claudian PR #510 pattern, confirmed in our `_handleAssistantMessage` + `_handleStreamEvent` dispatch). User-visible duplicate output.
5. **Accessibility blockers** on every new live surface: aria-live firehose during stream, plan-approval card never gets focus, slash dropdown missing combobox wiring, focus not restored after proposal accept, Stop button not announced.
6. **Two ItemViews duplicate the mount ritual.** `SpecoratorView` retains vestigial chat hydration (OQ-ASV-3); both views build a manual `Proxy` for the active port, hand-rolled in both files.
7. **Security gaps** (none exploitable, all defence-in-depth): legacy plaintext `anthropicApiKey` never deleted from `data.json` on migration; `process.env.ANTHROPIC_API_KEY` is set globally and inherited by every subsequent spawn; `safeHref` permits arbitrary root-relative URLs.

## Primary users

- **Specorator power users** — the v2 audience, who'll experience perf/a11y improvements directly and architectural improvements indirectly.
- **Maintainers** — the architecture deepening pays off in every future PR touching the chat surface.
- **Screen-reader users + keyboard-only users** — currently blocked from several flows; v3 a11y wave unblocks them.

## Success criteria

- All 15 work packages merged to `develop`, each as its own PR, each green on the pre-PR verify gate.
- No P1 finding from the six reviews survives without an explicit deferral note.
- `npm run test:coverage` thresholds (80/70/80/80) maintained or improved per layer.
- Each WP self-verifies via the RALPH loop documented in its `brief.md`.

## Constraints

- **DDD + narrow ports (ADR-008) preserved.** Some WPs propose new ports (`StreamDeltaReducer` codec module, `ChatThreadsRepositoryPort`, `SessionLogMirror` facade) — each remains a narrow-port adapter trio (Obsidian + Mock + LocalStorage where applicable).
- **`Result<T,E>` (ADR-004) preserved.** No new throw sites.
- **`<script setup>` + DTO-only Pinia (ADR-003) preserved.** WP-3 splits the store along lifecycle boundaries, not domain boundaries.
- **One PR per WP, all target `develop`.** Per AGENTS.md §4 + PM direction.
- **No breaking change to REQ-CCS / REQ-ASM behaviour.** v2's user-visible contract is the floor; v3 is hardening + decomposition + a11y/UX polish.

## Scope

In scope (this feature):
- The 15 work packages enumerated in `work-packages.md` and their per-WP briefs.

Out of scope:
- New transports beyond api-key + subscription.
- Model picker (v2 deferred; not re-opened here).
- Mobile support.
- Per-message regenerate / edit / copy-link affordances (v2 missing-feature list; defer to v4).
- Thread switcher UI (v2 missing-feature list; defer to v4).
