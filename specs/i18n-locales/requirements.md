---
id: PRD-IL-001
title: i18n — Full Locale Set (10 locales)
stage: requirements
feature: i18n-locales
area: IL
epic: claudian-reboot
phase: P11
status: accepted
owner: pm
integration_branch: next
inputs:
  - CHARTER-CLAUDIAN-REBOOT §3.9 (10-locale set de/en/es/fr/ja/ko/pt/ru/zh-CN/zh-TW)
  - D:\Projects\claudian-main/src/i18n/locales/*.json (wording reference, 10 locales)
  - src/ui/i18n/index.ts (SupportedLocale / SUPPORTED_LOCALES / toSupportedLocale / messages / fallbackLocale)
  - src/ui/i18n/locales/en.ts (the authoritative keyset)
  - tests/ui/i18n/index.test.ts (the en↔de key-parity test, generalised to all-10)
  - tests/i18n/forbidden-terms.test.ts (the P9 forbidden-terms guard + ALLOWED_PREFIXES)
created: 2026-05-27
updated: 2026-05-27
---

# PRD — i18n — Full Locale Set (10 locales)

## Summary

P11 completes the claudian-reboot i18n surface. The plugin already ships `en` + `de`
catalogues (`src/ui/i18n/locales/{en,de}.ts`) with `SupportedLocale = 'en' | 'de'`, a
`toSupportedLocale` narrowing helper, vue-i18n `messages` registration, and `fallbackLocale: 'en'`.
This phase adds the **eight missing locales** (`es`, `fr`, `ja`, `ko`, `pt`, `ru`, `zh-CN`, `zh-TW`)
to reach the parity-charter §3.9 set of **ten** (`de`, `en`, `es`, `fr`, `ja`, `ko`, `pt`, `ru`,
`zh-CN`, `zh-TW`), widens the registration/narrowing surface to ten, and generalises the existing
en↔de key-parity test to **all-ten-against-en**. The work is mechanical and additive: every new
catalogue is a full translation of `en.ts` whose leaf keyset matches `en` exactly, every
interpolation placeholder is preserved, and the forbidden-terms guard stays green for all locales.
This is the last surface-completion phase before P12 (a11y polish + final parity sign-off).

## Goals

- G1 — Register all ten parity-charter §3.9 locales (`de`, `en`, `es`, `fr`, `ja`, `ko`, `pt`, `ru`,
  `zh-CN`, `zh-TW`) so each is selectable and resolves through vue-i18n.
- G2 — Guarantee every locale's leaf keyset is structurally identical to `en.ts` — no missing, no
  extra keys — enforced by a generalised all-ten-against-en parity test.
- G3 — Preserve every `en` interpolation placeholder (`{provider}`, `{count}`, `{name}`, `{percent}`,
  `{scope}`, …) verbatim in every translated string.
- G4 — Keep the user-facing surface jargon-clean (the P9 forbidden-terms guard) across all ten
  locales, with the same `ALLOWED_PREFIXES` allowlist.
- G5 — Stay additive: `en` and `de` catalogues unchanged; build and verify gate stay green; record
  the bundle-size growth from eight new catalogues.

## Non-goals

- NG1 — Native-speaker translation polish / professional linguistic review. P11 targets
  parity-complete + idiomatic translations (claudian wording where a term maps); native-speaker
  sign-off is a final-review / future concern (noted in success metrics).
- NG2 — Adding, removing, renaming, or restructuring any `en` key. The keyset is frozen by upstream
  phases; P11 translates the existing keyset only.
- NG3 — Locales beyond the charter §3.9 ten, and runtime locale auto-detection from the OS / Obsidian
  beyond what already exists.
- NG4 — The a11y stylesheet and the final cross-surface parity screenshot sign-off (both P12).

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Non-English Specorator user (e.g. Japanese, Spanish, Russian) | A chat + settings surface in their own language | Charter §1 demands a 1:1 Claudian experience; Claudian ships ten locales, so parity requires the same set. |
| Claudian migrant | Familiar microcopy meaning in their locale | Charter §3 binds microcopy *meaning* parity; porting claudian wording keeps the migrant's recognition intact. |
| Maintainer / reviewer | Confidence that no locale drifts from the canonical keyset | A structural drift (missing/extra key) silently degrades to fallback text; the parity test makes drift a red build, not a runtime surprise. |
| Release engineer | A build that still succeeds within size budget | Eight more catalogues grow `main.js` (already ~1.8 MB); the build must stay green and the growth must be recorded. |

## Jobs to be done

- When **I use Specorator with my Obsidian locale set to one of the ten supported languages**, I want
  **the chat and settings surface rendered in that language**, so I can **work without translating
  microcopy in my head**.
- When **a maintainer adds or edits an `en` key in a later phase**, I want **the parity test to fail
  for every locale that now lacks the key**, so I can **catch translation drift at build time**.
- When **a translated string interpolates a runtime value**, I want **the placeholder preserved
  exactly**, so I can **see the provider/name/count substituted rather than a literal `{provider}`**.

## Functional requirements (EARS)

> Use [EARS notation](../../docs/ears-notation.md). One requirement per entry. Stable IDs. The keyset
> source of truth is `src/ui/i18n/locales/en.ts`; the claudian JSONs are a wording reference only
> (their key structure differs from ours).

### Group A — Locale set & registration

#### REQ-IL-001 — Ten locales registered and selectable

- **Pattern:** ubiquitous
- **Statement:** *The i18n module shall register exactly the ten locales `de`, `en`, `es`, `fr`, `ja`,
  `ko`, `pt`, `ru`, `zh-CN`, and `zh-TW` in `SUPPORTED_LOCALES`, the `SupportedLocale` type, and the
  vue-i18n `messages` map.*
- **Acceptance:**
  - Given the built i18n module
  - When `SUPPORTED_LOCALES` and the vue-i18n `messages` keys are enumerated
  - Then both contain exactly the ten charter §3.9 locale codes — no fewer, no extra — and each
    `messages` entry resolves to a non-empty catalogue
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.9
- **Verified by:** TEST-IL-001

#### REQ-IL-002 — Each new locale ships a full catalogue file

- **Pattern:** ubiquitous
- **Statement:** *The i18n module shall provide a catalogue file `src/ui/i18n/locales/<code>.ts` for
  each of the eight added locales (`es`, `fr`, `ja`, `ko`, `pt`, `ru`, `zh-CN`, `zh-TW`), each exporting
  a default `as const` message tree.*
- **Acceptance:**
  - Given the eight added locale codes
  - When each catalogue module is imported
  - Then each resolves to a default-exported object with at least one leaf string
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.9
- **Verified by:** TEST-IL-002

### Group B — Key parity (all-ten-against-en)

#### REQ-IL-003 — Every locale's leaf keyset equals en exactly

- **Pattern:** ubiquitous
- **Statement:** *Each registered non-en locale catalogue shall declare the exact same leaf key set as
  `en.ts` — with no missing and no extra keys.*
- **Acceptance:**
  - Given the `en` leaf keyset snapshotted at module load and a given non-en locale catalogue
  - When the two leaf keysets are diffed
  - Then the set of keys present in `en` but absent in the locale is empty, and the set present in the
    locale but absent in `en` is empty
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.9; supersedes the en↔de-only parity assertion
- **Verified by:** TEST-IL-003

#### REQ-IL-004 — Parity test generalised across all ten locales

- **Pattern:** event-driven
- **Statement:** *When the i18n parity test suite runs, the test harness shall assert REQ-IL-003 for
  every registered locale against `en`, snapshotting each keyset at module load before the
  `i18nMerge` tests mutate the shared catalogue references.*
- **Acceptance:**
  - Given the generalised parity test and the ten registered locales
  - When the suite executes
  - Then it produces one parity assertion per non-en locale, and a missing or extra key in any single
    locale fails the suite with a message naming the offending locale and keys
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.9; constitution Art. IV (deterministic checks first)
- **Verified by:** TEST-IL-004

### Group C — Narrowing

#### REQ-IL-005 — toSupportedLocale narrows the ten codes

- **Pattern:** event-driven
- **Statement:** *When `toSupportedLocale` is called with a string that exactly matches one of the ten
  registered locale codes (including the regional tags `zh-CN` and `zh-TW`), the i18n module shall
  return that code unchanged.*
- **Acceptance:**
  - Given each of the ten registered codes
  - When `toSupportedLocale(code)` is called
  - Then it returns the same code, and the result is assignable to `SupportedLocale`
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.9; SPEC-PSR-012 (narrowing contract)
- **Verified by:** TEST-IL-005

#### REQ-IL-006 — Unknown locale narrows to en

- **Pattern:** unwanted behaviour
- **Statement:** *If `toSupportedLocale` is called with a string that is not one of the ten registered
  locale codes, then the i18n module shall return `'en'`.*
- **Acceptance:**
  - Given an unsupported string (e.g. `'it'`, `'zh'`, `''`, `'EN'`)
  - When `toSupportedLocale` is called with it
  - Then it returns `'en'`
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.9; SPEC-PSR-012
- **Verified by:** TEST-IL-006

### Group D — Translation quality

#### REQ-IL-007 — Translations port claudian wording where a term maps

- **Pattern:** ubiquitous
- **Statement:** *Each translated catalogue shall render every `en` leaf as an idiomatic translation in
  the target language, reusing the established term wording from the corresponding
  `claudian-main/src/i18n/locales/<code>.json` reference where a key maps.*
- **Acceptance:**
  - Given a translated catalogue and its claudian reference
  - When the two are compared for a term that exists in both (e.g. "fork", "rewind", "model")
  - Then the translated catalogue uses the claudian-established target-language term (or a
    documented, more-idiomatic equivalent), and no leaf is left in English where a translation exists
- **Priority:** should
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3 (microcopy meaning parity)
- **Verified by:** TEST-IL-007 (review-assisted; deterministic "no untranslated leaf" spot-check)

### Group E — Placeholders & forbidden-terms guard

#### REQ-IL-008 — Interpolation placeholders preserved verbatim

- **Pattern:** ubiquitous
- **Statement:** *For every `en` leaf that contains one or more interpolation placeholders (`{provider}`,
  `{count}`, `{name}`, `{percent}`, `{scope}`, `{root}`, `{feature}`, `{reason}`, `{tool}`,
  `{pattern}`, `{mode}`, `{version}`, `{notePath}`, `{startLine}`, `{lineCount}`, `{canvasPath}`,
  `{keys}`), each translated locale's value for that key shall contain the exact same set of
  placeholder tokens.*
- **Acceptance:**
  - Given the `en` value for a key and the translated value for the same key
  - When the placeholder tokens (`{…}`) of each are extracted as a multiset
  - Then the translated multiset equals the `en` multiset (same tokens, same count) for every key in
    every locale
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3; constitution Art. IV
- **Verified by:** TEST-IL-008

#### REQ-IL-009 — Forbidden-terms guard stays green for all locales

- **Pattern:** ubiquitous
- **Statement:** *No user-visible string in any translated locale that lives outside the
  `ALLOWED_PREFIXES` allowlist shall contain the forbidden implementation terms ("API key",
  "subprocess", "SDK"), using the same allowlist as the existing `en` guard.*
- **Acceptance:**
  - Given a translated catalogue flattened to leaf entries with keys not matching any `ALLOWED_PREFIXES`
  - When each leaf value is scanned for the forbidden patterns
  - Then no offender is found for any of the ten locales, with the allowlist unchanged from the P9 guard
- **Priority:** must
- **Satisfies:** NFR-MPS-011 (inherited); CHARTER-CLAUDIAN-REBOOT §3
- **Verified by:** TEST-IL-009

### Group F — Additivity & fallback

#### REQ-IL-010 — en and de catalogues unchanged

- **Pattern:** unwanted behaviour
- **Statement:** *The P11 change shall not modify the `en` or `de` catalogue files.*
- **Acceptance:**
  - Given the `en.ts` and `de.ts` files at the P11 baseline (head of `next` at branch cut)
  - When the P11 branch is diffed against that baseline
  - Then `src/ui/i18n/locales/en.ts` and `src/ui/i18n/locales/de.ts` are byte-identical to baseline
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT (additive phase); constitution Art. III
- **Verified by:** TEST-IL-010 (diff/review check)

#### REQ-IL-011 — Missing translation falls back without crashing

- **Pattern:** unwanted behaviour
- **Statement:** *If a translation key is requested for a locale whose catalogue lacks it, then vue-i18n
  shall resolve the `en` fallback string and the plugin shall not throw.*
- **Acceptance:**
  - Given a locale active and a key absent from that locale but present in `en`
  - When the key is translated
  - Then the `en` string is returned and no error is raised (`fallbackLocale: 'en'` honoured)
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.9; constitution Art. IV
- **Verified by:** TEST-IL-011

#### REQ-IL-012 — Build succeeds and bundle growth recorded

- **Pattern:** event-driven
- **Statement:** *When the plugin bundle is built with the ten locales registered, the build shall
  succeed, and the resulting `main.js` size growth from the eight added catalogues shall be recorded in
  the phase artifacts.*
- **Acceptance:**
  - Given the ten-locale i18n module
  - When `npm run build` runs
  - Then the build exits successfully, `main.js` is produced, and the size delta versus the
    two-locale baseline is recorded (implementation-log / release-notes)
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT (bundle-size watch)
- **Verified by:** TEST-IL-012 (build gate + recorded measurement)

## Non-functional requirements

> All targets inherit from the epic constraints in `specs/i18n-locales/workflow-state.md` and the
> parity charter; none introduce a new threshold beyond what those documents already fix.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-IL-001 | correctness | All-ten leaf-key parity against `en` enforced by a test | 0 missing / 0 extra keys for each of the ten locales |
| NFR-IL-002 | correctness | Interpolation placeholder preservation across locales | Per-key placeholder multiset equals `en` for every key in every locale |
| NFR-IL-003 | quality | Forbidden-terms guard clean across all locales | 0 offenders outside `ALLOWED_PREFIXES`, allowlist unchanged from P9 |
| NFR-IL-004 | reliability | Missing-translation fallback never crashes | `fallbackLocale: 'en'`; no thrown error on any missing key |
| NFR-IL-005 | maintainability | Additivity — `en` / `de` byte-identical to baseline | 0-byte diff on `en.ts` and `de.ts` |
| NFR-IL-006 | build | Plugin bundle builds with ten locales | `npm run build` green; `main.js` produced; size delta recorded |
| NFR-IL-007 | quality | Test-coverage gate holds | 80 / 70 / 80 / 80 statements/branches/functions/lines |
| NFR-IL-008 | release | `manifest.json` untouched | identical `id` / `version` / `minAppVersion` to baseline |
| NFR-IL-009 | accessibility | Translated strings carry no markup that would break screen-reader output | Plain-text leaves only; no embedded HTML (consistent with `vue/no-v-html` surface) |

## Success metrics

- **North star:** 10 of 10 charter §3.9 locales registered, selectable, and passing the
  all-ten-against-en parity test with the full verify gate green on `next`.
- **Supporting:** placeholder-preservation test green for all ten locales; forbidden-terms guard green
  for all ten locales; `main.js` builds successfully with the bundle-size delta recorded.
- **Counter-metric:** number of translated leaves that fall back to `en` at runtime because of a
  missing or mistyped key — target 0 (a non-zero value means a locale drifted from the canonical
  keyset, defeating the purpose of adding it). A secondary watch: native-speaker-flagged mistranslations
  reported post-merge — tracked toward the P12 / future polish pass, not gating P11.

## Release criteria

What must be true to ship P11.

- [ ] All `must` requirements (REQ-IL-001..006, 008..012) pass acceptance.
- [ ] REQ-IL-007 (idiomatic wording) reviewed; no untranslated leaf where a translation exists.
- [ ] NFR-IL-001..008 met (NFR-IL-009 met or explicitly waived with note).
- [ ] All-ten-against-en parity test green; placeholder-preservation test green; forbidden-terms guard
      green for all ten locales.
- [ ] `npm run verify` + `npm run test:all` zero failures; `main.js` builds; bundle-size delta recorded.
- [ ] `en` / `de` catalogues and `manifest.json` byte-identical to the `next` baseline.
- [ ] Native-speaker polish explicitly deferred (P12 / future) and noted in release-notes.

## Open questions / clarifications

- None blocking. See CLAR-IL-001 below (resolved, recorded for the design stage).

### CLAR-IL-001 — Placeholder-preservation enforcement: dedicated test vs manual review

- **Question:** The workflow-state scope names placeholder preservation as a quality bar but P7's
  parity test only checks keyset equality, not placeholder content. Should P11 add a *dedicated
  automated* placeholder-preservation test, or treat it as a manual translation-review checklist item?
- **Recommended resolution (PM):** Add a dedicated automated test (TEST-IL-008 backs REQ-IL-008): for
  every key, extract the `{…}` token multiset from the `en` value and assert each locale's value carries
  the identical multiset. Rationale — it is mechanical, deterministic, cheap, and catches the most
  likely translation defect (a translator dropping or renaming `{provider}`). This is a design-stage
  decision; recorded here so design does not silently downgrade it to manual review.

## Out of scope

- Native-speaker / professional linguistic review and polish (P12 / future).
- Any change to the `en` keyset, key names, or catalogue structure.
- Locales outside the charter §3.9 ten; OS/Obsidian locale auto-detection changes.
- The a11y stylesheet and final cross-surface parity screenshot sign-off (P12).

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable.
- [x] NFRs listed with targets.
- [x] Success metrics defined (including a counter-metric).
- [x] Release criteria stated.
- [x] `/spec:clarify` self-check complete — CLAR-IL-001 resolved (recommended resolution recorded).
