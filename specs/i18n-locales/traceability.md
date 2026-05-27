---
id: TRACE-IL-001
title: Traceability Matrix — i18n Full Locale Set (10 locales)
stage: review
feature: i18n-locales
area: IL
epic: claudian-reboot
phase: P11
status: complete
owner: reviewer
integration_branch: next
created: 2026-05-27
updated: 2026-05-27
inputs:
  - PRD-IL-001 (requirements.md)
  - DESIGN-IL-001 (design.md)
  - SPEC-IL-001 (spec.md)
  - TASKS-IL-001 (tasks.md)
  - REVIEW-IL-001 (review.md)
---

# Traceability Matrix — i18n Full Locale Set (P11)

Regenerated and validated at Stage-9. Every REQ-IL has a downstream SPEC → TASK → CODE → TEST
chain and (where applicable) a review finding. No new ADR (DESIGN-IL-001 §C.7). No orphans.

## REQ ↔ SPEC ↔ TASK ↔ CODE ↔ TEST ↔ FINDING

| REQ-IL | SPEC-IL | TASK | Code (file) | TEST-IL | Finding | Status |
|---|---|---|---|---|---|---|
| REQ-IL-001 (ten registered/selectable) | SPEC-IL-001, SPEC-IL-002 | T-IL-002, T-IL-006, T-IL-011, T-IL-013 | `src/ui/i18n/index.ts` (`SupportedLocale`, `SUPPORTED_LOCALES`, `messages`) | TEST-IL-001 | — | satisfied |
| REQ-IL-002 (eight catalogue files) | SPEC-IL-003 | T-IL-007, T-IL-008, T-IL-009 | `src/ui/i18n/locales/{es,fr,ja,ko,pt,ru,zh-CN,zh-TW}.ts` | TEST-IL-002 | — | satisfied |
| REQ-IL-003 (leaf keyset == en) | SPEC-IL-003, SPEC-IL-004 | T-IL-003, T-IL-007/008/009, T-IL-011 | `locales/<code>.ts` (×8) | TEST-IL-003 | — | satisfied |
| REQ-IL-004 (parity generalised) | SPEC-IL-004 | T-IL-003, T-IL-011 | `tests/ui/i18n/index.test.ts` | TEST-IL-004 | — | satisfied |
| REQ-IL-005 (narrows the ten) | SPEC-IL-001 | T-IL-006 | `src/ui/i18n/index.ts` (`toSupportedLocale`, body unchanged) | TEST-IL-005 | — | satisfied |
| REQ-IL-006 (unknown → en) | SPEC-IL-001 | T-IL-006 | `src/ui/i18n/index.ts` (`toSupportedLocale`) | TEST-IL-006 | — | satisfied |
| REQ-IL-007 (claudian wording) | SPEC-IL-003 | T-IL-007/008/009, T-IL-012 (deferred) | `locales/<code>.ts` (×8) | TEST-IL-007 | R-IL-001, R-IL-002 | satisfied (polish pending) |
| REQ-IL-008 (placeholders preserved) | SPEC-IL-003, SPEC-IL-005 | T-IL-004, T-IL-011 | `tests/ui/i18n/index.test.ts` (placeholder multiset) | TEST-IL-008 | — | satisfied |
| REQ-IL-009 (forbidden-terms guard) | SPEC-IL-003, SPEC-IL-006 | T-IL-005, T-IL-011 | `tests/i18n/forbidden-terms.test.ts` | TEST-IL-009 | — | satisfied |
| REQ-IL-010 (en/de byte-identical) | SPEC-IL-007 | T-IL-010, T-IL-013 | `git diff next` (en.ts/de.ts/manifest.json) | TEST-IL-010 | — | satisfied |
| REQ-IL-011 (fallback no crash) | SPEC-IL-008 | T-IL-006, T-IL-011 | `src/ui/i18n/index.ts` (`fallbackLocale: 'en'`) | TEST-IL-011 | — | satisfied |
| REQ-IL-012 (build + bundle delta) | SPEC-IL-009 | T-IL-001, T-IL-013 | `npm run build` (parent leg) | TEST-IL-012 | — | deferred to parent |

## NFR coverage

| NFR-IL | SPEC-IL | TEST / gate | Status |
|---|---|---|---|
| NFR-IL-001 (all-ten parity) | SPEC-IL-004 | TEST-IL-003/004 | green |
| NFR-IL-002 (placeholder multiset) | SPEC-IL-005 | TEST-IL-008 | green |
| NFR-IL-003 (forbidden-terms clean) | SPEC-IL-006 | TEST-IL-009 | green |
| NFR-IL-004 (fallback no crash) | SPEC-IL-008 | TEST-IL-011 | green |
| NFR-IL-005 (en/de byte-identical) | SPEC-IL-007 | TEST-IL-010 / `git diff` | green |
| NFR-IL-006 (build green + bundle delta) | SPEC-IL-009 | TEST-IL-012 (build gate) | parent leg |
| NFR-IL-007 (coverage 80/70/80/80) | whole suite | `npm run test:coverage` | parent leg |
| NFR-IL-008 (manifest untouched) | SPEC-IL-007 | TEST-IL-010 / `git diff` | green |
| NFR-IL-009 (plain-text leaves) | SPEC-IL-003 | TEST-IL-003 contract + spot-check | green |

## Edge-case coverage (EC-IL ↔ TEST)

| EC-IL | Caught by | Status |
|---|---|---|
| EC-IL-001 (dropped placeholder) | TEST-IL-008 | covered |
| EC-IL-002 (renamed placeholder / fullwidth brace) | TEST-IL-008 | covered |
| EC-IL-003 (extra key) | TEST-IL-003 | covered |
| EC-IL-004 (missing key) | TEST-IL-003 | covered |
| EC-IL-005 (forbidden term in non-allowlisted leaf) | TEST-IL-009 | covered |
| EC-IL-006 (`zh-CN`/`zh-TW` narrow) | TEST-IL-005 | covered |
| EC-IL-007 (`'zh'`/`'it'`/`''`/`'EN'`/`'de-DE'` → en) | TEST-IL-006 | covered |
| EC-IL-008 (missing key at runtime → fallback) | TEST-IL-011 | covered |
| EC-IL-009 (no-placeholder leaf) | TEST-IL-008 | covered |
| EC-IL-010 (empty/whitespace leaf) | TEST-IL-003 contract + spot-check | covered |

## Orphan check

- **Orphan requirements** (REQ with no downstream chain): none — all twelve trace to spec, task,
  code, and test.
- **Orphan tests** (TEST with no upstream REQ): none — TEST-IL-001..012 each back a REQ-IL.
- **Orphan tasks** (TASK with no SPEC/REQ): none — T-IL-001..013 each cite ≥1 SPEC/TEST/REQ/NFR.
- **Orphan ADRs:** none — P11 files no ADR by design (DESIGN-IL-001 §C.7).

## Findings register (this review)

| Finding | Severity | REQ | Status |
|---|---|---|---|
| R-IL-001 (`permission.plan` CJK all-caps badge) | N3 nit, non-blocking | REQ-IL-007 | open → deferred to T-IL-012 |
| R-IL-002 (native-speaker polish pending) | informational | REQ-IL-007 / NG1 | pending (P12/future), not gating P11 |
