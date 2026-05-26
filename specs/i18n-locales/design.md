---
id: DESIGN-IL-001
title: Design — i18n Full Locale Set (10 locales)
stage: design
feature: i18n-locales
area: IL
epic: claudian-reboot
phase: P11
status: complete
integration_branch: next
inputs:
  - PRD-IL-001 (requirements.md — 12 REQ-IL + 9 NFR-IL)
  - src/ui/i18n/index.ts (SupportedLocale / SUPPORTED_LOCALES / toSupportedLocale / messages / fallbackLocale)
  - src/ui/i18n/locales/en.ts (authoritative keyset) + de.ts (file shape to mirror)
  - tests/ui/i18n/index.test.ts (en↔de parity test + leafKeys + snapshot-at-load)
  - tests/i18n/forbidden-terms.test.ts (P9 guard + ALLOWED_PREFIXES)
  - D:\Projects\claudian-main/src/i18n/locales/*.json (wording reference, structure differs)
created: 2026-05-27
updated: 2026-05-27
---

# Design — i18n Full Locale Set (10 locales)

> **Scope note.** P11 is a mechanical, additive phase. This design is intentionally LIGHT:
> no new component, no new port, no new flow, no new ADR (see Part C §C.7). The existing
> i18n system (`src/ui/i18n/`) and the en↔de parity-test pattern already exist; P11 adds
> data (eight catalogues) and widens four declaration sites from 2 → 10.

---

## Part A — UX

### A.1 Locale selection (no new flow)

Locale selection is the **existing P0 `locale` setting** (`PluginSettings.locale`, surfaced as a
dropdown in the settings tab). P11 changes nothing about the flow — it only grows the option list:

- **Before P11:** the dropdown offers two options (`en`, `de`).
- **After P11:** the dropdown offers the ten charter §3.9 codes (`de`, `en`, `es`, `fr`, `ja`,
  `ko`, `pt`, `ru`, `zh-CN`, `zh-TW`), driven off `SUPPORTED_LOCALES`.
- Selecting any option calls `setLocale(toSupportedLocale(stored))` exactly as today; the UI
  re-renders in the chosen language through vue-i18n.

### A.2 Fallback experience

A key missing from the active locale resolves to the `en` string via `fallbackLocale: 'en'`
(unchanged). The user never sees a raw key token or a broken/blank label — at worst an English
string in an otherwise translated surface. Because the all-ten parity test (Part C §C.5) makes a
missing key a red build, this fallback is a safety net, not an expected runtime state.

### A.3 What does NOT change

- No new screen, modal, banner, or affordance.
- No locale auto-detection change (out of scope — NG3).
- No copy change to any `en` or `de` string (REQ-IL-010 — byte-identical additivity).

---

## Part B — UI

### B.1 No new component

P11 introduces **zero Vue components**. The visible surface is the existing settings `locale`
dropdown plus the message catalogues consumed by already-shipped components. The only UI-layer
artifacts are eight data files.

### B.2 The eight new catalogue files

Each new file `src/ui/i18n/locales/<code>.ts` mirrors `de.ts` exactly in shape:

```ts
export default {
  // …same nested tree as en.ts, translated values…
} as const;
```

Contract (full pinning in spec.md SPEC-IL-003):

- **Default export**, object literal, `as const`.
- **Exact `en` keyset** — same nested structure, same leaf dot-paths, no missing, no extra keys.
- **Translated values** — idiomatic target-language strings; claudian wording reused where a
  term maps (REQ-IL-007); no leaf left in English where a translation exists.
- **Placeholders preserved** — every `{token}` from the `en` value present verbatim, same set,
  same count (REQ-IL-008).
- **Plain text only** — no embedded HTML markup (NFR-IL-009).

The eight files: `es.ts`, `fr.ts`, `ja.ts`, `ko.ts`, `pt.ts`, `ru.ts`, `zh-CN.ts`, `zh-TW.ts`.

### B.3 Translation source rule

- `src/ui/i18n/locales/en.ts` is the **keyset authority** — the structure every locale must match.
- `D:\Projects\claudian-main/src/i18n/locales/<code>.json` is a **wording reference only**. Its
  key structure differs from ours (built P1–P10), so it is consulted for established target-language
  term choices (e.g. "fork", "rewind", "model"), never copied structurally.

---

## Part C — Architecture

### C.1 System overview

```mermaid
flowchart LR
  settings["PluginSettings.locale<br/>(P0 dropdown)"] -->|toSupportedLocale| narrow["toSupportedLocale()"]
  narrow -->|SupportedLocale| setLocale["setLocale()"]
  setLocale --> i18n["vue-i18n instance<br/>(createI18n)"]
  subgraph catalogues["messages: Record&lt;SupportedLocale, MessageSchema&gt;"]
    en["en.ts (authority)"]
    de["de.ts"]
    new["es fr ja ko pt ru zh-CN zh-TW"]
  end
  catalogues --> i18n
  i18n -->|t(key)| ui["Vue components"]
  en -.->|fallbackLocale: 'en'| i18n
```

The diagram is the **current** system with the catalogue set grown from 2 → 10. No new node,
edge, store, or external dependency.

### C.2 Components and responsibilities (the four widened sites)

| Site (`src/ui/i18n/index.ts` unless noted) | Responsibility | P11 change |
|---|---|---|
| `SupportedLocale` (type) | The locale union | Widen `'en' \| 'de'` → the ten codes |
| `SUPPORTED_LOCALES` (array) | Runtime enumeration of valid codes | Widen `['en','de']` → the ten codes |
| `messages` (createI18n) | vue-i18n catalogue registration | Add the eight `import` + register all ten |
| `toSupportedLocale` (fn) | Narrow any string → `SupportedLocale` | No body change — it reads `SUPPORTED_LOCALES`, so widening the array widens the narrowing automatically |
| `src/ui/i18n/locales/<code>.ts` ×8 | Translated message data | New files (Part B.2) |
| `tests/ui/i18n/index.test.ts` | Parity assertions | Generalise en↔de → all-ten-against-en (§C.5) + add placeholder-multiset test |
| `tests/i18n/forbidden-terms.test.ts` | Jargon guard | Run the existing scan across all ten (allowlist unchanged) |

### C.3 The widened declaration shapes (final)

```ts
export type SupportedLocale =
  | 'en' | 'de' | 'es' | 'fr' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh-CN' | 'zh-TW';

export const SUPPORTED_LOCALES: SupportedLocale[] =
  ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW'];

// messages: import each catalogue, register all ten:
messages: {
  en: enMessages, de: deMessages, es: esMessages, fr: frMessages,
  ja: jaMessages, ko: koMessages, pt: ptMessages, ru: ruMessages,
  'zh-CN': zhCNMessages, 'zh-TW': zhTWMessages,
} as unknown as Record<SupportedLocale, MessageSchema>,
```

`toSupportedLocale` keeps its current body verbatim — it already narrows by membership in
`SUPPORTED_LOCALES` and falls back to `'en'`, so it covers `zh-CN`/`zh-TW` and unknown→`'en'`
once the array is widened. No edit to the function is required beyond the array it consumes.
Spec.md pins the exact final shapes (SPEC-IL-001).

### C.4 Data model

No data-model change. The message tree is the existing `MessageSchema = typeof en`. Each new
catalogue is a structural instance of that schema (enforced by the parity test, not the type
system — `messages` is cast to `unknown` to dodge literal-type conflicts, per the existing comment).
`PluginSettings.locale` stays a `string` persisted to the device-local store (ADR-PSR-002);
`toSupportedLocale` is the single narrowing gate at every `setLocale` call site.

### C.5 The all-ten key-parity test (generalised)

The current test snapshots `EN_KEYS_AT_LOAD` / `DE_KEYS_AT_LOAD` at module load (before the
`i18nMerge` tests mutate the shared catalogue references) and diffs the two. P11 generalises this:

- Build a registry of `{ code → leafKeys(catalogue) }` **at module load** for all nine non-en
  locales plus `en`, reusing the existing `leafKeys` helper.
- Emit **one parity assertion per non-en locale** (table-driven `it.each` over `SUPPORTED_LOCALES`
  minus `'en'`), each diffing that locale's snapshot against `EN_KEYS_AT_LOAD` in both directions
  (missing-in-locale and extra-in-locale), with a failure message naming the offending locale and
  keys (REQ-IL-003/004).
- The snapshot-at-load discipline is preserved so the `i18nMerge` mutation tests in the same file
  cannot poison the keysets.

### C.6 The placeholder-multiset test (new, per CLAR-IL-001)

A new deterministic test (TEST-IL-008) backs REQ-IL-008. For each key present in `en`:

- Extract the `{…}` token **multiset** from the `en` value (regex `/\{[^}]+\}/g`, sorted, counted).
- For each non-en locale, extract the same-key value's multiset and assert equality (same tokens,
  same count). A translator dropping `{provider}` or renaming it to `{anbieter}` fails here.

This is the resolution of CLAR-IL-001 (dedicated automated test, not manual review) — recorded so
the spec does not silently downgrade it.

### C.7 Decisions

| Decision | Choice | Rationale | ADR |
|---|---|---|---|
| New port? | **No** | i18n is UI-layer data + an existing helper; no Obsidian API surface touched. | — |
| New component? | **No** | Existing `locale` dropdown + catalogues; P11 is data. | — |
| New ADR? | **No** | The i18n system, the narrowing contract (SPEC-PSR-012), the parity-test pattern (P7), and the forbidden-terms guard (P9) already exist. P11 is additive data + a 2→10 widening of four declaration sites. No irreversible architectural choice is introduced. | none |
| Catalogue delivery | **Bundled into `main.js`** | Locale catalogues are app data, not user content; vue-i18n resolves them synchronously at boot. No lazy-loading / externalization — that would add async complexity for a plugin already shipping a single bundle. | — (see §C.8) |
| Placeholder enforcement | **Dedicated automated test** | CLAR-IL-001 resolution; mechanical, deterministic, cheap, catches the most likely defect. | — |

**No new ADR is filed.** If implementation surfaces a load-bearing decision (it should not),
escalate and file ADR-IL-001 the P5–P10 way; none is anticipated.

### C.8 Bundle-size note (REQ-IL-012 / NFR-IL-006)

Eight more catalogues, each a full translation of the `en` keyset (~140 leaves), grow `main.js`
(baseline ~1.8 MB). The growth is **accepted**: catalogues are static text, compress well, and
load once at boot with no runtime cost. **No externalization / lazy-loading** is introduced —
locale data is bundled like every other app constant. The build must stay green and the measured
`main.js` size delta versus the two-locale baseline is recorded in the implementation-log /
release-notes (TEST-IL-012). This is the only thing to watch in this otherwise mechanical phase.

### C.9 Rejected alternatives

| Alternative | Rejected because |
|---|---|
| Lazy-load locale catalogues (async import on locale switch) | Adds async + loading-state complexity to a synchronous boot path for a sub-megabyte data delta; no user-perceptible benefit. |
| Generate catalogues from the claudian JSONs programmatically | Claudian's key structure differs from ours; a generator would mis-map keys. en.ts is the keyset authority; claudian is wording-only. |
| Manual placeholder-review checklist instead of a test | CLAR-IL-001 rejected this — manual review is non-deterministic and the defect (dropped/renamed placeholder) is exactly what a cheap automated test catches. |
| Widen `ALLOWED_PREFIXES` pre-emptively for translations | The allowlist must stay unchanged from P9 (REQ-IL-009). Extend it only if a translated settings/credential string legitimately trips the guard (EC-IL-005). |

---

## Requirements coverage (Part C — Architecture)

| Requirement | Covered by |
|---|---|
| REQ-IL-001 (ten registered) | §C.2, §C.3 |
| REQ-IL-002 (eight catalogue files) | §B.2 |
| REQ-IL-003 (leaf keyset == en) | §B.2, §C.5 |
| REQ-IL-004 (parity test generalised) | §C.5 |
| REQ-IL-005 (narrows the ten) | §C.3 |
| REQ-IL-006 (unknown → en) | §C.3 |
| REQ-IL-007 (claudian wording) | §B.3 |
| REQ-IL-008 (placeholders preserved) | §C.6 |
| REQ-IL-009 (forbidden-terms guard) | §C.2, §C.9 |
| REQ-IL-010 (en/de byte-identical) | §A.3, §B.2 |
| REQ-IL-011 (fallback no crash) | §A.2 |
| REQ-IL-012 (build + bundle recorded) | §C.8 |

---

## Quality gate

- [x] System overview diagrammed (existing system, 2→10 catalogues).
- [x] Components/responsibilities tabled (the four widened sites + new files + tests).
- [x] Data model addressed (no change; schema = `typeof en`).
- [x] Key decisions recorded; no-new-ADR verdict justified (§C.7).
- [x] Rejected alternatives listed.
- [x] Bundle-size growth confirmed acceptable, no externalization (§C.8).
- [x] Requirements coverage table complete for Part C.
