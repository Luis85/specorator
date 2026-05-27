---
feature: i18n-locales
area: IL
current_stage: implementation
status: active
last_updated: 2026-05-27
last_agent: dev (T-IL-001..006 wiring+tests chunk)
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
  tasks.md: complete (TASKS-IL-001 — 13 T-IL tasks; wiring+tests-first RED scaffold, 3 catalogue chunks, gate)
  implementation-log.md: in-progress  # T-IL-001..009 logged; gate T-IL-010..013 remain
  test-plan.md: in-progress           # T-IL-001 baseline + guard verdict captured
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
| 6. Tasks | `tasks.md` | complete |
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
2026-05-27 (planner):     Stage 6 tasks complete (autonomous). TASKS-IL-001 — 13 T-IL tasks decomposing
                          SPEC-IL-001..009. STRUCTURE = wiring+tests-first RED scaffold, then 2-3-locale
                          catalogue chunks turning rows green, then gate. GUARD VERDICT: purely additive —
                          NO new InjectionKey/port/composable/component/ADR, NO guard-relax; SupportedLocale
                          is a string-union widen (no member removed), `messages` already cast `as unknown
                          as Record<SupportedLocale,MessageSchema>` so the widen needs no type surgery,
                          `toSupportedLocale` body UNCHANGED (narrows via the array). Tasks: T-IL-001 📐
                          baseline (en keyset + placeholder inventory + 2-locale bundle baseline + guard
                          verdict); T-IL-002 🔨 widen index.ts (the 4 sites: SupportedLocale union /
                          SUPPORTED_LOCALES array / 8 imports / messages map); T-IL-003 🧪 all-ten parity
                          (generalise en↔de, snapshot-at-load, table-driven); T-IL-004 🧪 placeholder-multiset
                          (CLAR-IL-001 automated test); T-IL-005 🧪 forbidden-terms all-ten (ALLOWED_PREFIXES
                          unchanged); T-IL-006 🧪 registration completeness + narrowing-the-ten + unknown→en
                          + missing-key fallback; T-IL-007..009 🔨🪓 the 3 CATALOGUE CHUNKS — es/fr/pt
                          (Romance) · ja/ko (CJK, ASCII braces) · zh-CN/zh-TW/ru (regional zh distinct +
                          Cyrillic); T-IL-010 🧪 en/de/manifest byte-identical RED; T-IL-011 🔨 green-all
                          invariants; T-IL-012 🚀👤 native-speaker polish DEFERRED to P12 (NOT gating —
                          parity/placeholder are AUTOMATED); T-IL-013 🚀 feature DoD + bundle-size delta
                          recorded + parity self-review + draft PR into next. WIRING+TESTS LAND FIRST so each
                          catalogue chunk turns its parity/placeholder/forbidden rows green on landing (no
                          tests-later gap). SUGGESTED DISPATCH CHUNKS: C1=T-IL-001..006 (scaffold), C2=T-IL-007
                          (es/fr/pt), C3=T-IL-008 (ja/ko), C4=T-IL-009 (zh-CN/zh-TW/ru), C5=T-IL-010..013
                          (gate) — C2/C3/C4 touch disjoint files, dispatch in any order/parallel. Hand-off →
                          /spec:implement (dev): START with T-IL-001 (baseline, no upstream dep). No open
                          clarifications.
2026-05-27 (dev):         WIRING+TESTS chunk (T-IL-001..006) complete on feature/i18n-locales.
                          T-IL-001 docs(il) 275c692e — test-plan.md baseline (en=226 leaves, 35
                          interpolating, 17 tokens; all 9 non-en catalogues 0 missing/extra/mismatch/
                          offender) + guard verdict (NO new InjectionKey/port, NO guard-relax, en/de/
                          manifest untouched). T-IL-002 feat(il) 28768ed3 — index.ts widened 2→10 (the
                          four sites: SupportedLocale union / SUPPORTED_LOCALES en-first-de-second-alpha-
                          zh-*-last / 8 imports / 10-entry messages; toSupportedLocale body byte-unchanged,
                          only a stale doc example fr→it). T-IL-003/004/006 test(il) ebf1d96b — tests/ui/
                          i18n/index.test.ts generalised to all-ten parity + placeholder-multiset +
                          registration/narrowing/fallback (51 tests). T-IL-005 test(il) d0de0a99 — tests/
                          i18n/forbidden-terms.test.ts run over all ten (10 locales, 0 offenders).
                          VERIFY (this chunk's gate): npx vue-tsc -p tsconfig.lint.json --noEmit = 0;
                          whole-project npm run lint = 0 errors (22 pre-existing warnings: max-lines on
                          catalogues+stores, vue/one-component-per-file in tests); npx vitest run the two
                          i18n files = 61 tests GREEN (all 10 parity/placeholder/forbidden + narrowing +
                          fallback). NO locale-file defect surfaced — catalogues (T-IL-007..009, already
                          committed) were correct. NOT RUN (out of chunk scope, per directive): build/
                          build:web/docs:api/verify/dev. REMAINING: gate chunk T-IL-010 (en/de/manifest
                          byte-identity), T-IL-011 (green-all reconcile), T-IL-012 (deferred native-speaker
                          polish, P12), T-IL-013 (feature DoD + bundle delta + draft PR into next). Next
                          agent: dev/qa for the T-IL-010..013 gate chunk. Verification performed: vue-tsc 0,
                          lint 0 errors, 61 i18n tests green.
```
