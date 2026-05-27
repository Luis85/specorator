---
id: REVIEW-IL-001
title: Stage-9 Review — i18n Full Locale Set (10 locales)
stage: review
feature: i18n-locales
area: IL
epic: claudian-reboot
phase: P11
status: complete
owner: reviewer
integration_branch: next
verdict: approve
created: 2026-05-27
updated: 2026-05-27
inputs:
  - PRD-IL-001 (requirements.md — REQ-IL-001..012 + NFR-IL-001..009)
  - DESIGN-IL-001 (design.md — Parts A/B/C; no new ADR/port/component)
  - SPEC-IL-001 (spec.md — SPEC-IL-001..009 + TEST-IL-001..012 + EC-IL-001..010)
  - TASKS-IL-001 (tasks.md — T-IL-001..013)
  - IMPL-LOG-IL-001 (implementation-log.md)
  - TEST-PLAN-IL-001 (test-plan.md)
  - git diff next..HEAD (the whole P11 feature; next @ c5d8b226, not advanced)
---

# Stage-9 Review — i18n Full Locale Set (P11)

> **Scope.** Light review of a MECHANICAL, additive phase. The automated gates carry the
> weight; this review verifies they exist and pass, confirms additivity, and spot-checks
> translation quality. The reviewer ran `git diff`/`grep` read-only and the two gate test
> files directly; the full verify chain + build (TEST-IL-012 bundle delta) is the parent's leg.

## Verdict: **APPROVE**

All twelve `must`/`should` REQ-IL satisfied with deterministic evidence. The change is purely
additive (eight new data files + a four-site index widen + two generalised tests); `en.ts`,
`de.ts`, and `manifest.json` are byte-identical to the `next` baseline. No P1/P2 findings.
One non-blocking N3 nit recorded (the `permission.plan` CJK-badge judgment call, already flagged
by the implementer). One manual leg (T-IL-012 native-speaker polish) accumulates to the epic
final gate — recorded **pending**, explicitly **not gating P11**.

---

## 1. Requirements compliance

| REQ | Verdict | Evidence |
|---|---|---|
| REQ-IL-001 (ten registered/selectable) | satisfied | `src/ui/i18n/index.ts` — `SupportedLocale` 10-member union, `SUPPORTED_LOCALES` 10 codes (en/de first, alphabetical, zh-* last), 10-entry `messages` map. TEST-IL-001 green (registration completeness: length 10 + set deep-equal + non-empty entries). |
| REQ-IL-002 (eight catalogue files) | satisfied | `src/ui/i18n/locales/{es,fr,ja,ko,pt,ru,zh-CN,zh-TW}.ts` exist, each `export default {…} as const`. TEST-IL-002 green. |
| REQ-IL-003 (leaf keyset == en) | satisfied | TEST-IL-003 table-driven over 9 non-en locales, 0 missing / 0 extra (test-plan §1: 226 leaves each). Green. |
| REQ-IL-004 (parity generalised) | satisfied | `tests/ui/i18n/index.test.ts` `it.each(NON_EN_LOCALES)`, both-direction diff, locale+keys failure message; snapshot-at-load discipline preserved. |
| REQ-IL-005 (narrows the ten) | satisfied | `toSupportedLocale` body byte-unchanged; widening `SUPPORTED_LOCALES` widens the narrowing. TEST-IL-005 covers all ten incl. `zh-CN`/`zh-TW`. |
| REQ-IL-006 (unknown → en) | satisfied | TEST-IL-006 (`'it'`/`'zh'`/`''`/`'EN'`/`'de-DE'` → `'en'`). Green. |
| REQ-IL-007 (claudian wording) | satisfied (should) | Spot-check: `fr.ts`/`zh-CN.ts` genuinely translated, not English copies (see §4). Deterministic non-empty-leaf via parity. Native-speaker polish deferred (T-IL-012). |
| REQ-IL-008 (placeholders preserved) | satisfied | TEST-IL-008 per-locale per-key `{token}` multiset === en; 0 mismatch (test-plan §2: 35 interpolating leaves, 17 tokens). Spot-check zh-CN: verbatim ASCII `{name}`/`{count}`/`{canvasPath}`/`{percent}`. |
| REQ-IL-009 (forbidden-terms guard) | satisfied | `tests/i18n/forbidden-terms.test.ts` `it.each(SUPPORTED_LOCALES)`, `ALLOWED_PREFIXES` byte-unchanged from P9; 10 locales, 0 offenders. Green. |
| REQ-IL-010 (en/de byte-identical) | satisfied | `git diff next..HEAD -- en.ts de.ts manifest.json` → empty (zero output). TEST-IL-010 / SPEC-IL-007. |
| REQ-IL-011 (fallback no crash) | satisfied | TEST-IL-011 synthetic partially-merged locale → en string, no throw (`fallbackLocale: 'en'`). Green. |
| REQ-IL-012 (build + bundle delta) | deferred to parent | TEST-IL-012 is the parent's `npm run build` leg; bundle delta recorded at T-IL-013. Not re-run here per scope. |

NFR-IL-001..005/008/009 met (parity, placeholder, forbidden-terms, fallback, additivity, plain-text);
NFR-IL-006/007 (build + coverage gate) ride the parent's verify chain.

## 2. Design compliance

No drift. DESIGN-IL-001 specified the four widened sites + eight data files + two generalised tests
and **no new ADR / port / component**. The diff confirms exactly that: `index.ts` is the sole
non-data, non-test code change, and it widens precisely the four declared sites. `MessageSchema`,
the `as unknown as Record<...>` cast, and `fallbackLocale: 'en'` are unchanged.

## 3. Spec compliance

`index.ts` matches the pinned SPEC-IL-001 shapes (union order, array order, import names, messages
map). One minor recorded deviation: the `toSupportedLocale` doc-comment example changed `'fr'`→`'it'`
(IMPL-LOG T-IL-002) — **correct and necessary**, since `'fr'` is now a supported locale and the
comment illustrates an *unknown* blob; the function body is byte-unchanged as SPEC-IL-001 requires.
Logged in the implementation log; immaterial, no ADR needed.

## 4. Translation spot-check (REQ-IL-007 / quality)

- **`fr.ts`** — idiomatic French, not English copies (`"Comment puis-je vous aider ?"`,
  `"Arrêter la génération"`, `"Autoriser une fois"`/`"Toujours autoriser"`). Placeholders verbatim.
- **`zh-CN.ts`** — genuine Simplified Chinese (`"发送消息"`, `"无匹配项"`, `"常规"`/`"自动允许"`);
  distinct from `zh-TW` Traditional glyphs (`"傳送"` family, `"一般"`, `"自動允許"`) per IMPL-LOG
  (191/351 lines differ — not a byte-copy).
- **Brand tokens intact** across all eight: `Specorator` present (2×/file), `Claude`/`Codex`/
  `Opencode`/`MCP` carried verbatim (zh-CN: MCP×16, plus Claude/Codex/Opencode). No new brand token.
- **No garbage / no untranslated leaves observed** in the sampled regions; every file terminates
  `} as const;`.

## 5. Architecture & constitution

- Locale files are pure `as const` data under `src/ui/i18n/locales/` — no `obsidian` import, no Vue,
  no class, no `node:*`. The index widen adds no InjectionKey/port/composable. No layer violation.
- Additive `SupportedLocale` widen removes no member; the deleted-symbol guards
  (`DELETED_SUBSYSTEM_BAN`/`DELETED_INJECTION_KEYS`) do not match locale data filenames or the
  pre-existing four widened symbols (guard verdict confirmed in test-plan §6).
- Constitution: Art. III (incremental/additive), Art. IV (deterministic checks first — three
  generalised tests), Art. V (traceability — see traceability.md) all honoured. No violations.

## 6. Risks

No design/research risk register for this mechanical phase beyond the one watched dimension:
**bundle-size growth** (DESIGN-IL-001 §C.8 / REQ-IL-012). Status: accepted-by-design, delta to be
recorded by the parent's build (T-IL-013). No new risk surfaced by the review.

## 7. Findings

| ID | Severity | Category | Location | Finding | Recommendation | Owner |
|---|---|---|---|---|---|---|
| R-IL-001 | N3 (nit, non-blocking) | i18n / UX | `locales/{zh-CN,zh-TW}.ts` `agent.chat...permission.plan` | en uses an all-caps `'PLAN'` badge for emphasis; CJK has no case distinction, so zh-CN `'计划'` / zh-TW `'計畫'` cannot carry the all-caps styling (ru upper-cases to `'ПЛАН'`, fr keeps `'PLAN'`). Implementer flagged this for QA. | Accept as-is for P11 (no case in CJK is a script fact, not a defect); revisit during T-IL-012 native-speaker polish if a CJK reviewer prefers a bracketed/emphasised alternative. | dev (deferred to T-IL-012) |
| R-IL-002 | informational | process | T-IL-012 | Native-speaker / professional linguistic polish for the eight new catalogues is **pending** (NG1; human-owned). | Accumulate to the epic final gate (P12 / future). Not gating P11. | human |

No P1 (critical/blocking) or P2 (high) findings.

## 8. Traceability

`traceability.md` (TRACE-IL-001) regenerated and validated this stage: every REQ-IL-001..012 has a
full SPEC-IL ↔ TEST-IL ↔ code(file) chain; no orphan test, task, or ADR. See that file for the matrix.

## 9. Gate evidence

- `npx vitest run tests/ui/i18n/index.test.ts tests/i18n/forbidden-terms.test.ts` →
  **2 files, 61 tests, all passing** (parity all-ten + placeholder-multiset + forbidden-terms-all-ten
  + registration/narrowing/fallback). These ARE the review for a mechanical phase — confirmed green
  by the reviewer.
- `git diff next..HEAD -- src/ui/i18n/locales/en.ts src/ui/i18n/locales/de.ts manifest.json` →
  **empty** (additivity / SPEC-IL-007 confirmed).
- `git diff next..HEAD -- src/ui/i18n/index.ts` → the four-site widen only; `toSupportedLocale`
  body unchanged.
- Full verify chain + `npm run build` (bundle-size delta, TEST-IL-012) → **parent's leg**, not
  re-run here per scope.

## Hand-off

- Approved for the parent to complete the verify chain + build (record the `main.js` bundle-size
  delta at T-IL-013) and open the draft PR into `next`.
- Pending manual leg: **T-IL-012 native-speaker polish** — carry to the epic final gate (P12/future).
- Non-blocking nit **R-IL-001** (`permission.plan` CJK badge) — fold into T-IL-012, not P11.
