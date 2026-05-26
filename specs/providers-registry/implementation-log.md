---
id: IMPL-LOG-PV-001
title: Providers registry (P9) — Implementation Log
stage: implementation
feature: providers-registry
area: PV
epic: claudian-reboot
phase: P9
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-26
updated: 2026-05-26
---

# Implementation Log — Providers registry (P9)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. TDD per task — RED first (qa), then minimal impl
(dev) to green. The DOMAIN batch is T-PV-001..010; INFRA/APPLICATION/UI/STYLES/
WIRE-IN/GATE batches ride their own subagents.

## T-PV-001 — Baseline-capture + guard verification + file-naming directive (📐, doc-only)

- **Spec/req:** NFR-PV-009 (baseline leg), NFR-PV-007 (guard verification),
  SPEC-PV-002/008/009/010/016/017/018/021/022.
- **Files:** `specs/providers-registry/parity-screenshots.md` (new — baseline
  skeleton, seven surfaces × 320/520/720 × light/dark, baseline column keyed to
  `claudian-main` `ProviderRegistry` / `types.ts` / `providers/*/capabilities.ts` /
  `codex/runtime` / `acp` / `HomeFileAdapter` + the `opencode-model-picker.css` /
  provider-brand rules), `specs/providers-registry/test-plan.md` (new — the
  guard-verification note + the file-naming directive + the TEST-PV-M1/M2/M3/M4 +
  manual sub-legs + the DOMAIN-batch automated status), `specs/providers-registry/
  implementation-log.md` (new — this file).
- **Outcome:** done.
- **Guard verification:** the new `PROVIDER_REGISTRY_PORT` / `HOME_FS_PORT` keys +
  the new domain/application/ui/infra paths (`@/domain/chat/providers/**`,
  `@/application/chat/providers/**`, `@/ui/chat/providers/**`,
  `@/infrastructure/providers/**`, `@/domain/ports/ProviderRegistryPort`,
  `@/domain/ports/HomeFsPort`) match **no** `DELETED_SUBSYSTEM_BAN` /
  `DELETED_INJECTION_KEYS` glob — clean. **DEVIATION from the planner's hand-off
  note:** `@/domain/ports/SecretStorePort` (`eslint.config.js:152`) AND
  `SECRET_STORE_PORT` (`eslint.config.js:175`) ARE still banned — they are the OLD
  P0-deleted secret-store symbols that P9 regrows verbatim (ADR-PV-002 §47,
  SPEC-PV-006 pins the path + key, no alternative name). This is the documented
  per-phase regrow pattern (ICON_PORT precedent, `eslint.config.js:121-122,168`); a
  narrow guard-relax dropping ONLY those two stale entries is required and lands in
  T-PV-009. The Obsidian-layer glob `@/infrastructure/obsidian/ObsidianSecretStore*`
  (`:142`) STAYS banned. Recorded in `test-plan.md` + escalated in `workflow-state.md`.
- **Lint:** whole-project `npm run lint` over the pre-existing surface passes clean
  (no new key/port referenced yet).
- **Commit:** _filled after commit_.
- **Deviation:** the SecretStorePort/SECRET_STORE_PORT guard-relax (see above); no
  file under `src/` changed in this task.
