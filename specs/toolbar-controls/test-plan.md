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

## INFRA batch (T-TC-009..012) — automated unit legs + the manual Obsidian gate

| Leg | Status | Where |
|---|---|---|
| TEST-TC-003/010/011/013/017/019/021/030 (Mock backing) — scriptable `MockToolbarCatalog` (`setToolbarCatalog`, default Claude-shaped, empty-models degrade, total) + `MockBridge.toolbarCatalog` | covered (RED→green) | `tests/infrastructure/mock/MockToolbarCatalog.test.ts` |
| TEST-TC-003/019/021 (Mock backing) — scriptable `MockChatRuntime.getToolbarCapabilities` (`setToolbarCapabilities`, default Claude-shaped, total) | covered (RED→green) | `tests/infrastructure/mock/MockToolbarCapabilities.test.ts` |
| TEST-TC-019/021 (LS inert leg) — `LocalStorageToolbarCatalog` (inert Claude catalog, no service-tier) + `LocalStorageBridge.toolbarCatalog` + `FixtureChatRuntime` inert caps | covered (RED→green) | `tests/infrastructure/localstorage/LocalStorageToolbar.test.ts` |
| TEST-TC-003 (fake-ports leg) — `fakeModulePorts().toolbarCatalog` member (the MockBridge catalog port, scriptable) | covered (RED→green) | `tests/__fakes__/fake-ports.test.ts` |
| **TEST-TC-M1** — the **real** Claude `ObsidianToolbarCatalog.getCatalog('claude')` (static-for-now catalog) + `ClaudeCliChatRuntime.getToolbarCapabilities` (real flags: `supportsMcpTools:false` honest CLI gating, `reasoningControl:'effort'`, `hasServiceTier:false`, `hasModeToggle:true`, `permissionMode:'default'`) wire end-to-end in Obsidian | **MANUAL — scheduled, not self-claimed** (T-TC-012; coverage-excluded `src/infrastructure/obsidian/**`) | manual Obsidian leg at the final epic-review gate |

> T-TC-012 implements the coverage-excluded Obsidian leg (`ObsidianToolbarCatalog`
> + the real `getToolbarCapabilities()` flags + `ObsidianBridge.toolbarCatalog`).
> The file imports **only** domain types — no `obsidian`/`node:*` symbol leaks past
> `ObsidianToolbarCatalog.ts`. Its behaviour is **not** agent-self-claimed green;
> TEST-TC-M1 is the human-run gate. `npm run typecheck` + `npm run lint` confirm the
> static surface compiles clean.

## WIRE-IN batch (T-TC-030..032) — automated mount/smoke legs + the deferred live-dev-server leg

| Leg | Status | Where |
|---|---|---|
| TEST-TC-001/003 (mount leg), TEST-TC-M1 (wiring leg) — `TOOLBAR_CATALOG_PORT` provided in BOTH entry points (standalone `src/ui/main.ts` reads `MockBridge.toolbarCatalog`; `AgentSidebarView.onOpen` provides `ObsidianBridge.toolbarCatalog`); the toolbar strip mounts the backed widgets; the no-port path stays pure P5 | covered (RED→green, T-TC-030→031) | `tests/ui/chat/toolbarMount.ts.test.ts` |
| TEST-TC-001/004/042 (dev leg) — standalone toolbar smoke against `MockBridge`: the strip mounts in Claudian order with the backed widgets (model · mode · thinking) + the honest seams (permission visible-disabled, external visible-disabled, MCP + service-tier capability-hidden), the usage meter hidden on a fresh tab (EC-TC-7), a tab switch re-derives every widget (EC-TC-8) without a `providerId` branch | covered (automated dev leg) | `tests/ui/main.ts.test.ts` (`standalone toolbar smoke` block) |
| TEST-TC-012 (fold leg) — picking a model / toggling mode / selecting a thinking level sets `controls` (draft input) and folds into the next turn's query options | covered (component-level) | `tests/ui/chat/ChatSurface.toolbar.test.ts` |
| **T-TC-032 live-dev-server leg** — `npm run dev` boots, the strip renders live against `MockBridge`/`LocalStorageBridge`, and the interactive feel (picking a model / toggling mode / selecting a thinking level re-renders the strip; a live usage stream re-renders the 240° arc; the open/close dropdown a11y) is exercised in a real browser | **DEFERRED — human-run** (the agent does not start the long-running dev server, project rule) | manual `npm run dev` check at the final epic-review gate; pass/fail + date recorded here |

> The deterministic legs above (mount, Claudian-order, seam state, fresh-tab usage
> hidden, tab-switch re-derive) are automated as a `tests/ui/main.ts.test.ts`
> extension and pass green under `--pool=threads --no-file-parallelism`. The
> live-dev-server interactive feel is the only deferred-manual portion of T-TC-032 —
> it pairs with TEST-TC-M2 (the per-widget parity screenshots) at the review gate.
