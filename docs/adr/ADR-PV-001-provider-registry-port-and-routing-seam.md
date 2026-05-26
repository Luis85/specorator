---
id: ADR-PV-001
title: Route the active provider through a data-driven ProviderRegistryPort, never a providerId switch
status: accepted
date: 2026-05-26
deciders:
  - architect (P9 providers-registry, autonomous-drive)
consulted:
  - pm (PRD-PV-001)
  - parity-charter §3.6 / §6a
informed:
  - planner
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [providers, registry, routing, capabilities, additivity, P9]
---

# ADR-PV-001 — Route the active provider through a data-driven ProviderRegistryPort, never a providerId switch

## Status

Accepted — P9 (`feature/providers-registry`, autonomous-drive). Ratifies CLAR-PV-001 + CLAR-PV-005 + CLAR-PV-007.

## Context

P1–P8 built the chat surface on a **provider-agnostic** `ChatRuntimePort` (it already carries
`readonly providerId`, `getCapabilities(): RuntimeCapabilities`, and `getToolbarCapabilities(): ToolbarCapabilities`).
P1 ships exactly one provider (Claude). The runtime is constructed by two bridge factories —
`bridge.createChatRuntime()` (provided as both `CHAT_RUNTIME_PORT` and the per-tab
`CHAT_RUNTIME_FACTORY` modal-seam handle, `modalSeam.ts:46`) and `bridge.createProviderHistoryPort()`
(`PROVIDER_HISTORY_PORT`) — plus the P6 `ToolbarCatalogPort.getCatalog(providerId)`.

P9 (charter §3.6, PRD-PV-001) adds Codex + Opencode. The architectural risk is provider-id branching
(`if (provider === 'codex')`) leaking into use cases — exactly what NFR-PV-014 forbids and what
Claudian's own `ProviderRegistry` avoids (`core/providers/ProviderRegistry.ts:113-183` — list/enable/
order/resolve are pure data reads; `createChatRuntime(options)` dispatches through a registration map,
not a switch). The BINDING posture (charter §6a, confirmed 2026-05-24): **Claude complete; Codex/
Opencode capability-gated, feature-incomplete acceptable** — the per-provider capability bag drives the
UI so a reduced surface is honest, not broken.

Forces: (a) additivity — a Claude-only configuration must serialise byte-identically to P8
(REQ-PV-114/006, NFR-PV-001); (b) narrow ports + no aggregate (ADR-008); (c) the existing
`ChatRuntimePort`/`ProviderHistoryPort`/`ToolbarCatalogPort` seams must be reused, not replaced;
(d) the real subprocess runtimes are coverage-excluded infra, so the routing/selection LOGIC must be
unit-testable over the Mock bridge.

## Decision

We will introduce a narrow **`ProviderRegistryPort`** at the domain boundary that lists, orders,
enables, and resolves providers from **plain descriptor data**, and we will route a turn to the active
provider's runtime/capabilities/catalog/history **through capability flags + registry descriptors —
never a `switch (providerId)` / `if (provider === …)` branch** in any application use case or Vue
component.

1. **`ProviderRegistryPort`** (domain `src/domain/ports/`, own `PROVIDER_REGISTRY_PORT` InjectionKey +
   `useProviderRegistryPort()` composable, one consumer, no aggregate). Synchronous, total, pure reads
   over a frozen descriptor table (`ProviderDescriptor[]` keyed by `ProviderId`):
   - `listRegisteredProviders(): readonly ProviderDescriptor[]`
   - `listEnabledProviders(settings): readonly ProviderDescriptor[]` — filter `isEnabled(settings)`,
     sort by `blankTabOrder` (opencode 10, codex 15, claude 20)
   - `getDescriptor(id): ProviderDescriptor` / `getDisplayName(id)` / `getCapabilities(id): ProviderCapabilities`
   - `resolveActiveProvider(settings): ProviderId` — recorded selection if registered+enabled, else
     Claude (`DEFAULT_CHAT_PROVIDER_ID`)
   - `resolveProviderForModel(model, settings): ProviderId` — first descriptor whose `ownsModel(model)`
     is true, else the active/Claude fallback

   `ProviderDescriptor = { id, displayName, blankTabOrder, capabilities (the frozen bag), isEnabled(settings), ownsModel(model) }`.
   The registry object that *holds* the descriptors lives in **infrastructure** (it knows how to
   construct subprocess runtimes); the **port** exposes only the pure data reads + the resolve helpers.

2. **Runtime/history/catalog routing reuses the existing seams, parameterised by provider.** The
   single-provider bridge factories widen additively:
   - `CHAT_RUNTIME_FACTORY` becomes `(providerId: ProviderId) => Result<ChatRuntimePort>` (was
     `() => ChatRuntimePort`); the tabs store passes the active provider; a failure to construct
     returns `Result.err` (ADR-PV-001 §3, REQ-PV-011) and never throws.
   - `createProviderHistoryPort(providerId)` and `ToolbarCatalogPort.getCatalog(providerId)` already
     take / will take a `ProviderId`; P9 wires the Codex/Opencode impls behind them (the P3
     `ProviderHistoryPort` contract is unchanged — REQ-PV-084; the P6 catalog supplies the active
     provider's real models/modes/reasoning/toggles — REQ-PV-062/063/064).

3. **Switching the active provider rebuilds the runtime seam** (REQ-PV-012): the prior provider's
   runtime session is reset and a fresh runtime for the newly active provider is constructed before the
   next turn (per-tab isolation, the P3 pattern). No cross-provider session leakage.

4. **Capability-gating, not id-branching** (REQ-PV-013/024, NFR-PV-014): every provider-varying UI
   decision (rewind/fork/steer affordances, MCP selector, mode/thinking/service-tier widgets, history
   fork) reads the active runtime's `getCapabilities()` / `getToolbarCapabilities()` + the registry's
   `getCapabilities(id)`. The frozen per-provider bag (Claude all-true; Codex rewind/commands/MCP off,
   steer on; Opencode rewind/fork/steer/MCP off, commands on) is the single source of truth.

5. **Routed auxiliary services stay Claude-backed in P9** (CLAR-PV-007, NG6): the registry *exposes* the
   routing hook shape (`resolveProviderForModel` is the seam Claudian's `RoutedTitleGenerationService`
   uses) but P9 does not wire non-Claude aux models — title-gen/inline-edit/instruction-refine ride the
   P5 `AuxModelPort` (Claude) and the per-provider aux wiring is P10.

**Additivity (the load-bearing property):** with only Claude registered+enabled, the registry has one
entry, `listEnabledProviders` returns `[claude]`, no provider menu renders (REQ-PV-090 gates on
`> 1` enabled), `resolveActiveProvider` returns `claude`, and the runtime/history/catalog route through
the exact P1–P8 path — the surface, toolbar, routing, and runtime query are **byte-identical to P8**
(REQ-PV-114, NFR-PV-001).

## Considered options

### Option A — A data-driven `ProviderRegistryPort` + descriptor table + capability-gated routing (chosen)
- Pros: matches Claudian's registry discipline (`ProviderRegistry.ts`); zero `switch (id)` in use cases;
  additive (Claude-only = byte-identical P8); reuses the existing `ChatRuntimePort`/`ProviderHistoryPort`/
  `ToolbarCatalogPort` seams; the selection/routing logic is pure + Mock-testable; adding a provider =
  one descriptor + one runtime impl, no use-case edit.
- Cons: the runtime-construction factory widens its signature (a one-line additive change at every
  provide site); the registry's descriptor table must stay the single source of capability truth.

### Option B — A `switch (providerId)` in the use cases / tabs store
- Pros: trivially obvious; no new port.
- Cons: violates NFR-PV-014 explicitly; every new capability/widget needs a new branch in every
  consumer; not additive (Claude-only path is no longer the same code); rejected.

### Option C — A fat aggregate `ProviderService` port carrying runtime + history + catalog + secrets
- Pros: one inject.
- Cons: violates ADR-008 narrow-port / one-port-per-consumer discipline (the re-introduced `usePorts`
  anti-pattern ESLint forbids); couples unrelated concerns (history vs transport vs secrets); rejected.

## Consequences

### Positive
- No `switch (providerId)` survives in any use case or component (NFR-PV-014 lint-checkable).
- Claude-only is provably byte-identical to P8 (REQ-PV-114).
- Codex/Opencode are added as data + a runtime impl behind the existing seams; the capability bag makes
  their reduced surface honest (REQ-PV-024).

### Negative
- The runtime-construction seam widens its signature once (`CHAT_RUNTIME_FACTORY` gains a `ProviderId`
  arg + a `Result` return); all three provide sites + the tabs store update additively.

### Neutral
- `ProviderId` widens from `'claude'` to `'claude' | 'codex' | 'opencode'` (REQ-PV-005) — additive; every
  existing `'claude'` site stays valid.

## Compliance
- ESLint: no `switch (providerId)` / `if (provider === …)` in `src/application/**` or `src/ui/**`
  (REQ-PV-013/112, NFR-PV-014); `ProviderRegistryPort` has its own InjectionKey + composable, no
  aggregate, no re-introduced `IBridge`/`usePorts`.
- Tests: the registry list/enable/order/resolve + the capability-gated routing run over the Mock bridge
  (the scriptable runtime/transport); a Claude-only additivity diff against P8 is asserted (REQ-PV-114).

## References
- PRD-PV-001 (REQ-PV-001..013, 020..025, 060..064, 084, 090, 114; NFR-PV-001/006/014); CLAR-PV-001/005/007.
- DESIGN-PV-001 Part C (C.1/C.2/C.4/C.6).
- `claudian-main` `core/providers/ProviderRegistry.ts:45-183` (registration map + list/enable/order/
  resolve); `providers/{claude,codex,opencode}/capabilities.ts` (the frozen bags).
- Specorator seams reused: `src/domain/ports/ChatRuntimePort.ts` (`providerId`/`getCapabilities`/
  `getToolbarCapabilities`), `src/domain/ports/ProviderHistoryPort.ts`, `src/domain/ports/ToolbarCatalogPort.ts`,
  `src/ui/chat/modalSeam.ts:46` (`CHAT_RUNTIME_FACTORY`).
- Related: ADR-CC-001 (runtime shape), ADR-TS-001/002 (history seam + tabs), ADR-TC-003/004 (capability
  gate + catalog), ADR-PV-002 (secrets), ADR-PV-003 (home-fs).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
