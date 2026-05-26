---
id: IMPL-LOG-IL-001
title: i18n full locale set (P11) — Implementation Log
stage: implementation
feature: i18n-locales
area: IL
epic: claudian-reboot
phase: P11
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-27
updated: 2026-05-27
---

# Implementation Log — i18n full locale set (P11)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. P11 is mechanical + additive: eight new locale
catalogues, the `index.ts` four-site widen (T-IL-002), and two generalised tests.
Catalogue authoring is chunked 2–3 locales per dispatch (the P8/P9
subagent-timeout lesson).

## Layer B — CATALOGUES (T-IL-007..009)

### T-IL-007 — Romance chunk: `es.ts` + `fr.ts` + `pt.ts` (🔨🪓 dev)

- **Spec/req:** SPEC-IL-002, SPEC-IL-003, REQ-IL-002, REQ-IL-007, REQ-IL-008,
  REQ-IL-009, NFR-IL-009; TEST-IL-002/003/008/009 (rows for es/fr/pt).
- **Files:**
  - `src/ui/i18n/locales/es.ts` (new, lines 1–351) — Spanish catalogue, full
    `export default {…} as const` mirror of `en.ts`.
  - `src/ui/i18n/locales/fr.ts` (new, lines 1–351) — French catalogue.
  - `src/ui/i18n/locales/pt.ts` (new, lines 1–351) — Portuguese catalogue.
  - `specs/i18n-locales/implementation-log.md` (new — this file).
- **Commits (one per locale):**
  - es — `f197be6ca3ae4440d78a92e701f2a412cdc39d72`
  - fr — `572c703a3d4162ff142ca83df3a4ef73242f6ac2`
  - pt — `9776f9bb51055a5ab54ea39e9e76c203ac337716`
- **Outcome:** done.
- **Keyset parity (per-leaf diff against `en.ts`):** each of es/fr/pt has the
  EXACT `en` leaf keyset — **226 leaves, 0 missing, 0 extra** in all three.
  Verified by a standalone `tsc.transpileModule` + leaf-flatten diff script run
  against `en.ts` (the TEST-IL-003 parity assertion lands with T-IL-002/003
  wiring; verified here by eye + script ahead of that wire-in).
- **Placeholders (TEST-IL-008 preview):** every `{token}` multiset matches `en`
  per key — **0 placeholder mismatches** across all three locales. Tokens carried
  verbatim: `{name}`, `{provider}`, `{count}`, `{percent}`, `{scope}`, `{root}`,
  `{feature}`, `{reason}`, `{tool}`, `{pattern}`, `{mode}`, `{version}`,
  `{notePath}`, `{startLine}`, `{lineCount}`, `{canvasPath}`, `{keys}`.
- **Forbidden-terms (TEST-IL-009 preview):** the P9 `FORBIDDEN`
  (`/\bAPI key\b/i`, `/\bsubprocess\b/i`, `/\bSDK\b/i`) scan with the frozen
  `ALLOWED_PREFIXES` (`settings.`, `errors.subprocess`, `provider.field.`,
  `agent.chat.providers.secret.`, `agent.chat.providers.notice.keyRequired`)
  yields **0 offenders** for each of es/fr/pt. The "clave de API" / "clé d’API" /
  "chave de API" strings live only under the whitelisted `settings.apiKey.*` and
  `agent.chat.providers.secret.*` / `…notice.keyRequired` keys, matching `en`.
- **Brand identity:** "Specorator", "Claude", "Codex", "Opencode", "MCP" carried
  verbatim; no new brand token introduced. `effort.*` `serviceTier`/`thinking`
  labels translated.
- **Claudian wording reference (WORDING-only, structure differs):**
  `D:\Projects\claudian-main/src/i18n/locales/{es,fr,pt}.json` — reused for the
  fork/rewind/save vocabulary: es fork=`Bifurcar` / rewind=`Rebobinar` /
  `Guardar`/`Cancelar`/`Eliminar` / `Servidores MCP` / `Configuración`; fr
  fork=`Bifurquer` / rewind=`Rembobiner` / `Enregistrer`/`Annuler`/`Supprimer` /
  `Serveurs MCP`; pt fork=`Bifurcar` / rewind=`Retroceder` /
  `Salvar`/`Cancelar`/`Excluir` / `Servidores MCP` / `Configurações`.
- **Typecheck:** `npx vue-tsc -p tsconfig.lint.json --noEmit` → 0 after each
  locale (the `as const` data files are valid standalone TS even though
  `index.ts` does not yet import them — that wire-in is T-IL-002).
- **Lint:** whole-project `npm run lint` → **0 errors** after each locale
  (pre-existing `vue/one-component-per-file` warnings only; grep confirms **no**
  warning/error on `locales/{es,fr,pt}.ts`).
- **Deviation:** none. `index.ts` / `en.ts` / `de.ts` / `manifest.json` and the
  tests are untouched (additivity preserved — SPEC-IL-007). The all-ten parity
  test (T-IL-003) does not exist yet (it lands with the T-IL-002 wiring chunk);
  parity/placeholder/forbidden-terms were verified here by a deterministic
  leaf-diff + multiset + regex script ahead of the wire-in.
