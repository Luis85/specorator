---
id: TRACE-TS-001
title: Threads & Sessions (P3) — traceability matrix (validated at review)
stage: review
feature: threads-sessions
area: TS
epic: claudian-reboot
phase: P3
status: complete-with-broken-links   # 3 must-REQ chains broken at code→test (R-TS-001/002/003); see review.md
owner: reviewer
integration_branch: next
created: 2026-05-25
updated: 2026-05-25
inputs:
  - specs/threads-sessions/{requirements.md,spec.md,tasks.md,implementation-log.md,review.md}
  - docs/adr/ADR-TS-001/002/003
---

# Traceability — Threads & Sessions (P3)

Chain: **REQ-TS → SPEC-TS → T-TS → code(file) → TEST-TS → review-finding**. Regenerated from the
artifacts at `/spec:review`. **Three `must` chains are broken at the code→test link** — the unit test
passes against hand-seeded data the production code path never produces (the R-RR-001 failure mode).
Those rows carry the blocking finding id; a passing TEST cell with a finding id is a **false-green**.

> Legend — TEST cell: `✔` real-path proven (or pure/structural); `⚠ false-green` passes only via
> fixture/hand-seeded data, real path unproven/broken; `M` manual leg (pending); `—` n/a.

## REQ → downstream chain

| REQ-TS | SPEC-TS | T-TS | Code (file) | TEST-TS | Finding | Status |
|---|---|---|---|---|---|---|
| 001 open tab | 019,020 | 026,027,028,029 | `tabsStore.ts:239`,`TabBar.vue` | TEST-TS-006 ✔ | — | OK |
| 002 switch | 019,020 | 027,029 | `tabsStore.ts:273` | TEST-TS-007 ✔ | — | OK |
| 003 close | 019,020 | 027,029 | `tabsStore.ts:284` | TEST-TS-008 ✔ | — | OK |
| 004 min one | 019,020 | 027 | `tabsStore.ts:291` | TEST-TS-008 ✔ | — | OK |
| 005 ceiling | 005,019,020 | 006,027 | `tabsStore.ts:261`,`PluginSettings.ts` | TEST-TS-005,008 ✔ | — | OK |
| 006 stream isolation | 019,020,026 | 027,034,035 | `tabsStore.ts:507` | TEST-TS-007,024 ✔ | — | OK |
| 007 bg badge | 019,020 | 027,029 | `tabsStore.ts:304`,`TabBar.vue:23` | TEST-TS-009 ✔ | R-TS-008 (priority) | OK (polish nit) |
| 008 persist | 001,002,006,010,030 | 003,004,011,027 | `tabsStore.ts:674`,`VaultFileHistoryStore.ts` | TEST-TS-001,010 ✔ / M1 | R-TS-004 | **bug** (createdAt/state reset) |
| 009 meta record | 002 | 003 | `ConversationRecord.ts` | TEST-TS-002 ✔ | — | OK |
| 010 list newest | 001,006,007,008,011,022 | 010,019,031 | stores sort; `ResumeSessionDropdown.vue` | TEST-TS-011 ✔ | R-TS-004 | OK (date label wrong) |
| 011 rename | 017,022,031 | 019,031 | `RenameConversationUseCase`,`ResumeSessionDropdown.vue:100` | TEST-TS-012,025 ✔ | — | OK |
| 012 delete | 001,017,022,024 | 019,031,035 | `DeleteConversationUseCase`,`DeleteConfirmModal` | TEST-TS-012 ✔ / M2 | — | OK |
| 013 resume | 001,003,006,009,012,022,027 | 019,031,038 | `ResumeConversationUseCase`,`tabsStore.ts:311` | TEST-TS-013 ✔ / M1,M2 | R-TS-005 | partial (clobber + unproven CLI bind) |
| 014 resume P2 blocks | 012,022 | 019,031 | codec round-trip,`MessageTurn.vue:80` | TEST-TS-013 ✔ | — | OK (solid) |
| 015 resume keyboard | 022 | 031 | `ResumeSessionDropdown.vue:108` | TEST-TS-015 ✔ | — | OK |
| 016 fork affordance | 003,023,025 | 033,035 | `tabsStore.ts:352`,`MessageTurn.vue:55` | TEST-TS-023 ✔ | — | OK |
| 017 fork modal | 023 | 035 | `ForkTargetModal`,`chooseForkTarget` | TEST-TS-014 ✔ / M2 | — | OK |
| **018 fork derives lineage** | 001,002,013,031 | 021,033 | `buildForkPlan.ts:42`,`tabsStore.ts:382` | TEST-TS-014 ⚠ false-green | **R-TS-003** | **BROKEN** — derive dropped before persist |
| **019 rewind eligibility** | 003,018,025 | 016,032,033 | `rewindEligibility.ts:26`,`tabsStore.ts:358` | TEST-TS-021,023 ⚠ false-green | **R-TS-001** | **BROKEN** — `assistantMessageId` never set on real turns |
| 020 two-mode menu | 024 | 033 | `MessageTurn.vue:104` | TEST-TS-017 ✔ | R-TS-001 | menu OK but unreachable |
| **021 conv rewind executes** | 003,014,019,024 | 022,033 | `RewindConversationUseCase`,`ClaudeCliChatRuntime.ts:169` | TEST-TS-016 ⚠ false-green | **R-TS-002** | **BROKEN** — checkpoint stored then discarded on CLI |
| 022 code rewind gated | 014,024 | 022,033 | `RewindConversationUseCase.ts:58` | TEST-TS-017 ✔ | — | OK (correct deferral) |
| 023 compact | 015,026 | 024,034 | `CompactConversationUseCase`,`tabsStore.ts:426` | TEST-TS-018 ⚠ | R-TS-006 | at-risk (boundary may drop) |
| 024 title ladder | 016,031 | 014,024,031 | `tabsStore.ts:706`,`GenerateTitleUseCase` | TEST-TS-019,020,025 ✔ | — | OK |
| 025 title status | 016,022,031 | 019,024,031 | `ResumeSessionDropdown.vue:149` | TEST-TS-020,025 ✔ | — | OK |
| 026 provider-addressed | 001,003,032 | all | grep: 0 `provider==='claude'` in app/ui | TEST-TS-026 ✔ | — | OK |
| 027 only Claude | 009,027,032 | 010,011,038 | one impl/bridge, `providerId='claude'` | TEST-TS-026 ✔ | — | OK |
| 028 additive | 003,004,033 | 002,005 | `ChatRuntimePort.ts`,`ChatMessage.ts` | TEST-TS-003,004,026 ✔ | — | OK |

## NFR → evidence

| NFR-TS | Evidence | Status |
|---|---|---|
| 001 DDD inward | app imports domain only; ui imports port types + keys | OK |
| 002 narrow ports ×3 bridges | `VaultFileHistoryStore`/`MockHistoryStore`/`FixtureHistoryStore` | OK |
| 003 DTO-only store | `TabState` DTOs; runners in WeakMap sidecar | OK (TEST-TS-022) |
| 004 Result / error-as-chunk | use cases Result-returning; streaming error stays chunk | OK |
| 005 no obsidian in ui | modalSeam keeps Vue clean | OK (lint) |
| 006 no v-html/innerHTML | declarative templates | OK (lint) |
| 007 Obsidian Modal blocking | Fork/Delete modals; no `window.confirm` | OK |
| 008 `<script setup>` | all P3 components | OK (lint) |
| 009 WCAG keyboard | roving tabindex + listbox Arrow/Enter/Esc | OK |
| 010 reduced-motion / non-colour cue | badge number text + reduced-motion guards | OK |
| 011 coverage 80/70/80/80 | unit suite green (885) | OK (but false-green at 3 seams — see review) |
| 012 `--sp-*` tokens | §4.10 token block; lint:style-tokens clean | OK **except** emoji glyphs (R-TS-007) |
| 013 no secret persisted | codec strips non-contract fields; no secret field | OK (TEST-TS-002,010) |
| 014 no migration | codec load-or-default, `version` tolerated | OK |
| 015 manifest untouched | per implementation log | OK (re-verify at gate) |

## Orphan check

- **Orphan tests:** none — every TEST-TS maps to a REQ.
- **Orphan tasks:** none — T-TS-001..039 map to spec items; T-TS-040/041 (manual legs) + T-TS-042
  (orchestrator verify) are human/orchestrator-owned and **still open**.
- **Orphan ADRs:** ADR-TS-001/002/003 all referenced by SPEC-TS items and honoured (modulo the
  call-site bugs noted).
- **Broken downstream chains (no valid code→test link on the real path):** REQ-TS-018, REQ-TS-019,
  REQ-TS-021 — see R-TS-003/001/002. These are **must** requirements; the matrix is therefore
  `complete-with-broken-links`, not clean.

## Pending artifacts (block a clean matrix)

`test-plan.md`, `test-report.md` are pending (qa stage). Manual legs TEST-TS-M1/M2 (vault round-trip +
real-CLI resume/rewind) are **the** evidence that would catch R-TS-001/002/003 and are not yet executed —
which is precisely why those defects reached this review undetected. Re-generate this matrix after the
blockers are fixed and the manual legs run.
