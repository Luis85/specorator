---
feature: i18n-locales
area: IL
current_stage: requirements
status: active
last_updated: 2026-05-27
last_agent: orchestrator (bootstrap)
epic: claudian-reboot
phase: P11
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.9 + claudian-main 10-locale set stand in, mirrors P1-P10)
  research.md: skipped
  requirements.md: pending
  design.md: pending
  spec.md: pending
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
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
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
```
