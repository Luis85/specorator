---
feature: i18n-locales
area: IL
current_stage: spec
status: active
last_updated: 2026-05-27
last_agent: architect (design + spec)
epic: claudian-reboot
phase: P11
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.9 + claudian-main 10-locale set stand in, mirrors P1-P10)
  research.md: skipped
  requirements.md: accepted (PRD-IL-001 — 12 REQ-IL + 9 NFR-IL)
  design.md: complete (DESIGN-IL-001 — Parts A/B/C; no new ADR)
  spec.md: complete (SPEC-IL-001 — 9 SPEC-IL + 10 EC-IL + 12 TEST-IL)
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — i18n-locales (P11)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted |
| 4. Design | `design.md` | complete |
| 5. Specification | `spec.md` | complete |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P11 (i18n — full locale set)

P0-P10 merged to `next` (P10 settings-shell #451 / c5d8b226). P11 = the full **10-locale** i18n set
(charter §3.9: de, en, es, fr, ja, ko, pt, ru, zh-CN, zh-TW). **Largely mechanical + additive.**

**Current state:** `src/ui/i18n/` has `locales/{en,de}.ts` (`export default {…} as const` nested
catalogs), `SupportedLocale = 'en'|'de'`, `SUPPORTED_LOCALES = ['en','de']`, `toSupportedLocale(s)`
narrows (unknown → 'en'), `messages: {en,de}`, `fallbackLocale: 'en'`. The en↔de **key-parity test**
(`tests/ui/i18n/index.test.ts`, added P7) asserts en + de share the EXACT leaf keyset.

**Scope (charter §4 P11 row + §3.9):**
- Add the **8 missing locale files** `locales/{es,fr,ja,ko,pt,ru,zh-CN,zh-TW}.ts`, each a full
  translation of the en catalog, **structurally matching en's keyset EXACTLY** (the parity test
  enforces it across all 10).
- Widen `SupportedLocale` + `SUPPORTED_LOCALES` (+ `messages` registration) to the 10; `toSupportedLocale`
  narrows the 10 (incl. the `zh-CN`/`zh-TW` regional tags; unknown → 'en').
- **Generalise the key-parity test** from en↔de to **all-10-against-en** (every locale shares en's leaf
  keyset — no missing/extra keys; the snapshot-at-module-load pattern to dodge the i18nMerge-test
  mutation).

**Translation approach:** translate from OUR `en.ts` catalog (the authoritative keyset), porting
established term wording from `D:\Projects\claudian-main/src/i18n/locales/{es,fr,ja,…}.json` where a key
maps. Our key structure differs from claudian's (we built our own catalog P1-P10), so claudian is a
WORDING reference, not a structural source — the parity test enforces OUR keyset. Quality target =
parity-complete + idiomatic; native-speaker polish is a final-review/future concern. Keep interpolation
placeholders (`{provider}`, `{count}`, etc.) + the forbidden-terms guard (the P9 ALLOWED_PREFIXES) intact.

**Out of P11:** a11y stylesheet + final parity sign-off (P12). P11 is i18n only.

**Epic constraints (every phase):** NO backwards compat; DDD inward imports + narrow ports; Vue never
imports `obsidian`; `<script setup>`; tests mirror `src/`; coverage 80/70/80/80; perceptual `--sp-*`
parity; identity stays Specorator; WCAG 2.2 AA; manifest untouched; CI SHA-pinned. The added locales must
keep the forbidden-terms guard + the brand allowlist green. VERIFY GATE (`npm run verify` +
`npm run test:all` zero). Watch the plugin BUNDLE SIZE — 8 more locale catalogs grow main.js (already
~1.8MB); confirm the build still succeeds + note the size.

**Operating mode (human directive, /goal 2026-05-26):** AUTONOMOUS DRIVE the FULL remaining epic
(P11→P12) via dedicated subagents in loops — no per-phase human checkpoint; self-parity-review;
merge each phase to `next` after a green gate + green CI; deploy to `D:/TestVault` after each merge.
**SPLIT the locale implementation into ~2-3-locale chunks (the P8/P9 subagent-timeout lesson — 8 full
catalogs is large).**

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.9 + `D:\Projects\claudian-main`
`src/i18n/locales/*.json` (the 10 reference translations) + OUR `src/ui/i18n/{index.ts,locales/en.ts}`
+ the en↔de parity test + the forbidden-terms guard.

## Hand-off notes

```
2026-05-27 (orchestrator): P11 bootstrapped on feature/i18n-locales (off next; P0-P10 merged).
                          Scope = charter §3.9 — add the 8 missing locales (es/fr/ja/ko/pt/ru/zh-CN/
                          zh-TW) matching en's keyset exactly; widen SupportedLocale/SUPPORTED_LOCALES/
                          messages/toSupportedLocale to 10; generalise the key-parity test to all-10-
                          against-en. Translate from our en.ts (claudian JSONs = wording reference, not
                          structural). Autonomous; SPLIT locale impl into 2-3-locale chunks. Next:
                          /spec:requirements (pm) grounded in charter §3.9 + claudian locales + our
                          en.ts + the parity test. KEY: the all-10-parity enforcement; keep interpolation
                          placeholders + the forbidden-terms guard green; watch the bundle size.
2026-05-27 (pm):          Stage 3 requirements accepted (autonomous). PRD-IL-001 written —
                          12 functional REQ-IL (A locale set/registration: 001-002; B all-ten
                          key-parity: 003-004; C narrowing incl. zh-CN/zh-TW + unknown→en: 005-006;
                          D translation quality/claudian wording: 007; E placeholders+forbidden-terms
                          guard: 008-009; F additivity/fallback/build: 010-012) + 9 NFR-IL
                          (parity, placeholder-preservation, forbidden-terms-clean, no-crash fallback,
                          en/de byte-identical, build, coverage 80/70/80/80, manifest untouched, plain-
                          text leaves). Keyset source = OUR en.ts; claudian JSONs = WORDING reference
                          only (their structure differs). CLAR-IL-001 (placeholder enforcement →
                          dedicated automated test, not manual review) resolved. P11-done = 10 locales
                          registered + all-10 parity green + build green; native-speaker polish deferred
                          to P12/future. Hand-off → /spec:design (architect, Part A UX + Part B UI).
2026-05-27 (architect):   Stage 4 design + Stage 5 spec complete (autonomous, one dispatch).
                          DESIGN-IL-001 (LIGHT, Parts A/B/C): A — locale selection is the existing
                          P0 `locale` dropdown grown 2→10, missing key falls back to en (no new
                          flow); B — no new component, 8 new `locales/<code>.ts` mirroring de.ts
                          (en keyset exact, translated, placeholders preserved, plain text); C —
                          additive 2→10 widening of SupportedLocale/SUPPORTED_LOCALES/messages,
                          toSupportedLocale body UNCHANGED (narrows via the array), all-10-vs-en
                          parity test (snapshot-at-load), placeholder-multiset test (CLAR-IL-001
                          resolved = dedicated test), forbidden-terms guard across all 10 (allowlist
                          unchanged), bundle grows but bundled (no externalization). VERDICT: NO new
                          port, NO new component, NO new ADR (i18n system + narrowing SPEC-PSR-012 +
                          P7 parity pattern + P9 guard already exist; this is additive data + a
                          4-site widening). SPEC-IL-001 (9 SPEC + 10 EC-IL + 12 TEST-IL): exact final
                          shapes pinned (SupportedLocale union of 10, SUPPORTED_LOCALES en-first then
                          de then alpha with zh-* last, messages map, 8 file contracts). Chunking for
                          planner = 4 chunks: (1) es/fr/pt Romance, (2) ja/ko CJK, (3) zh-CN/zh-TW/ru,
                          (4) index wiring + the 4 tests (lands last, flips suite green + records
                          bundle delta). REQ↔SPEC↔TEST coverage table complete. Hand-off → /spec:tasks
                          (planner): split per the 4 chunks; Chunk 4 may land RED test scaffold first
                          so each locale chunk turns its row GREEN. No open clarifications
                          (CLAR-IL-001 already resolved upstream).
```
