---
id: PARITY-SS-001
title: Settings shell (P10) — parity screenshot matrix
stage: implementation
feature: settings-shell
area: SS
epic: claudian-reboot
phase: P10
owner: dev (baseline scaffold) / human (capture + Specorator column)
reference: D:\Projects\claudian-main
created: 2026-05-26
updated: 2026-05-26
---

# Parity screenshots — Settings shell (P10)

Per T-SS-001 (NFR-SS-009 baseline leg, SPEC-SS-015/028) this is the per-surface ×
width × theme matrix the single final epic-review human gate (TEST-SS-M4) fills in.
The **baseline** column captures `D:\Projects\claudian-main`; the **Specorator**
column is filled at the final review (autonomous-drive — no per-phase human
checkpoint). Agents never self-claim a parity row.

Charter widths: **320 / 520 / 720 px**; themes: **light + dark**.

## Baseline reference (claudian-main)

The P10 settings surfaces map to `D:\Projects\claudian-main`:

- **Per-provider settings shell** — `src/ClaudianSettings.ts` (the root tab
  delegating a section per enabled provider) + `src/features/settings/**` (the
  per-provider section renderers). Claude-only ↔ Codex/Opencode enabled.
- **Env classifier + scope routing** — `src/core/providers/providerEnvironment.ts`:
  - `SHARED_ENVIRONMENT_KEYS` (`:23-37`) — the 13-key shared set.
  - `classifyEnvironmentKey` (`:43-61`) — shared-known / provider-pattern / shared-unknown.
  - `getEnvironmentReviewKeysForScope` (`:273-300`) — the out-of-scope review list.
  - `inferEnvironmentSnippetScope` (`:302-319`) / `resolveEnvironmentSnippetScope`
    (`:321-331`) / `getEnvironmentScopeUpdates` (`:333-364`) — the scope routing.
- **Env-var + context-limit parsing** — `src/utils/env.ts`:
  - `parseEnvironmentVariables` (`:325-345`) — trims, skips blank/`#`, strips
    `export `, first-`=` split, unquotes wrapping `"`/`'`, drops empty key.
  - `parseContextLimit` (`:431-451`) + the `[MIN_CONTEXT_LIMIT, MAX_CONTEXT_LIMIT] =
    [1_000, 10_000_000]` bounds (`:428-429`).
- **Keyboard-nav validator** — `src/features/settings/keyboardNavigation.ts`
  (`:6-60`) — `buildNavMappingText` + `parseNavMappings` (single-char + unique).
- **EnvSnippet shape** — `src/core/types/settings.ts:17-24`
  (`EnvSnippet`) + the `KeyboardNavigationSettings` shape.
- **Env-snippet manager** — `src/features/settings/EnvSnippetManager.ts` (the
  create/edit/remove/apply flow + the name guard).
- **The `style/settings/*` CSS modules** — `base` / `plugin` / `agent` / `slash` /
  `env-snippets` / `mcp` / `opencode-model-picker`.

## Parity matrix (baseline column captured; Specorator column = final review)

Each surface × 320/520/720 px × light/dark. Agents never tick the Specorator side.

| # | Surface | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 1 | Per-provider shell — Claude-only (P0 core + one Claude section + env) | `ClaudianSettings.ts` (single section) | — |
| 1b | Per-provider shell — Codex/Opencode enabled (blank-tab order) | `ClaudianSettings.ts` (multi-section) | — |
| 2 | API-key field — set | `features/settings/**` (set indicator) | — |
| 2b | API-key field — unset | `features/settings/**` (unset indicator) | — |
| 2c | API-key field — unavailable | `features/settings/**` (disabled + notice) | — |
| 3 | Model picker — populated | `features/settings/**` + `opencode-model-picker.css` | — |
| 3b | Model picker — empty list | `features/settings/**` (no-models notice) | — |
| 4 | Environment review + snippet list | `EnvSnippetManager` + `env-snippets.css` | — |
| 5 | Snippet edit modal | `EnvSnippetManager` modal | — |
| 6 | MCP manager (Claude) vs Codex doc-note | `mcp.css` vs the doc-note | — |
| 7 | Claude-only byte-identical state | `ClaudianSettings.ts` Claude-only | — |

> Widths × themes (×6 each): captured by the human reviewer at the single final
> epic-review gate (TEST-SS-M4). This file scaffolds the baseline column only.
