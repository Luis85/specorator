---
id: IMPL-LOG-MHP-001
title: Host-side MCP proposal queue + Tier-A read expansion — Implementation log
stage: implementation
feature: mcp-host-side-proposals
status: in-progress
owner: dev
inputs:
  - SPECDOC-MHP-001
  - TASKS-MHP-001
created: 2026-05-24
updated: 2026-05-24
---

# Implementation log — Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX

A running record of *what* was implemented, *why* a deviation was taken, and *what* was learned. Append-only during implementation; no rewriting history.

## Entries

### 2026-05-24 — T-MHP-001 — Baseline capture (qa)
- **Files changed:**
  - `tests/__bench__/mhp-baseline.bench.ts` (new)
  - `specs/mcp-host-side-proposals/test-plan.md` (new — drafted from `templates/test-plan-template.md`, §Baselines populated)
  - `specs/mcp-host-side-proposals/implementation-log.md` (this entry)
- **Commit:** pending (orchestrator owns commit)
- **Spec reference:** NFR-MHP-001, NFR-MHP-002, NFR-MHP-003 (baselines), CLAR-MHP-018
- **Outcome:** done (partial — B3 deferred to manual user run)
- **Deviation from spec:**
  - Vitest's `bench()` reporter does not emit p95; p99 was recorded as a strict upper bound on p95 (with p75 for context). Documented in `test-plan.md` §Baselines.
  - Run-to-run variance exceeded the ±15% reproducibility threshold for B1 (+22.7%) and B2 (+19.0%). Escalation deferred because absolute numbers (sub-millisecond) sit 2–4 orders of magnitude below the NFR budgets; documented under §Variance flag.
- **Notes:**
  - Bench script: `tests/__bench__/mhp-baseline.bench.ts`. Run via `npx vitest bench tests/__bench__/mhp-baseline.bench.ts --run --project unit`. The `--project unit` filter is required because the storybook chromium project tries to import `node:crypto` and fails.
  - B1 (`ProposalStore.getAll()` with 100 pending entries) baseline p99 ≈ 0.46 ms. NFR-MHP-001 budget is 50 ms — two orders of magnitude of headroom.
  - B2 (`ProposalStore.queue()` averaged across the 8 existing write-tool callback shapes, no-op mutate, no logger) baseline p99 ≈ 0.0025 ms. NFR-MHP-002 budget is +10 ms — the audit-log append is expected to dominate.
  - B3 (`obsidian-cli` bare subprocess spawn latency) deferred: no `obsidian-cli` on CI runner or dev workstation. Registered as `bench.skip` unless `OBSIDIAN_CLI_PATH` env var is set, with `console.log` instructions for the user to run it manually in TestVault.
  - LoggerPort intentionally not wired in B2: the queue path does not log; only the mutate callback would, and that is mocked as `Promise.resolve()`.
  - Bench is not added to `npm run test` (separate command per project convention for non-deterministic benches).
- **DoD:** ✓ script committed, ✓ numbers in test-plan.md, [partial] reproducibility verified for B1/B2 only — see §Variance flag in test-plan.md.

### 2026-05-24 — T-MHP-002 — ProposalEventBus contract test (qa)
- File: tests/infrastructure/events/ProposalEventBus.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/infrastructure/events/ProposalEventBus"` (module not yet created)
- Satisfies: REQ-MHP-046 (event-bus contract); covers RISK-MHP-011 / SPEC-MHP-040
- Asserts: synchronous fan-out for `proposalEnqueued` + `proposalDecided`; `listenerCount` per type; unsubscribe handle removes listener; thrown listener errors are caught + LoggerPort.error invoked + not re-thrown to emitter; idempotent unsubscribe.

### 2026-05-24 — T-MHP-004 — McpClientIdentifier capture + fallback test (qa)
- File: tests/infrastructure/mcp/McpClientIdentifier.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/infrastructure/mcp/McpClientIdentifier"` (module not yet created)
- Satisfies: REQ-MHP-034, REQ-MHP-035; SPEC-MHP-036; EC-MHP-009/-010/-011; TEST-MHP-035, TEST-MHP-036
- Asserts: `attachInitializeHook` captures `clientInfo.name`; missing / empty / whitespace / non-string name normalises to `'unknown'`; name is trimmed + truncated to 128 chars; `identityFor` on unknown connection returns `{ id:'unknown', transport:'loopback', address:'' }`.

### 2026-05-24 — T-MHP-006 — ActiveFeatureResolver zero/one/multiple test (qa)
- File: tests/infrastructure/feature/ActiveFeatureResolver.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/infrastructure/feature/ActiveFeatureResolver"` (module not yet created)
- Satisfies: REQ-MHP-041; TEST-MHP-043; EC-MHP-012, EC-MHP-013; SPEC-MHP-037
- Asserts: scan of `specs/*/workflow-state.md` returns `{kind:'zero'}` | `{kind:'one', slug}` | `{kind:'multiple', slugs}`; per SPEC-MHP-037 the resolver itself does NOT emit `LoggerPort.warn` (caller responsibility per REQ-MHP-041 auto-accept algorithm); tolerates missing workflow-state.md files; empty specs folder → zero.

### 2026-05-24 — T-MHP-008 — PluginSettings DevTools additions test (qa)
- File: tests/core/PluginSettings.devtools.test.ts
- Status: FAILING (TDD) — 9 assertion failures (`Cannot read properties of undefined (reading 'tools')` etc.) — `DEFAULT_SETTINGS.devtools` and `requireExplicitAcceptForAllWrites` not yet declared
- Satisfies: REQ-MHP-010, REQ-MHP-016, REQ-MHP-017, REQ-MHP-043; SPEC §"Settings additions"
- Asserts: 5 new settings keys exist with `false` defaults — `requireExplicitAcceptForAllWrites`, `devtools.masterEnabled`, `devtools.autoAcceptLowRisk`, and `devtools.tools[id].enabled` for the 5 high-risk ids (`dev:dom`, `dev:cdp`, `dev:debug`, `dev:mobile`, `devtools`); existing fields (locale / specsFolder / providerSelection) still load with their pre-MHP defaults (additive change verified).
- Note: planner placed the test at `tests/domain/settings/PluginSettings.test.ts` in T-MHP-008 DoD; per qa hand-off directive the test was authored at `tests/core/PluginSettings.devtools.test.ts` to keep the new assertions in their own file and avoid interleaving with the existing WS-2 settings test.

### 2026-05-24 — T-MHP-009 — Proposal data model + AuditLogWriter sanity test (qa)
- File: tests/infrastructure/audit/AuditLogWriter.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/domain/mcp/Proposal"` (data model not yet created; AuditLogWriter likewise absent)
- Satisfies: REQ-MHP-022, REQ-MHP-036, REQ-MHP-037, REQ-MHP-040; SPEC §"Data structures"; SPEC-MHP-035
- Asserts: `ProposalKind` union accepts exactly the 16 documented literals and rejects unknown literals (compile-time `@ts-expect-error`); `AuditRow` exposes the 7 top-level fields with `schema: 1` literal type; `ProposalDecision.by` carries the 4 provenance literals; AuditLogWriter JSONL line round-trips through `JSON.parse`; `.specorator/` folder is auto-created (REQ-MHP-026 / TEST-MHP-027); rows with backslash paths are refused (POSIX-only invariant per spec §"Validation rules per field"); size-cap crossing triggers rotation (TEST-MHP-025).
- Judgment call: the planner's T-MHP-009 brief is the data-model task (proposal types), but the user-supplied test path lands under `tests/infrastructure/audit/`. To honour both, this file pairs the 16-literal `ProposalKind` assertion (T-MHP-009 strict scope) with an AuditLogWriter contract starter (anticipating T-MHP-030). The AuditLogWriter assertions overlap with T-MHP-030's brief and may be moved or split when T-MHP-030 is authored.

### 2026-05-24 — T-MHP-030 — AuditLogWriter rotation test (qa)
- File: tests/infrastructure/audit/AuditLogWriter.rotation.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/infrastructure/obsidian/audit/AuditLogWriter"` (module not yet created)
- Satisfies: REQ-MHP-022, REQ-MHP-023, REQ-MHP-024, REQ-MHP-025, REQ-MHP-026, NFR-MHP-008, NFR-MHP-014; SPEC-MHP-035; TEST-MHP-023/-024/-025/-026/-027
- Asserts: first append creates `.specorator/`; each row is `JSON.stringify(row) + '\n'` (LF, UTF-8); Windows-style backslash paths normalise to POSIX in the persisted payload; size > 2 MiB triggers rotation (active `.log` → `.log.1`, fresh `.log` < 2 MiB); rotation keeps at most 5 files (`.log.5` deleted before shift, `.log.6` never created); filesystem write failure routes through LoggerPort.error + NotificationPort.showError (sticky).
- Judgment call: T-MHP-030's DoD in tasks.md names a single file at `tests/infrastructure/obsidian/audit/AuditLogWriter.test.ts`, but the user-supplied path for this slice is `tests/infrastructure/audit/AuditLogWriter.rotation.test.ts`. Honoured the user-supplied path; rotation + folder-creation + POSIX-normalisation + filesystem-failure assertions live in this file. Exhaustive 7-field-shape / `schema:1` / DevTools-payload-excluded assertions are already drafted under T-MHP-009 at `tests/infrastructure/audit/AuditLogWriter.test.ts` and should be folded together (or kept split) when the dev picks up T-MHP-031. No spec contracts dropped — both files together cover the TEST-MHP-022..027 set named in T-MHP-030.

### 2026-05-24 — T-MHP-070 — Tier-A read registrar conditional-registration test (qa)
- File: tests/infrastructure/obsidian/mcp/registerObsidianCliReadTools.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/infrastructure/obsidian/mcp/registerObsidianCliReadTools"` (module not yet created)
- Satisfies: REQ-MHP-011, REQ-MHP-012, NFR-MHP-003; SPEC-MHP-013..024; TEST-MHP-012, TEST-MHP-013
- Asserts: all 12 canonical Tier-A tool names register when `cli.available === true` (`obsidian_cli_backlinks`, `_links`, `_unresolved`, `_orphans`, `_deadends`, `_outline`, `_diff`, `_history`, `_templates`, `_template_read`, `_property_read`, `_daily_read`); zero tools register when `cli.available === false`; no Tier-A read handler ever calls `ProposalStore.queue` (REQ-MHP-012 guarded by a poisoned-store substitute).
- Judgment call: T-MHP-070's DoD in tasks.md prescribes one file per Tier-A read tool under `tests/infrastructure/obsidian/mcp/reads/` covering per-tool validation + `cli_failed` + tools/list. The user-supplied slice is the conditional-registration test at the registrar level. Per-tool input-validation / spawn-discipline / non-zero-exit tests remain to be authored (still owed to T-MHP-070); this file covers the registrar inventory + REQ-MHP-012 guarantee only. Registrar option shape (`{ cli: { available, binaryPath }, logger, proposalStore? }`) is a contract proposal — dev is free to amend the option shape in T-MHP-072 provided the test's inventory assertion still passes; the poisoned-store hook is purely defensive.

### 2026-05-24 — T-MHP-110 — MigrationService semantic-equality verify test (qa)
- File: tests/infrastructure/migration/MigrationService.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/infrastructure/obsidian/MigrationService"` (module not yet created)
- Satisfies: REQ-MHP-027, REQ-MHP-028, REQ-MHP-029, REQ-MHP-030, REQ-MHP-031, NFR-MHP-010, NFR-MHP-013; SPEC-MHP-038; TEST-MHP-028..032, TEST-MHP-057; EC-MHP-017..022, EC-MHP-041; CLAR-MHP-014, CLAR-MHP-015
- Asserts: noop when `.mcp.json` absent; happy path re-serialises via `JSON.stringify(value, null, 2)` and verifies deep-equal before deleting root; nested-object input survives migration with deep equality (NFR-MHP-010); `.gitignore` append is LF-only and idempotent (CLAR-MHP-014); verify-mismatch keeps root + deletes partial target + surfaces sticky error notice (NFR-MHP-013); both-files-present aborts with verbatim S19-extension copy ("Both .mcp.json and .obsidian/mcp.local.json exist. Resolve manually before reload.") per EC-MHP-041; second invocation is `noop` (REQ-MHP-029).
- Judgment call: T-MHP-110's DoD covers happy-path + idempotence + verify-before-delete + deep-equal + gitignore + both-files-present. This file authors all five; the 100-run fault-injection matrix (T-MHP-146) is intentionally a separate file. The verify-mismatch fault injection here uses `bridge.readFile` interception to simulate corruption — when T-MHP-111 lands, dev may need to expose a different seam if the implementation re-reads from a non-VaultPort path (currently SPEC-MHP-038 step 5 explicitly reads through VaultPort, so the seam should hold).

### 2026-05-24 — T-MHP-122 — DevTools confirm-modal test (qa)
- File: D:\Projects\specorator-plugin\tests\ui\components\chat\FileWriteProposalCard.devtoolsConfirm.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/application/mcp/threatParagraphs"` (also `@/plugin/settings/DevToolsEnableConfirmModal`) — neither production module exists yet.
- Satisfies: REQ-MHP-016, REQ-MHP-017, REQ-MHP-020; Part B §S07..S09; NFR-MHP-011.
- Asserts: focus moves to heading on open; primary button has `mod-warning`; threat paragraph rendered verbatim from constant; Esc closes without invoking onConfirm; Tab cycles Cancel ↔ Enable (focus trap); Enter does NOT trigger default; S09 inline error renders at `data-testid="devtools-confirm-error"` on registration failure; `dev:cdp` body includes the verbatim "always prompts" sentence.
- Judgment call: user task-routing maps T-MHP-122 → DevTools confirm-modal flow at this path. The tasks.md T-MHP-122 entry is actually the AutoAcceptReceipt render tests; the DevTools confirm-modal tests are tracked there as T-MHP-083. Following the user's explicit routing for this run; flagged so the reviewer can reconcile.

### 2026-05-24 — T-MHP-131 — SystemPromptAddendum byte-exact + drift-guard test (qa)
- File: D:\Projects\specorator-plugin\tests\application\agent\SystemPromptAddendum.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/application/agent/SystemPromptAddendum"` (module not yet created); on-disk file-read assertion also fails because the source file does not exist.
- Satisfies: REQ-MHP-032, REQ-MHP-033; TEST-MHP-033, TEST-MHP-034.
- Asserts: `SYSTEM_PROMPT_ADDENDUM_MHP` byte-equals the REQ-MHP-032 verbatim text (constant duplicated in the test as `REQ_MHP_032_VERBATIM` — any future drift trips the test); constant is a non-empty string; re-importing the module returns the same value; source file at `src/application/agent/SystemPromptAddendum.ts` is unchanged after a settings-mutation simulation (RISK-MHP-008 drift-guard); source file embeds the verbatim string statically (proving the constant is not assembled at runtime from settings).

### 2026-05-24 — T-MHP-141 — StatusBarBadge increment/decrement + hidden-at-zero test (qa)
- File: D:\Projects\specorator-plugin\tests\plugin\StatusBarBadge.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/plugin/SpecoratorStatusBar"` (module not yet created).
- Satisfies: REQ-MHP-046; SPEC-MHP-041; TEST-MHP-049, TEST-MHP-054; EC-MHP-034, EC-MHP-035, EC-MHP-037; RISK-MHP-012.
- Asserts: badge absent at N=0; increments to 1 on first pending event with text `MCP: 1 pending`; counts N=3 correctly; auto-accept (status:'accepted') does NOT increment; decrements on `proposalDecided`; DOM element is REMOVED (not display:none) at N=0; `aria-live="polite"`; N=137 renders absolutely (no "99+" truncation); `dispose()` unsubscribes BEFORE releasing DOM and a late event after dispose neither throws nor resurrects the DOM; dispose during in-flight event does not throw.
- Judgment call: user task-routing maps T-MHP-141 → StatusBarBadge at this path. The tasks.md T-MHP-141 entry is actually the `kind` discriminator forward-compat test; the badge tests are tracked there as T-MHP-090. Following the user's explicit routing; flagged for reviewer. `Plugin.addStatusBarItem` is mocked via a tiny fake-plugin object that appends a real `HTMLDivElement` to a host container — letting us assert DOM presence/absence directly.

### 2026-05-24 — T-MHP-142 — ProposalNoticeEmitter showInfo + idempotence test (qa)
- File: D:\Projects\specorator-plugin\tests\infrastructure\notice\ProposalNoticeEmitter.test.ts
- Status: FAILING (TDD) — `Failed to resolve import "@/application/mcp/ProposalNoticeEmitter"` (module not yet created).
- Satisfies: REQ-MHP-046; SPEC-MHP-042; TEST-MHP-049; EC-MHP-034.
- Asserts: on `proposalEnqueued` (status:'pending'), `NotificationPort.showInfo` fires exactly once with the verbatim Part B §S15 copy `Pending MCP proposal from <client.id>. Review in your MCP client.`; `unknown` client.id is interpolated literally (REQ-MHP-035 fallback); status:'accepted' (auto-accept) is silent; per-proposal-id idempotence — three duplicate emissions for `p1` produce one notice; two distinct proposalIds produce two notices; no showError/showWarning/showSuccess fired for pending; `dispose()` halts subsequent emissions. Uses `ports.bridge.notices` from `fakeModulePorts()` to assert on the recorded notice log.
- Judgment call: user task-routing maps T-MHP-142 → ProposalNoticeEmitter at this path. The tasks.md T-MHP-142 entry is actually the `intent` echo test; the emitter tests are tracked there as T-MHP-100. Following the user's explicit routing; flagged for reviewer. The emitter is located in `src/application/mcp/` per SPEC-MHP-042 ("application/mcp/ProposalNoticeEmitter.ts"); the test file lives in `tests/infrastructure/notice/` because the user pinned that path — this mirrors the production location loosely; reviewer may want to relocate to `tests/application/mcp/` for the standard path-mirror convention.

---

## Deviations summary

> Any deviation from spec must be listed here, with link to ADR if material.

| Date       | Task      | Deviation                                                                                                               | Reason                                                                                          | ADR |
|------------|-----------|-------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|-----|
| 2026-05-24 | T-MHP-001 | Recorded p99 instead of p95                                                                                             | vitest `bench()` reporter does not emit p95; p99 is a strict upper bound                        | —   |
| 2026-05-24 | T-MHP-001 | B1/B2 variance exceeded ±15%                                                                                            | Sub-millisecond absolute values, 2–4 orders of magnitude under the NFR budgets                  | —   |
| 2026-05-24 | T-MHP-001 | B3 not captured at baseline time                                                                                        | `obsidian-cli` unavailable on CI / dev box; deferred to user-run in TestVault per task contract | —   |

## Quality gate

- [ ] All tasks accounted for (done, partial, blocked, or dropped).
- [ ] Implementation matches the spec; any deviation is logged with rationale (and ADR if material).
- [ ] No unrelated changes ("scope creep") in any task entry.
- [ ] Lint, type checks, unit tests green for the changed surface.
- [ ] Commits reference task IDs.
- [ ] `workflow-state.md` Stage 7 close-out complete: `implementation-log.md` is `complete` when all tasks are executed, or `in-progress` when human-owned tasks, deferred implementation tasks, or blockers remain; `## Hand-off notes` records the date, verification, remaining owner if any, and next agent.
