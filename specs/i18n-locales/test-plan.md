---
id: TEST-PLAN-IL-001
title: i18n full locale set (P11) — Test Plan / Baseline + Guard-Verify Note
stage: testing
feature: i18n-locales
area: IL
epic: claudian-reboot
phase: P11
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-27
updated: 2026-05-27
inputs:
  - SPEC-IL-001 (spec.md — SPEC-IL-001..009, TEST-IL-001..012, EC-IL-001..010)
  - PRD-IL-001 (requirements.md — REQ-IL-001..012 + NFR-IL-001..009)
  - src/ui/i18n/index.ts + locales/{en,de,…}.ts
---

# Test Plan — i18n full locale set (P11)

This plan captures the **parity / placeholder targets**, the **bundle baseline**, and the
**guard verdict** for P11. P11 is mechanical + additive: eight new locale catalogues, the
`index.ts` four-site widen (2 → 10), and three generalised/new tests (all-ten parity, the
placeholder-multiset, and the all-ten forbidden-terms scan).

## 1. `en.ts` keyset (the parity target — SPEC-IL-003/004, TEST-IL-003)

`en.ts` is the **keyset authority** (frozen — NG2). Flattened to leaf dot-paths it has **226 leaves**
under `agent.*` + `settings.*`. Every non-en catalogue must declare this exact leaf set — zero
missing, zero extra (`missingInLocale` and `extraInLocale` both `[]` per locale).

**Verified baseline (deterministic leaf-flatten diff against `en.ts`, all 9 non-en catalogues):**

| Locale | Leaves | Missing | Extra | Placeholder mismatch |
|---|---|---|---|---|
| de | 226 | 0 | 0 | 0 |
| es | 226 | 0 | 0 | 0 |
| fr | 226 | 0 | 0 | 0 |
| ja | 226 | 0 | 0 | 0 |
| ko | 226 | 0 | 0 | 0 |
| pt | 226 | 0 | 0 | 0 |
| ru | 226 | 0 | 0 | 0 |
| zh-CN | 226 | 0 | 0 | 0 |
| zh-TW | 226 | 0 | 0 | 0 |

## 2. Placeholder inventory (the placeholder target — SPEC-IL-005, TEST-IL-008)

**35 of 226 `en` leaves interpolate.** The distinct `{token}` set in scope (17 tokens) is:

`{canvasPath}`, `{count}`, `{feature}`, `{keys}`, `{lineCount}`, `{mode}`, `{name}`, `{notePath}`,
`{pattern}`, `{percent}`, `{provider}`, `{reason}`, `{root}`, `{scope}`, `{startLine}`, `{tool}`,
`{version}`.

For every leaf key, each locale's `{…}` multiset (`value.match(/\{[^}]+\}/g)` counted) must equal
`en`'s for that key. Baseline: **0 placeholder mismatches** across all 9 non-en catalogues.

## 3. Forbidden-terms guard (SPEC-IL-006, TEST-IL-009)

The P9 `FORBIDDEN` set (`/\bAPI key\b/i`, `/\bsubprocess\b/i`, `/\bSDK\b/i`) is scanned across all
ten catalogues with the **byte-unchanged P9** `ALLOWED_PREFIXES`:
`['settings.', 'errors.subprocess', 'provider.field.', 'agent.chat.providers.secret.',
'agent.chat.providers.notice.keyRequired']`. Baseline: **0 offenders outside the allowlist** in any
of the ten catalogues. Any `ALLOWED_PREFIXES` extension is a **defect-escalation** (EC-IL-005), not a
default.

## 4. claudian wording map (WORDING-only reference — REQ-IL-007, DESIGN-IL-001 §B.3)

For each of the eight target locales the
`D:\Projects\claudian-main/src/i18n/locales/<code>.json` reference exists and is consulted for
**wording only** (fork/rewind/save/MCP/settings vocabulary). Its key structure differs from ours, so
it is never copied structurally — OUR `en.ts` is the parity authority. Native-speaker linguistic
polish is the **deferred leg T-IL-012 (P12 / future)** — explicitly **not gating P11**; the automated
parity / placeholder / forbidden-terms tests are the P11 quality gate.

## 5. Two-locale `main.js` bundle baseline (SPEC-IL-009, TEST-IL-012)

The two-locale (en + de) `next` baseline `main.js` size is the TEST-IL-012 delta reference. The
ten-locale delta is recorded by **T-IL-013** (the feature DoD), per the autonomous-drive directive —
this WIRING+TESTS chunk does not run `npm run build` (out of scope). The delta is informational (no
hard threshold beyond "build green"); catalogues are bundled, not externalized (DESIGN-IL-001 §C.8).

## 6. Guard verdict — one-line lint confirm (SPEC-IL-007, DESIGN-IL-001 §C.7)

A whole-project `npm run lint` run after the T-IL-002 widen reports **0 errors**: the new
`locales/{es,fr,ja,ko,pt,ru,zh-CN,zh-TW}.ts` files and the widened `SupportedLocale` /
`SUPPORTED_LOCALES` / `messages` / `toSupportedLocale` symbols are **not** caught by
`DELETED_SUBSYSTEM_BAN` / `DELETED_INJECTION_KEYS` (those ban `IBridge` / `BridgeKey` / `useBridge`
and removed-subsystem imports; the locale codes are plain data filenames under the already-live
`src/ui/i18n/locales/**` path, and the four widened symbols already existed at 2 locales).

**Verdict recorded:**

- **NO new InjectionKey / port / composable.** `SupportedLocale` is a string-union *widen* (no member
  removed); `messages` is already cast `as unknown as Record<SupportedLocale, MessageSchema>`, so the
  widen needs no type surgery; `toSupportedLocale`'s body is byte-unchanged (it narrows by membership
  in `SUPPORTED_LOCALES`, so widening the array widens the narrowing automatically incl. `zh-CN` /
  `zh-TW`; unknown → `'en'`).
- **NO guard-relax task in P11.** No `DELETED_SUBSYSTEM_BAN` / `DELETED_INJECTION_KEYS` glob matches a
  `locales/<code>.ts` file or the four widened symbols.
- **`en.ts` / `de.ts` / `manifest.json` are untouched** (SPEC-IL-007, NFR-IL-005/008). T-IL-010 /
  T-IL-013 re-confirm the byte-identity via `git diff next`.

## 7. Test inventory for this WIRING+TESTS chunk (T-IL-002..006)

| Test | File | Backs |
|---|---|---|
| All-ten key-parity (table-driven, snapshot-at-load) | `tests/ui/i18n/index.test.ts` | TEST-IL-003/004, SPEC-IL-004 |
| Placeholder-multiset (per non-en locale × per key) | `tests/ui/i18n/index.test.ts` | TEST-IL-008, SPEC-IL-005 |
| Forbidden-terms across all ten | `tests/i18n/forbidden-terms.test.ts` | TEST-IL-009, SPEC-IL-006 |
| Registration completeness + narrowing-the-ten + unknown→en + missing-key fallback | `tests/ui/i18n/index.test.ts` | TEST-IL-001/002/005/006/011, SPEC-IL-001/002/008 |
</content>
</invoke>
