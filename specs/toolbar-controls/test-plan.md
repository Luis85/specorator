---
id: TESTPLAN-TC-001
title: Toolbar & Controls (P6) — test plan
stage: testing
feature: toolbar-controls
area: TC
epic: claudian-reboot
phase: P6
owner: qa / dev
created: 2026-05-25
updated: 2026-05-25
---

# Test plan — Toolbar & Controls (P6)

Tracks the automated unit/component coverage plus the coverage-excluded manual
legs (TEST-TC-M1/M2/M3) that ride the single final epic-review human gate.

## Deleted-symbol guard verification (T-TC-001 / NFR-TC-001)

Confirmed against `eslint.config.js` (read 2026-05-25):

- `DELETED_INJECTION_KEYS.importNames` does **not** contain `TOOLBAR_CATALOG_PORT`
  — the new InjectionKey resolves clean (only `METADATA_CACHE_PORT`, `CANVAS_PORT`,
  `CHAT_TRANSPORT_PORT`, `PROVIDER_REGISTRY_KEY`, `TRANSPORT_LIFECYCLE_PORT`,
  `CONFIRM_MODAL_PORT`, `SECRET_STORE_PORT`, `TRANSPORT_KIND_KEY`, `IS_MOBILE_KEY`,
  `SETTINGS_VERSION_KEY`, `OPEN_PLUGIN_SETTINGS_KEY`, `PLUGIN_MANIFEST_KEY` are
  banned).
- `DELETED_SUBSYSTEM_BAN.group` matches **none** of the new P6 domain/application/ui
  paths: `@/domain/chat/Reasoning`, `@/domain/chat/toolbar/**`,
  `@/domain/ports/ToolbarCatalogPort`, `@/application/chat/toolbar/**`,
  `@/ui/chat/toolbar/**`. (`@/domain/chat` regrew in P1 and is off the list;
  `ChatRuntimePort` is a live core port, never banned.)
- The new symbols `ToolbarCatalogPort`, `getToolbarCapabilities`,
  `ToolbarCapabilities`, `ReasoningChoice`/`ReasoningEffort`,
  `ToolbarCatalog`/`TabControls`, the `ToolbarStrip`/widget components, and
  `foldControlOptions`/`buildToolbarViewModel` appear nowhere in the guard.

> **Caveat for T-TC-012 (out of this batch):** the real Claude
> `ToolbarCatalogPort` impl under `src/infrastructure/obsidian/**` must avoid the
> `@/infrastructure/obsidian/Claude*` ban glob (file naming), but no `src/` change
> in the DOMAIN batch (T-TC-001..008) touches that surface.

Therefore **no guard-relaxation task is required** in P6. `npm run lint` over the
new domain/port/key surface confirms the imports resolve without a
`no-restricted-imports` violation.

## Coverage-excluded manual legs (human-run, final review gate)

| Leg | Surface | Scheduled by |
|---|---|---|
| TEST-TC-M1 | The real Claude runtime reports `getToolbarCapabilities` + the `ToolbarCatalogPort` (`getCatalog('claude')`) wires end-to-end in Obsidian (static-for-now catalog + real `supportsMcpTools`/`permissionMode`) | T-TC-012 |
| TEST-TC-M2 | Per-widget parity screenshots vs claudian-main at 320 / 520 / 720 px, light + dark (the strip + the eight widgets + the meter) | T-TC-031 (review gate) |
| TEST-TC-M3 | A real-CLI turn carries the folded `mode`/`reasoning` (and declared-now `serviceTier`) query options to the Claude runtime | T-TC-012 / wire-in |

> The **real** Claude `ToolbarCatalogPort.getCatalog('claude')` (the static-for-now
> Claude option lists) + the **real** `getToolbarCapabilities()` on the Claude
> `ChatRuntimePort` live under `src/infrastructure/obsidian/**` (coverage-excluded).
> Their behavioural gate is TEST-TC-M1/M3 — never self-claimed by an agent. The
> **Mock scriptable** catalog + capabilities, the **LocalStorage inert** impls, the
> two **pure transforms** (`foldControlOptions`/`buildToolbarViewModel`), the
> **DTO/union/store** shapes, and the **Vue widgets** carry the automated
> unit/component weight + the 80/70/80/80 coverage gate (NFR-TC-007).

## Automated unit/component proof

The Mock scriptable catalog/capabilities impls, the LocalStorage inert impls, the
pure transforms, and the Vue components carry the unit/component weight + the
80/70/80/80 coverage gate. Tracked per RED test task (qa-owned) naming
TEST-TC-001..043 (incl. the M1/M2/M3 manual legs).

## DOMAIN batch (T-TC-001..008) — automated structural/type legs

| Leg | Status | Where |
|---|---|---|
| TEST-TC-002 / TEST-TC-027 — `ChatRuntimeQueryOptions` three additive fields + `{ text }`-only byte-identical to P5 | covered (RED→green) | `tests/domain/chat/ChatTurn.ts.test.ts` |
| TEST-TC-018 — `ReasoningChoice` union + `ReasoningEffort` shape/narrowing | covered (RED→green) | `tests/domain/chat/Reasoning.test.ts` |
| TEST-TC-006/010/013/017/019 — `ToolbarCatalog` descriptor DTOs + `TabControls` shapes | covered (RED→green) | `tests/domain/chat/toolbar/{ToolbarCatalog,TabControls}.test.ts` |
| TEST-TC-003/010 (port-shape) — `ToolbarCatalogPort` `getCatalog` + key + barrel | covered (RED→green) | `tests/domain/ports/ToolbarCatalogPort.test.ts` |
| TEST-TC-003/019/021/027 (shape + additivity) — `ToolbarCapabilities` + `getToolbarCapabilities()` appended | covered (RED→green) | `tests/domain/ports/ChatRuntimePort.ts.test.ts` |
