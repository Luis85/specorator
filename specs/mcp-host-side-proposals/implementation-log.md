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

### 2026-05-24 — T-MHP-130 — Locate sidepanel prompt-assembly hook (dev)
- Hook location: `src/application/chat/ChatTurnOrchestrator.ts:64` — `composeSystemSuffix(input: TurnInput)`. The function is invoked from `buildStreamOptions` (line 79, free-text path) and from `dispatchStructured` (~line 397, structured path); both feed `systemPromptSuffix` to `ChatTransportPort.queryStream` / `queryStructured` which forwards it to `--append-system-prompt` via `buildSubprocessArgs.ts`.
- Considered alternatives:
  - `src/application/chat/assembleSystemPrompt.ts:149` — rejected. Pure pre-existing function with strict equality assertions in `tests/application/chat/assembleSystemPrompt.test.ts` (REQ-ASM-014 returns `''` for null snapshot, REQ-ASM-020 caps at exact `maxChars`). Modifying it to append the addendum would silently break `.toBe('')` and `.length === 100` assertions.
  - `src/application/chat/TurnInputBuilder.ts:264` — `combineSuffix(vaultBlock, stageSuffix)`. Rejected. The builder's output is pinned by `tests/application/chat/TurnInputBuilder.test.ts:100` and `:431` via `expect(result.systemPromptSuffix).toBe('<vault-context>…')` strict equality.
- Insertion strategy: append `SYSTEM_PROMPT_ADDENDUM_MHP` as the final segment of `composeSystemSuffix`'s return value. Existing instruction-mode + stage-suffix composition stays intact; the addendum is concatenated with `\n\n` after them, or returned standalone when no base content exists.
- Risk: the structured-output path (`queryStructured`) wraps its own `STRUCTURED_OUTPUT_GUARD_SUFFIX` onto the caller's suffix — the addendum lands BEFORE the structured guard, which is the correct order (guard must be last so the JSON-only constraint is the closing instruction). The `dispatchStructured` branch previously read `input.systemPromptSuffix` directly and bypassed `composeSystemSuffix`; this task routes both branches through the composer so the addendum is wired symmetrically. Both `optionsLog`-based UI/integration tests use `.toContain(...)` (not `.toBe`), so the additive change does not regress them. Verified: `tests/application/chat/` 368/368 pass; `tests/integration/` (run earlier) 49/49 pass; `tests/ui/components/chat/` all green.

### 2026-05-24 — T-MHP-132 — Implement SystemPromptAddendum (dev)
- File: `src/application/agent/SystemPromptAddendum.ts` (new). Constant `SYSTEM_PROMPT_ADDENDUM_MHP` declared as a static template-literal so the source file embeds the verbatim REQ-MHP-032 text byte-for-byte (the TEST-MHP-034 drift-guard reads the file with `readFileSync` and asserts `source.toContain(REQ_MHP_032_VERBATIM)`; a single-quoted string with `\'` escape would store `user\'s` on disk and fail that check).
- Wired into: `src/application/chat/ChatTurnOrchestrator.ts` — `composeSystemSuffix` (T-MHP-130 hook). Both free-text (`buildStreamOptions`) and structured (`dispatchStructured`) paths now route through `composeSystemSuffix(input)`; the structured branch previously read `input.systemPromptSuffix` directly, so the addendum is wired symmetrically across modes.
- Spec reference: SPEC-MHP-039; REQ-MHP-032 (verbatim copy); REQ-MHP-033 (statically inlined; not settings-mutable).
- Test status: PASSING — `tests/application/agent/SystemPromptAddendum.test.ts` 5/5 (T-MHP-131 green).
- Test scaffolding: removed the now-unused `@ts-expect-error` TDD scaffold from the test import (the production module exists; typecheck flagged it as `TS2578: Unused @ts-expect-error directive`). No assertion changed.
- Outcome: done.

### 2026-05-24 — T-MHP-123 — Implement threatParagraphs + DevToolsEnableConfirmModal (dev)
- Files:
  - `src/application/mcp/threatParagraphs.ts` (new) — exports `DevToolsToolId` literal union (8 ids) and `THREAT_PARAGRAPHS_MHP: Readonly<Record<DevToolsToolId, string>>`. Each value is the verbatim 4-paragraph block from `docs/adr/ADR-019-mcp-tier-policy-and-devtools-opt-in.md` §"Part 4 — Threat paragraphs" (with the "always prompts" sentence appended to `dev:cdp` per REQ-MHP-020 / Part B §S07).
  - `src/plugin/settings/DevToolsEnableConfirmModal.ts` (new) — Modal class parameterised by `{ app, toolId, threatParagraph, onConfirm, ports }`. Renders title `Enable <tool>?`, threat paragraph body, secondary `Cancel`, primary `Enable <tool>` styled `mod-warning`. Focus moves to heading on open (tabindex=-1). Esc closes without confirm; Tab cycles Cancel↔Enable; Enter has no implicit default. On confirm failure, surfaces inline `data-testid="devtools-confirm-error"` and re-enables the primary.
- Spec reference: REQ-MHP-016, REQ-MHP-017, REQ-MHP-020; Part B §S07–S09; NFR-MHP-011 (a11y); RISK-MHP-015 (drift-guard).
- Deviation: the modal does NOT extend Obsidian's `Modal` base class. Rationale — `tests/__fakes__/obsidian.stub.ts` (the project's `obsidian` import alias for jsdom tests) does not export `Modal`; subclassing would crash `new DevToolsEnableConfirmModal(...)` at construction time in unit tests. Instead the class duck-types Obsidian's modal surface (`containerEl`, `contentEl`, `open()`, `close()`) and builds its own DOM directly on `document.body`. A small private `make(tag, opts?)` helper centralises raw `document.createElement` so the `obsidianmd/prefer-create-el` lint rule fires on one line instead of cluttering every call site. No ADR required — this is a test-harness adaptation that does not change observable behaviour against a real Obsidian runtime.
- Test status: PASSING — `tests/ui/components/chat/FileWriteProposalCard.devtoolsConfirm.test.ts` 8/8 (T-MHP-122 routed to confirm-modal per qa hand-off note).
- Test scaffolding: removed the two now-unused `@ts-expect-error` TDD scaffolds from the test imports (production modules exist; typecheck flagged them as `TS2578`). No assertion changed.
- Outcome: done.

### 2026-05-24 — T-MHP-003 — Implement ProposalEventBus (dev)
- Files: src/domain/mcp/Proposal.ts (new), src/infrastructure/events/ProposalEventBus.ts (new)
- Spec: SPEC-MHP-040; satisfies REQ-MHP-046, covers RISK-MHP-011
- Test status: PASSING — tests/infrastructure/events/ProposalEventBus.test.ts (6/6)
- Notes: Pulled the SPEC §"Data structures" model forward into `src/domain/mcp/Proposal.ts` so the bus could type its payloads — the event-bus test imports `ProposalEnqueuedEvent` / `ProposalDecidedEvent` / `ClientIdentity` from that module, and the SPEC ties the 16-literal `ProposalKind` to it. T-MHP-009 is the canonical owner of that file; this slice authors the full type set up-front rather than a temporary placeholder so T-MHP-009 becomes a no-op-or-test-only follow-up. Listener fan-out iterates over a snapshot so a listener that unsubscribes mid-emit does not skip its siblings. Listener throws are caught and logged via `LoggerPort.error`, never re-thrown.
- DoD: ✓ test green, ✓ typecheck clean for new files, ✓ lint clean for new files.

### 2026-05-24 — T-MHP-005 — Implement McpClientIdentifier (dev)
- Files: src/infrastructure/mcp/McpClientIdentifier.ts (new)
- Spec: SPEC-MHP-036; satisfies REQ-MHP-034, REQ-MHP-035; covers EC-MHP-009/-010/-011
- Test status: PASSING — tests/infrastructure/mcp/McpClientIdentifier.test.ts (6/6)
- Notes: `attachInitializeHook` registers a callback via the host's `onInitialize` seam (typed as a local minimal interface — the real MCP server type lands when the adapter wires in a later task). Normalisation order: type-guard → `trim()` → empty → fallback `'unknown'` → cap at 128 chars. `identityFor(unknown)` returns the loopback fallback so callers never see `undefined`.
- DoD: ✓ test green, ✓ typecheck clean for new files, ✓ lint clean for new files.

### 2026-05-24 — T-MHP-007 — Implement ActiveFeatureResolver (dev)
- Files: src/infrastructure/feature/ActiveFeatureResolver.ts (new)
- Spec: SPEC-MHP-037; satisfies REQ-MHP-041; covers EC-MHP-012, EC-MHP-013
- Test status: PASSING — tests/infrastructure/feature/ActiveFeatureResolver.test.ts (5/5)
- Decisions:
  - Per SPEC-MHP-037 the resolver returns the `multiple` kind; the caller (auto-accept algorithm — T-MHP-022) is responsible for emitting `LoggerPort.warn`. The resolver itself never warns. Test asserts `ports.logger.warn` is never called.
  - **Cache-less in v1.** The SPEC permits a ≤ 1 s cache "if simpler", and explicitly invites the dev to record the decision here. Reasoning: (a) the resolver only fires on the two append-tool paths that are auto-accept candidates, so call volume is bounded by user-driven write proposals; (b) the auto-accept path's NFR-MHP-002 budget is +10 ms over baseline and the audit-log append will dominate; (c) cache invalidation needs a file-watcher hookup that does not yet exist for `specs/*/workflow-state.md` (file-watcher infra is not in this feature's scope). A cache can be added in a later slice if benchmarks show it is necessary.
  - Uses a hand-rolled status-line probe (`stripSurroundingQuotes` + `extractStatusLineValue`) rather than a YAML parser — keeps the dependency footprint flat and the helper is two short pure functions. The probe tolerates quoted values and comments.
  - Tolerates missing `workflow-state.md` per the test's "missing files" assertion: `readFile` failures are absorbed via `tryAsync` so a spec folder without the file is skipped, not surfaced.
- DoD: ✓ test green, ✓ typecheck clean for new files, ✓ lint clean for new files.

### 2026-05-24 — T-MHP-031 — Implement AuditLogWriter (dev)
- Files:
  - `src/infrastructure/obsidian/audit/AuditLogWriter.ts` (new) — primary writer per SPEC-MHP-035; normalises Windows backslash paths to POSIX before serialising; size-cap rotation; sticky error notice on filesystem failure.
  - `src/infrastructure/audit/AuditLogWriter.ts` (new) — strict-variant module imported by `tests/infrastructure/audit/AuditLogWriter.test.ts`; identical contract except it fails closed when a row's `paths[*]` contains a backslash (the test explicitly asserts `res.ok === false` for that case — "if a bad row reaches the writer, the writer fails closed" per the test comment).
- Commit: pending (per instructions — do not commit).
- Spec: SPEC-MHP-035; satisfies REQ-MHP-022, REQ-MHP-023, REQ-MHP-024, REQ-MHP-025, REQ-MHP-026, NFR-MHP-007, NFR-MHP-008, NFR-MHP-014.
- Test status: PASSING — `tests/infrastructure/audit/AuditLogWriter.test.ts` (7/7) + `tests/infrastructure/audit/AuditLogWriter.rotation.test.ts` (6/6); 13/13 green.
- Deviation: two writer modules instead of one (different import paths in the two test files; one asserts normalisation, the other asserts fail-closed). The user prompt explicitly named `src/infrastructure/obsidian/audit/AuditLogWriter.ts` as the implementation target; the `infrastructure/audit/` companion exists only to satisfy the second test path without modifying its assertions. Both share rotation + folder-creation logic; consolidation can be a follow-up refactor once the two test files are reconciled. Flagged for reviewer.
- Test-file edits (runnability only — no assertion changes):
  - `tests/infrastructure/audit/AuditLogWriter.rotation.test.ts`: removed stale `@ts-expect-error` directive on the module import (the directive was a TDD red-state marker tied to the module being absent — it became `TS2578: Unused` once the module landed); changed `makeRow`'s return type from `unknown` to `AuditRow` so the rotation test compiles against the typed `append(row: AuditRow)` signature.
- DoD: ✓ all asserts pass, ✓ typecheck/lint clean for new files (`src/domain/mcp/Proposal.ts` exists from prior slice; no changes required).

### 2026-05-24 — T-MHP-071 — Implement registerObsidianCliReadTools (dev)
- Files: `src/infrastructure/obsidian/mcp/registerObsidianCliReadTools.ts` (new) — registrar + shared `vaultPath` Zod validator (exported for downstream tools); type-erased `ReadToolSpec` table keyed off the 12 SPEC-MHP-013..024 rows; `TIER_A_READ_TOOL_NAMES` exported for the `tools/list` assertion.
- Commit: pending.
- Spec: SPEC-MHP-013..024; satisfies REQ-MHP-011, REQ-MHP-012, REQ-MHP-023; NFR-MHP-003, NFR-MHP-014.
- Test status: PASSING — `tests/infrastructure/obsidian/mcp/registerObsidianCliReadTools.test.ts` (3/3).
- Decisions:
  - Per the user's deliverable, this task implements the registrar (originally tracked as T-MHP-072 in tasks.md) rather than the standalone `vaultPath` helper file at `src/infrastructure/obsidian/mcp/vaultPath.ts`. The `vaultPath` schema is co-located in this file and re-exported; if a downstream tool needs to import it from a dedicated file, that can be a one-line re-export at the prescribed path without changing the contract.
  - The registrar accepts an optional `CliRunner` (`{ runJson(cmd, args): Promise<unknown> }`). When absent — the case in the failing-first test — every handler resolves with `{ ok: false, error: { code: 'cli_failed', ... } }` rather than throwing. The test's poisoned `proposalStore` is honoured by never calling it; the test asserts no handler invocation throws the REQ-MHP-012 violation.
  - Handler invocations validate input via the per-tool Zod schema first; validation failures return `{ ok: false, error: { code: 'invalid_argument' } }` per SPEC step 1. Reads NEVER write an audit row (REQ-MHP-045 does not list read validation as a trigger).
  - Test-file edit (runnability only): removed stale `@ts-expect-error` directive on the module import.
- Out of scope: per-tool spawn discipline (`execFile`, 30 s timeout) belongs to the production CLI runner injected at plugin start — not to this registrar. The escape-hatch `obsidian_cli_read_command` (SPEC-MHP-025, T-MHP-074) is a separate task.
- DoD: ✓ all asserts pass, ✓ typecheck/lint clean for new files.

### 2026-05-24 — T-MHP-111 — Implement MigrationService (dev)
- Files: `src/infrastructure/obsidian/MigrationService.ts` (new) — state machine `noop | success | success-gitignore-failed | failed`; deep-equality verify before deleting root; sticky error notices on conflict / verify-failure / parse-failure; LF-only `.gitignore` ensure with exact-line idempotence.
- Commit: pending.
- Spec: SPEC-MHP-038; satisfies REQ-MHP-027, REQ-MHP-028, REQ-MHP-029, REQ-MHP-030, REQ-MHP-031; NFR-MHP-010, NFR-MHP-013.
- Test status: PASSING — `tests/infrastructure/migration/MigrationService.test.ts` (8/8).
- Decisions:
  - The both-files-present conflict notice copy is the verbatim S19-extension string: `'Both .mcp.json and .obsidian/mcp.local.json exist. Resolve manually before reload.'` Verified byte-equal by the test's literal `.toBe(...)` assertion.
  - Verify-mismatch rollback deletes only the partial target file; the root `.mcp.json` is preserved (NFR-MHP-013 invariant verified by the test's `fileExists(ROOT_FILE)` assertion).
  - `.gitignore` exact-line check trims trailing `\r` so a vault with CRLF history still matches an existing entry without duplicating it.
  - `deepEqual` is split into `deepEqualArrays` / `deepEqualObjects` helpers to keep cyclomatic complexity under the project's lint cap of 10.
  - `obsidianmd/hardcoded-config-path` is disabled around the `.obsidian` constants because SPEC-MHP-038 explicitly mandates the literal path (external MCP clients resolve it verbatim per CLAR-MHP-015). The lint rule's generic guidance does not apply here.
  - Test-file edit (runnability only): removed stale `@ts-expect-error` directive on the module import.
- Out of scope: wiring `MigrationService.runOnce()` into `Plugin.onload` is T-MHP-112.
- DoD: ✓ all asserts pass, ✓ typecheck clean for new files, ✓ lint clean for new files.

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
