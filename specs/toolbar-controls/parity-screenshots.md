---
id: PARITY-TC-001
title: Toolbar & Controls (P6) — parity screenshot matrix
stage: implementation
feature: toolbar-controls
area: TC
epic: claudian-reboot
phase: P6
owner: dev (baseline scaffold) / human (capture + Specorator column)
reference: D:\Projects\claudian-main
created: 2026-05-25
updated: 2026-05-25
---

# Parity screenshots — Toolbar & Controls (P6)

Per T-TC-001 (NFR-TC-008 baseline leg) this is the per-widget × width × theme
matrix the single final epic-review human gate (TEST-TC-M2) fills in. The
**baseline** column captures `D:\Projects\claudian-main`; the **Specorator**
column is filled at the final review (autonomous-drive — no per-phase human
checkpoint). Agents never self-claim a parity row.

Charter widths: **320 / 520 / 720 px**; themes: **light + dark**.

## Baseline reference (claudian-main)

The P6 toolbar surfaces map to `D:\Projects\claudian-main`:

- **The `.claudian-input-toolbar` strip** — `src/features/chat/ui/InputToolbar.ts`.
  In Claudian order the leading group is **model · mode · permission · thinking ·
  service-tier · MCP · external**, with the usage/context meter pinned trailing.
  The widget classes live in the same file:
  - `ModelSelector` (`.claudian-model-selector` / `.claudian-model-btn` /
    `.claudian-model-dropdown`; grouped + reversed-recent via `renderOptions`,
    current marked).
  - `ModeSelector` (`SpToggleSwitch` keyed on `ProviderModeSelectorConfig`
    `activeValue`/`inactiveValue`).
  - `PermissionToggle` (label + toggle; the **PLAN** special-case label,
    `ProviderPermissionModeToggleConfig`).
  - `ThinkingBudgetSelector` (effort gears vs token-budget gears, keyed on
    `ProviderReasoningOption`; auto-hides on `none`/single).
  - `ServiceTierToggle` (Codex fast-mode `zap`, `ProviderServiceTierToggleConfig`;
    hidden when no descriptor — Claude).
  - `McpServerSelector` (icon + count badge; gated on `supportsMcpTools`).
  - `ExternalContextSelector` (paperclip-folder; `externalContext` utils).
- **The usage/context meter** — the 240° arc `ContextUsageMeter` (`> 80` warning +
  `/compact` tooltip; reads `UsageInfo`). Rendered inline by the toolbar/footer; the
  arc is a programmatic SVG `<path>` (no chart lib).

Each widget region carries a stable `data-testid` in the Specorator port
(`toolbar-strip`, `toolbar-model`, `toolbar-mode`, `toolbar-permission`,
`toolbar-thinking`, `toolbar-service-tier`, `toolbar-mcp`, `toolbar-external`,
`toolbar-usage`).

## Widget 1 — Full strip (Claude active: service-tier + MCP hidden, external disabled)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `InputToolbar` row wraps; meter trailing_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending — labels abbreviate, icon + value_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending — full strip one row_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Widget 2 — Model selector open (grouped, current marked)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `ModelSelector.renderOptions` grouped/reversed_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Widget 3 — Mode + permission toggles (incl. PLAN label)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `ModeSelector` + `PermissionToggle` PLAN_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Widget 4 — Thinking selector open (effort + token-budget variants)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `ThinkingBudgetSelector` effort/budget gears_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Widget 5 — Service-tier + MCP seams (Claude → hidden; supported → visible-empty)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `ServiceTierToggle` zap + `McpServerSelector`_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Widget 6 — External-context control (visible-disabled folder affordance)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `ExternalContextSelector` paperclip-folder_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Widget 7 — Usage meter (<80% nominal + >80% warning + `/compact` tooltip)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — 240° arc `ContextUsageMeter`_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending — warning style + `/compact` tooltip_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |
