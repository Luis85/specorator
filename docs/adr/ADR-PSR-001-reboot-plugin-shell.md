---
id: ADR-PSR-001
title: Reboot the plugin shell — keep the skeleton, gut the feature/workflow/agent surface
status: accepted
date: 2026-05-24
deciders:
  - architect
  - pm
  - maintainer (human)
consulted:
  - analyst
informed:
  - planner
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [architecture, reboot, claudian-reboot, P0]
---

# ADR-PSR-001 — Reboot the plugin shell, keep the skeleton, gut the feature/workflow/agent surface

## Status

Accepted

## Context

The plugin's agent surface accreted across five sequential features
(`claude-cli-chat-sidebar` → agent-sidepanel-v2/v3 → MPS → AUX) layered on top of
a spec-driven workflow engine. The result carries a thick stack of feature-specific
machinery — chat orchestration, transport/provider selection, a provider registry,
an MCP server, onboarding, a design canvas, and the `Feature` aggregate with its
repository and workflow-state codec — most of it coupled through `PluginSettings`,
the port barrel, and both demo/test bridges. The team has decided — sunk cost
acknowledged — to stop iterating on this surface and regrow it on a cleaner,
Claudian-shaped baseline (epic `claudian-reboot`, decided 2026-05-24). That epic
decision is final and is **not** what this ADR records.

What this ADR records is the **P0 reboot**: the load-bearing, hard-to-reverse
architectural choice to **delete the entire feature/workflow/agent surface in one
clean-room cut while keeping the proven architectural skeleton**, rather than
incrementally refactoring the existing surface in place. Forces at play:

- **Technical.** The deleted subsystems are deeply intertwined (`PluginSettings`
  imports `@/domain/chat`; both `MockBridge` and `LocalStorageBridge` implement
  `ChatTransportPort` + `IconPort`; `main.ts` is ~90% feature wiring; the standalone
  entry routes only deleted views). A piecemeal refactor would thread changes
  through every layer repeatedly; a single guided cut is cheaper and leaves a
  legible baseline (PRD-PSR-001, IDEA-PSR-001, OQ-PSR-2).
- **Organisational.** Phases P1–P7 of the epic each rebuild a slice (chat core,
  threads, composer, approvals, providers, MCP, i18n). They need a clean baseline to
  build on, and `next` is the integration branch each phase PR merges into.
- **Time/risk.** Deleting `@/domain/chat` and the `Feature` aggregate cascades into
  many importers (R-PSR-1). The mitigation is a leaf-first, compiler-guided deletion
  order (DESIGN-PSR-001 §C.14), not an attempt to enumerate every file up front.
- **Regulatory/policy.** `manifest.json` identity (`id`/`version`/`minAppVersion
  1.12.7`) is deliberate maintainer policy and must not change (R-PSR-6, NG6).

The skeleton being kept is proven and not Claudian-specific: DDD layering (ADR-001),
the six ADR-008 narrow ports, the three bridge runtimes, `Result<T,E>` (ADR-004),
the typed `EventBus` (ADR-011), the module system + `PluginCore` lifecycle
(ADR-010/ADR-012), the `TranslationPort` seam (ADR-008 §W8), and the test harness
(ADR-009).

## Decision

We reboot the plugin shell in P0. We **delete** the feature, workflow, and
agent-surface code — the `Feature` aggregate and workflow-state codec; the
chat/transport/provider/MCP/onboarding/design-canvas surfaces; the feature-specific
ports (`ChatTransportPort`, `TransportLifecyclePort`, `ConfirmModalPort`,
`SecretStorePort`, `MarkdownRenderPort`, `IconPort`, `MetadataCachePort`,
`CanvasPort`, `ObsidianMcpServerPort`, `ObsidianCliPort`) and their loose injection
keys; and the documentation/settings references to them. We **keep** the
architectural skeleton listed above, de-coupled so it compiles after the deletions.

After the reboot the plugin boots as **one empty agent sidebar `ItemView`**
(`VIEW_TYPE_AGENT = 'specorator-agent'`) that **mounts a Vue app** (exercising the
kept UI/port-provide/`ErrorBoundary` machinery), opened by a **single command-palette
entry** ("Open agent sidebar") with **no ribbon icon**. `PluginSettings` is reduced
to `{ locale, logLevel }`, persisted through `SettingsPort` via a minimal settings
tab, with the minimal i18n / `TranslationPort` seam kept as `locale`'s live consumer.

This ADR **supersedes the feature-facing scope** of:

- **ADR-008** — only its *feature-port* surface (`IconPort` and the chat/MCP/canvas
  ports added after the original six). The six core narrow ports
  (`SettingsPort`, `VaultPort`, `WorkspacePort`, `NotificationPort`, `LoggerPort`,
  `CommunityPluginPort`) and the narrow-port principle **remain in force**.
- The **MPS** (multi-provider selection) and **AUX** (agent UX polish, including the
  `IconPort`/`<SpIcon>` seam) **agent-surface features** — their shipped surface is
  removed on this line; their decisions stay on record and regrow per phase.

The reboot does **not** supersede ADR-001 (DDD layering), ADR-004 (`Result`),
ADR-009 (test conventions), ADR-010/011/012 (module system / EventBus / lifecycle),
or ADR-003 (Vue Composition API) — all are kept.

## Considered options

### Option A — Clean-room reboot keeping the skeleton (chosen)

- Pros: one guided cut; leaves a legible, compiling baseline for P1–P7; the
  leaf-first compiler-guided order bounds the cascade risk; preserves the verify
  gate, the narrow-port seam, the module system, and the test harness.
- Cons: large single change; coverage on the smaller tree must be re-confirmed
  (R-PSR-5); orphaned `.stories` must be removed alongside components (R-PSR-4).

### Option B — Incremental in-place refactor of the existing surface

- Pros: smaller individual PRs; never a "big bang" delete.
- Cons: the deleted subsystems are cross-cut through settings/bridges/main/router;
  every phase would re-thread changes through tangled feature code; the team has
  already decided to stop iterating on this surface — refactoring it forward spends
  effort on code slated for deletion.

### Option C — Fork a fresh repository for the Claudian-shaped rewrite

- Pros: pristine start; no deletion cascade.
- Cons: loses the proven skeleton, CI, verify gate, ADR history, and `manifest.json`
  identity; re-establishing all of that is more work than a guided in-repo cut; the
  marketplace identity (`id`/`version`) must be preserved (NG6).

## Consequences

### Positive

- P1 (chat core) starts from a clean, compiling baseline: no `Feature` aggregate, no
  chat/transport/MCP/onboarding code, no dangling feature ports, no misleading docs.
- The narrow-port seam, module system, `Result`, `EventBus`, and test harness all
  survive intact and green.
- A deleted-symbol guard (ESLint `no-restricted-imports` + a CI-run Vitest test,
  DESIGN-PSR-001 §C.8) makes "no live reference to a deleted subsystem"
  regression-proof against a later phase re-introducing a deleted name.
- CI now covers the `next` integration branch (push + pull_request), so phase PRs
  cannot integrate unverified (R-PSR-3 closed).

### Negative

- Feature-specific ports and adapters must be **re-introduced per phase, on demand**
  (NG4) — `IconPort`/`<SpIcon>`, `ChatTransportPort`, `SecretStorePort`, the MCP and
  canvas ports, etc. all regrow when their first consumer returns. This is
  intentional (ADR-008's "one port per consumer" discipline) but means P1+ re-adds
  surface this ADR removed.
- A large deletion temporarily reduces the absolute test count; coverage thresholds
  (80/70/80/80) must be re-confirmed on the smaller tree, adjusting the coverage
  `include` only where a kept file is legitimately untestable in P0 (R-PSR-5).

### Neutral

- `manifest.json` `id`/`version`/`minAppVersion` are untouched (NG6); any version
  change rides the normal `npm version` release flow.
- The standalone `build:web` path is kept on the verify gate via a trivial empty
  entry (Q1 / REQ-PSR-011); the GitHub-Pages demo wiring is deferred, not removed.
- The Vue router and all routed views are deleted in P0; routing regrows if a later
  phase needs a multi-surface in-app navigation.

## Compliance

- **Deleted-symbol ESLint rule** (`no-restricted-imports` `DELETED_SUBSYSTEM_BAN`,
  DESIGN-PSR-001 §C.8) fails lint on any import of a deleted path/symbol.
- **CI-run Vitest test** (`TEST-PSR-*`) lints `src/**` via the ESLint Node API and
  asserts zero deleted-subsystem violations — regression-proof, inside the existing
  lint/test gate (no new gate step).
- **`npm run verify`** must be green on the gutted tree with zero bypasses
  (`--no-verify`, `--ignore-scripts`, `if: false`, skipped tests, or coverage-include
  removals masking untested kept code) — the PRD counter-metric is bypasses = 0.
- **`ci.yml`** triggers include `next` for push + pull_request; all `uses:` stay
  SHA-pinned and `actionlint`/`verify:workflows` clean (NFR-PSR-008).
- **`manifest.json`** identity unchanged; `validate:manifest` passes (NFR-PSR-007).

## References

- PRD-PSR-001 (`specs/plugin-shell-reboot/requirements.md`) — REQ-PSR-001..012,
  NFR-PSR-001..009, Clarifications CL-1..CL-4.
- IDEA-PSR-001 (`specs/plugin-shell-reboot/idea.md`) — Keep/Delete inventory,
  risks R-PSR-1..6, OQ-PSR-1..3.
- DESIGN-PSR-001 (`specs/plugin-shell-reboot/design.md`) — Part C architecture,
  delete order (§C.14), deleted-symbol guard (§C.8), `ci.yml` edit (§C.9).
- ADR-008 (`docs/adr/ADR-008-narrow-ports-supersede-ibridge.md`) — narrow ports;
  feature-port scope superseded here.
- ADR-001 (DDD layering), ADR-004 (`Result`), ADR-009 (test conventions),
  ADR-010/011/012 (module system / EventBus / lifecycle), ADR-003 (Vue) — all kept.
- Claudian baseline: `D:\Projects\claudian-main` (MIT) — read-only structural
  reference (not copied verbatim — NG3).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR;
> only the predecessor's `status` and `superseded-by` pointer fields may be updated.
