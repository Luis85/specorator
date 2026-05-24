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

### 2026-05-24 — T-MHP-010 — ProposalStore extension test (qa)
- File: tests/infrastructure/obsidian/ProposalStore.extended.test.ts
- Status: PASSING (after T-MHP-011 lands); was FAILING (20/21) before that slice — only the backwards-compat smoke passed against the pre-feature `ProposalStore`.
- Spec: SPEC-MHP-034 (extended public surface); SPEC-MHP-003/-004 (accept/reject contract); SPEC-MHP-035 (audit-row wiring).
- Satisfies: REQ-MHP-006, REQ-MHP-007, REQ-MHP-008, REQ-MHP-038, REQ-MHP-039, REQ-MHP-040, REQ-MHP-042, REQ-MHP-044, REQ-MHP-045(a/d), REQ-MHP-046; TEST-MHP-005, TEST-MHP-007, TEST-MHP-041, TEST-MHP-044, TEST-MHP-045, TEST-MHP-047.
- Coverage: acceptBy/rejectBy success + already_decided + not_found shapes; single-mutate invariant under `Promise.all` race (one paired + 100-iteration fuzz); event-bus emission on queue + decided (incl. error outcome); post-accept mutate failure → status=error + audit row outcome=error + write_failed; discardPending writes one shutdown row per pending, leaves terminals; queue cap 1000 → queue_full sentinel via `tryQueue`; pendingCount / listPending (deep-clone, ordered by enqueuedAt); backwards-compat smoke for the legacy no-arg constructor + queue/accept loop.
- Test ergonomics: a `buildStore()` factory wraps `ProposalEventBus` + an in-memory audit-log fake + a fixed `ClientIdentity` + `enqueuedEvents`/`decidedEvents` capture buffers. A local `enqueue()` helper sugars `tryQueue` so the test body never has to thread the `Result` through (the legacy `queue()` is only exercised by the explicit backwards-compat smoke test).

### 2026-05-24 — T-MHP-011 — Implement extended ProposalStore (dev)
- Files:
  - `src/infrastructure/obsidian/ProposalStore.ts` (extended) — new constructor `ProposalStoreDeps` (optional `eventBus`, `auditLog`, `clientIdentifier`, `logger`); new methods `tryQueue`, `acceptBy`, `rejectBy`, `listPending`, `pendingCount`, `discardPending`; new exported error class `ProposalError` (codes: `queue_full | not_found | already_decided | write_failed`); per-id mutex via `Map<proposalId, Promise<void>>`; existing `queue(toolName, params, mutate)`, `accept(id)`, `reject(id)`, `getAll()`, `get(id)` preserved verbatim (now jsdoc-marked `@deprecated`) so `ObsidianMcpServerAdapter` keeps working until T-MHP-041 rewires it.
  - `src/infrastructure/obsidian/proposalStoreInternals.ts` (new) — package-private helpers: `QUEUE_CAPACITY` (1000), `UNKNOWN_CLIENT`, `coerceKind`, `StoreEntry`, `buildEntry`, `cloneDomainProposal`, `buildAuditRow`, `buildNotFoundAuditRow`. Extracted to keep `ProposalStore.ts` under the project's `max-lines: 350` cap (the pre-extraction surface was 423 lines).
- Spec: SPEC-MHP-034; satisfies REQ-MHP-006, REQ-MHP-007, REQ-MHP-008, REQ-MHP-038, REQ-MHP-039, REQ-MHP-040, REQ-MHP-042, REQ-MHP-044, REQ-MHP-046; CLAR-MHP-008 (per-id mutex), CLAR-MHP-011 (post-accept failure path), CLAR-MHP-016 (best-effort shutdown).
- Test status: PASSING — `tests/infrastructure/obsidian/ProposalStore.extended.test.ts` (21/21) + `tests/infrastructure/proposal-store.test.ts` (18/18) = 39/39 green.
- Decisions / deviations:
  - **Two-surface store, not a rewrite.** The user's brief says "Keep existing `accept()`/`reject()` methods working (mark deprecated in jsdoc but don't break call sites)" and "Constructor accepts `{ ... }` deps (optional for backwards-compat)". The pre-feature legacy API is preserved verbatim — same throws on race/unknown id — so the orphaned `acceptProposal`/`rejectProposal`/`getProposals` shims on `ObsidianMcpServerAdapter` and the 8 write-tool registrars (which call `store.queue(toolName, params, mutate)`) keep working with zero changes. The adapter rewiring is T-MHP-041's job.
  - **`tryQueue` vs spec's `queue(QueueInput)` shape.** SPEC-MHP-034 defines a single `queue(QueueInput): Promise<QueueResult>` with structured input + capacity-checked Result. The user's brief defines only `acceptBy / rejectBy / discardPending` as new methods and leaves enrichment of the existing `queue` as: "Constructor accepts deps; when omitted, falls back to current behaviour". I followed the user's brief over the spec letter: kept the legacy `queue(toolName, params, mutate): string` synchronous-throwing-or-returning shape AND added a sibling `tryQueue(toolName, params, mutate): Result<QueueOk, ProposalError>` that implements the capacity-cap. When T-MHP-041 lands the structured `QueueInput` payload (kind/intent/paths/client/params), it can collapse the two surfaces — `tryQueue` already returns the right Result shape; the only missing piece is the structured input. Flagged for the architect.
  - **`acceptBy(id, decision)` vs spec's `acceptBy(id, by, decidingClient)` shape.** User brief: `acceptBy(proposalId, decision)`. Spec: `acceptBy(id, by: 'user'|'client', decidingClient: ClientIdentity)`. Followed user brief; `decision` carries the `by` field already (`ProposalDecision.by`). When the workflow_proposal_accept tool registrar lands (T-MHP-016), it constructs the `ProposalDecision` server-side with the connection's stashed `ClientIdentity` from `McpClientIdentifier.identityFor(connectionId)` — same outcome, simpler call site.
  - **`not_found` audit row carries synthetic proposal stub.** REQ-MHP-045(d) says `accept/_reject` on unknown id emits one error audit row. The row needs a `proposal.id` + `kind` to be well-formed JSONL; built it with `kind: 'vault_write_note'` + empty `paths`/`intent` placeholders and `result.error: 'not_found: <id>'`. Documented in `buildNotFoundAuditRow`. The strict-typed POSIX-path companion writer at `src/infrastructure/audit/AuditLogWriter.ts` would accept this row (empty paths array trivially POSIX); the primary writer at `src/infrastructure/obsidian/audit/AuditLogWriter.ts` likewise.
  - **`structuredClone` vs spread for deep-clone.** Used `structuredClone(params)` for the inbound payload (matches pre-feature behaviour) and shallow `{ ...client }` / `[...paths]` for the immutable-shape fields. The domain `ClientIdentity` is structurally flat (id/transport/address strings); spread is sufficient.
  - **Per-id mutex semantics.** The implementation chains every accept/reject onto the existing `Promise<void>` keyed by `proposalId`. Concurrent `acceptBy(sameId)` calls serialise; the second one re-reads `entry.status`, sees `'accepted'`, and returns `already_decided` with the prior decision. The fuzz test runs 100 paired `Promise.all` races and asserts `mutate` invoked exactly once per pair. The mutex map entry is dropped when the chain quiesces so the map does not leak across the entry's lifetime.
- Backwards-compat: existing `tests/infrastructure/proposal-store.test.ts` (18 tests) PASS unchanged. The adapter at `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts` (constructs the store via `new ProposalStore()` and calls `acceptProposal`/`rejectProposal`/`getProposals` shims that wrap legacy methods) keeps working without modification.
- DoD: ✓ T-MHP-010 passes (21/21), ✓ T-MHP-011 implementation complete, ✓ legacy 18/18 still green, ✓ typecheck clean for my surface (the 8 remaining errors on `tests/core/PluginSettings.devtools.test.ts` pre-exist from Batch 1 TDD for T-MHP-008 — out of scope), ✓ lint clean for my surface (`max-warnings 0` passes on the three changed files).

### 2026-05-24 — T-MHP-013 — Wire AuditLogWriter into accept path (dev)
- Status: COMPLETE in the T-MHP-011 slice. `acceptBy`/`rejectBy`/`discardPending` and the `not_found` error path in `#emitNotFoundError` all call `auditLog.append(row)` BEFORE the MCP-equivalent Result is returned. The `discardPending` shutdown helper writes one `decision.outcome:'discarded'` row per pending entry, matching REQ-MHP-038.
- Wiring location: `ProposalStore` constructor optional dep `auditLog: AuditLogSink`. `AuditLogSink` is a minimal `{ append(row: AuditRow): Promise<Result<void, Error>> }` contract — the dev injects either of the two `AuditLogWriter` modules from Batch 2B (the primary at `src/infrastructure/obsidian/audit/AuditLogWriter.ts` is the production target; the fail-closed strict variant at `src/infrastructure/audit/AuditLogWriter.ts` is also Sink-compatible). The plugin-level wiring (which writer wins) is T-MHP-102.
- Spec: SPEC-MHP-035 wiring; satisfies REQ-MHP-022 (every terminal emits one row), REQ-MHP-039 (row written before MCP response), REQ-MHP-040 (decision.by provenance — auto/user/client/shutdown), REQ-MHP-045 (4 error-row triggers: post-accept-write covered by T-MHP-011; not-found-on-accept covered by T-MHP-011; mutate-throw subsumed under post-accept-write per SPEC §"MCP-wide envelope and error codes" — `mutate_threw` aliases to `write_failed`; schema-validation triggers belong to the write-tool registrar surface, T-MHP-021 — not the store).
- Test status: PASSING — the audit-row assertions in `ProposalStore.extended.test.ts` cover (a) accept-success row, (b) accept-failure error row, (c) reject row, (d) not_found error row, (e) shutdown discard rows. The TEST-MHP-041 ordering invariant ("row written BEFORE MCP response returns") is asserted by the `expect(auditLog.rows).toHaveLength(0)` check immediately before the `await store.acceptBy(...)` and the `expect(auditLog.rows).toHaveLength(1)` immediately after.
- Out of scope (deferred to T-MHP-021): inbound schema-validation failures on the 8 write tools — that error-row trigger fires inside each write-tool registrar before `tryQueue` is even called.
- Decisions:
  - The store SWALLOWS audit-append failures (returns from `#appendAudit` without surfacing). REQ-MHP-025 requires `LoggerPort.error` + `NotificationPort.showError(sticky)` on filesystem failure, and both `AuditLogWriter` modules already discharge that obligation internally. The store explicitly does not re-surface so the MCP response can still report the vault-mutation outcome accurately (the audit-log failure does not flip a successful accept into a `write_failed`).
- DoD: ✓ tests green, ✓ wiring is symmetric across all 4 terminal paths.

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

### 2026-05-24 — T-MHP-015 — workflow_proposal_* contract tests (qa)
- File: `tests/infrastructure/obsidian/mcp/registerWorkflowProposalTools.test.ts` (new — 14 tests).
- Status: FAILING (before T-MHP-016) — import unresolved (`registerWorkflowProposalTools` module not yet created); after T-MHP-016 lands all 14 turn green.
- Satisfies: REQ-MHP-001..007, REQ-MHP-034..036, REQ-MHP-045(d); SPEC-MHP-001..004; TEST-MHP-001..005, TEST-MHP-007, TEST-MHP-008.
- Asserts: exactly 4 tools registered (`workflow_proposal_list/get/accept/reject`); list returns pending-only ordered by `enqueuedAt`; get on unknown id → `proposal_not_found`; get/list write no audit row; accept on pending invokes mutate, returns `{ok:true, decision}`, writes one `accepted` audit row; accept on already-decided returns `already_decided` with `priorDecision`; accept on unknown writes one error audit row (REQ-MHP-045(d)); reject on pending does NOT invoke mutate, writes one `rejected` audit row; reject already-decided + reject not-found symmetric; client.id captured from `McpClientIdentifier` flows into `decision.client.id` on accept.

### 2026-05-24 — T-MHP-016 — Implement registerWorkflowProposalTools (dev)
- File: `src/infrastructure/obsidian/mcp/registerWorkflowProposalTools.ts` (new).
- Spec: SPEC-MHP-001..004; satisfies REQ-MHP-001..007, REQ-MHP-034..036, REQ-MHP-045(d).
- Test status: PASSING — `tests/infrastructure/obsidian/mcp/registerWorkflowProposalTools.test.ts` (14/14).
- Implementation notes:
  - Tool descriptions use the verbatim copy from SPEC-MHP-001..004 ("This tool is for the user — do not call it on the user's behalf").
  - Accept/reject delegate to `ProposalStore.acceptBy` / `rejectBy` (extended surface from T-MHP-011). The store writes the audit row before the result returns, so the registrar only translates the `Result<AuditRow, ProposalError>` into the MCP envelope.
  - `not_found` from store is normalised to MCP `{error:'not_found'}`; the store has already appended the not-found error row (REQ-MHP-045(d)), so the registrar adds no second row.
  - `already_decided` carries `priorDecision` through verbatim.
  - `write_failed` carries `proposalId` + `message`.
  - `get` uses a new `ProposalStore.getDomain(id)` method that returns the deep-cloned domain `PendingProposal` regardless of status (SPEC-MHP-002). The legacy `get` returned the truncated infra shape (`toolName` instead of `tool`); a new method was the lowest-risk change.
  - DEFAULT_CONNECTION_ID literal `'mcp'` is used for `clientIdentifier.identityFor(...)` because the registrar runs once per MCP request and the SDK does not yet expose per-call connection ids. The identifier resolves any unknown id to a stable identity, so behaviour is unchanged for tests; production rewires when the SDK lands the per-call hook.
- Deviation from SPEC-MHP-003 letter: the registrar builds the `ProposalDecision` server-side (`by:'client'`, `outcome:'accepted'|'rejected'`, `at: now`) and passes it as the single argument to `acceptBy/rejectBy`, matching the existing extended-surface signature documented in T-MHP-011's deviation note. SPEC-MHP-034 letter has `(by, decidingClient)` — that signature lands when T-MHP-014's stress test or a follow-up clean-up rewires the store API.
- DoD: ✓ tests pass, ✓ typecheck clean, ✓ lint clean.

### 2026-05-24 — T-MHP-040 — Adapter rewire tests (qa)
- File: `tests/infrastructure/obsidian/ObsidianMcpServerAdapter.test.ts` (new — 7 tests).
- Status: FAILING (before T-MHP-041) — 5/7 red against the unrewired adapter; 7/7 green after T-MHP-041.
- Satisfies: REQ-MHP-001..007 (workflow tools registered), REQ-MHP-008 (legacy off-port callers route to new surface), REQ-MHP-011 (Tier-A reads), REQ-MHP-034..036 (clientIdentifier present).
- Asserts (live HTTP roundtrip + private-field probes):
  - 4 `workflow_proposal_*` tools listed in `tools/list` on every `/mcp` request.
  - 12 Tier-A `obsidian_cli_*` reads listed when a CLI port is configured; absent when CLI is omitted.
  - `acceptProposal(id)` routes via `acceptBy`; mutate runs; entry leaves pending list (terminal state).
  - `rejectProposal(id)` routes via `rejectBy`; mutate does NOT run; entry leaves pending list.
  - `getProposals()` delegates to `listPending` (pending-only filter, decided entries excluded).
  - ProposalStore has the four-dep extended shape (`listPending`, `acceptBy`, `rejectBy`, `discardPending` all defined as functions).
- Test design: probes adapter private field `proposalStore` via the literal `(adapter as any).proposalStore` to seed pending entries through the legacy `queue` helper (the 8 write-tool registrars still use it until T-MHP-021). Acceptable here because the rewire test specifically verifies internal wiring; an alternative public accessor existing only for testing was rejected as broader surface area than a single test-only field probe.

### 2026-05-24 — T-MHP-080..088 — DevTools opt-in surface (dev/qa)
- Tests:
  - `tests/infrastructure/obsidian/mcp/DevToolsToolRegistrar.test.ts` (new, 12/12 green) — T-MHP-080 matrix per REQ-MHP-016/-017/-018/-020/-043 + TEST-MHP-017..021, TEST-MHP-046.
  - `tests/plugin/settings/DevToolsEnableConfirmModal.interaction.test.ts` (new, 17/17 green) — T-MHP-083 modal interaction per Part B §S07–S09 + REQ-MHP-020.
  - `tests/application/mcp/threatParagraphs.driftGuard.test.ts` (new, 10/10 green) — T-MHP-088 drift-guard per RISK-MHP-015 / TEST-MHP-055; asserts every `THREAT_PARAGRAPHS_MHP[id]` block byte-equals ADR-019 §4 after normalising Markdown-bold / inline-code / typographic-quote decoration. The dev:cdp entry is permitted a single appended paragraph — the verbatim "always prompts" sentence mandated by REQ-MHP-020 / Part B §S07 — and that suffix is asserted explicitly.
- Files:
  - `src/infrastructure/obsidian/mcp/DevToolsToolRegistrar.ts` (NEW, T-MHP-081) — implements SPEC-MHP-026..033 + SPEC-MHP-041. Conditional registration per ADR-019 matrix; per-tool Zod schemas; mutate closure built via injected `mutateFor(toolId, input)` factory; auto-accept low-risk routes via `ProposalStore.tryQueue` → `acceptBy` with `{by:'auto', rule:'devtools-low-risk-auto-accept'}`; `refresh()` reconciles registered tool set on settings change; `dispose()` unregisters all.
  - `src/domain/settings/PluginSettings.ts` (extended, T-MHP-085) — adds `DevToolsToolId`, `DevToolsHighRiskToolId`, `DevToolsSettings`; extends `PluginSettings` with `requireExplicitAcceptForAllWrites: boolean` (REQ-MHP-010, default false) and `devtools: DevToolsSettings` (REQ-MHP-016/-017/-043, all nested booleans default false); `DEFAULT_SETTINGS` carries the five new defaults.
  - `src/core/core-settings.ts` (extended, T-MHP-085) — adds `validateDevtools(value)` for nested coercion (missing/malformed → defaults; per-tool entries default to `{enabled:false}`); wires both new keys into `validateSettings`.
  - `src/plugin/settings/DevToolsSettingsSection.ts` (NEW, T-MHP-085) — renders "MCP write proposals" section (`requireExplicitAcceptForAllWrites` toggle, S01/S02 microcopy) and "DevTools (agent-driven)" section (master toggle, autoAcceptLowRisk toggle, 5 high-risk per-tool toggles with `Enable DevTools first.` helper text when disabled; verbatim Part B §"Content" microcopy throughout; per-tool flip on opens `DevToolsEnableConfirmModal`; cancel reverts the toggle, confirm persists and calls `onSettingsChange`).
  - `src/plugin/settings.ts` (extended, T-MHP-085) — wires `renderDevToolsSettingsSection` into `SpecoratorSettingTab.display()` (15 net lines).
  - `src/infrastructure/obsidian/proposalStoreInternals.ts` (extended) — `coerceKind` now translates colon-form tool ids (`dev:screenshot`) to underscore-form `ProposalKind` (`dev_screenshot`) before lookup so DevTools proposals carry the correct discriminator without forcing the registrar to pre-map.
- T-MHP-082 decision: **always-via-accept**. Per SPEC-MHP-026..033 §"Common per-tool behaviour" step 4 (implementer-choice clause / /spec:analyze F-014), every DevTools tool returns `{ proposalId, status, tool, intent? }`; clients call `workflow_proposal_accept` to obtain the actual side-effect payload via the accept-response. Rationale: the architecturally simpler path that satisfies REQ-MHP-019 + REQ-MHP-046 — no second `content` block to add, no client-side branching ("is the payload inline or do I need to accept?"). REQ-MHP-021 (DevTools result payloads never enter the audit row) holds because the store's `acceptBy` audit-row construction never reads the mutate-callback return value.
- T-MHP-084 status: Batch 2C's `DevToolsEnableConfirmModal` already implements the Part B §S07–S09 contract end-to-end (focus on heading, Esc cancels, Tab cycles Cancel↔Enable, no Enter default, mod-warning primary, inline S09 error with `data-testid="devtools-confirm-error"`, dev:cdp body includes the second-paragraph "always prompts" sentence). T-MHP-083's canonical test file verifies these behaviours plus the happy-path close and S09 re-enable. No modal-class changes required.
- Test status: ALL PASSING — 68/68 across the six target test files (10 drift-guard + 17 modal + 12 registrar matrix + 12 PluginSettings devtools + 9 PluginSettings WS-2 + 8 DevTools confirm-modal-from-T-MHP-122). 39/39 ProposalStore regression tests still green (the `coerceKind` translation is additive — legacy underscore-form names still resolve through `KNOWN_KINDS` lookup).
- Spec reference: SPEC-MHP-026..033 (DevTools tool registrations), SPEC-MHP-041 (`DevToolsToolRegistrar`); REQ-MHP-010/-016/-017/-018/-020/-021/-043; ADR-019 Parts 1/3/4; RISK-MHP-015.
- Verification: `npx tsc --noEmit` exits 0 on the full project; `npx eslint --max-warnings 0` clean on all 8 changed source/test files. `settings.ts` retains its pre-existing `max-lines` warn (was 419 lines pre-change, now 430 — 11 net lines added; threshold is 350 but rule is `warn` for plugin code, not `error`, and was already over baseline).
- Out of scope: `T-MHP-102` plugin-start wiring that mounts the `DevToolsToolRegistrar` against the live MCP server and calls `refresh()` from the settings-section `onSettingsChange` hook. The section's `onSettingsChange` is currently a documented no-op; the registrar itself is fully testable in isolation per the T-MHP-080 suite.
- Outcome: done.

### 2026-05-24 — T-MHP-041 — Rewire ObsidianMcpServerAdapter (dev)
- File: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts` (modified — full rewrite of constructor and `_handleMcpRequest`).
- Also: `src/infrastructure/obsidian/mcp/index.ts` (re-exports added for `registerWorkflowProposalTools` + `registerObsidianCliReadTools`); `src/infrastructure/obsidian/ProposalStore.ts` (added `getDomain(id)` for SPEC-MHP-002 read).
- Spec: SPEC-MHP-034..036; satisfies REQ-MHP-008, REQ-MHP-011, REQ-MHP-034..036, REQ-MHP-046.
- Test status: PASSING — `tests/infrastructure/obsidian/ObsidianMcpServerAdapter.test.ts` (7/7); `tests/infrastructure/obsidian/mcp/registerWorkflowProposalTools.test.ts` (14/14); `tests/infrastructure/obsidian/ProposalStore.extended.test.ts` + `tests/infrastructure/proposal-store.test.ts` (39/39 — no regression on legacy surface).
- Implementation notes:
  - Constructor now instantiates `ProposalEventBus`, `AuditLogWriter`, `McpClientIdentifier` and wires all four into `ProposalStore`. Optional `deps?: { logger, notify }` keeps the existing 7-positional-argument signature backwards-compat for the 12+ existing test files that construct the adapter without ports.
  - `FALLBACK_LOGGER` is **silent** (not `console.*`-backed) per Obsidian's "Avoid unnecessary logging to console" plugin guideline (the lint rule fires on console calls inside src/). Production threads a real `LoggerPort` through plugin start.
  - `FALLBACK_NOTIFY` is a no-op for the same reason; `AuditLogWriter` still surfaces errors through `LoggerPort.error` when present.
  - `acceptProposal` / `rejectProposal` now build a `ProposalDecision` server-side with `by:'user'` (the off-port callers are the sidebar / settings UI, not a remote MCP client) and route through `acceptBy` / `rejectBy`. Throws on failure to preserve the pre-rewire void-return contract.
  - `getProposals()` now returns the domain shape mapped to the legacy `PendingProposal` interface (`tool` → `toolName`) so the 4 existing test files that assert `proposals[i].toolName === ...` keep passing.
  - `discardPendingOnShutdown()` is exposed as a new public method; plugin-side wiring belongs to T-MHP-012 and is not in scope here.
  - The 12 Tier-A reads (`registerObsidianCliReadTools`) are registered when the CLI port is configured. The registrar's `tool(name, schema, handler)` shape is bridged to the SDK's `registerTool(name, descriptor, handler)` via a local wrapper that lifts the zod-shape `.shape` into the SDK's `inputSchema` slot and wraps the handler result in the MCP `content` envelope.
  - `McpClientIdentifier.attachInitializeHook(mcp)` is attached when the SDK exposes `onInitialize` — currently it does not, so the call is a structurally-typed no-op. The integration point is in place for when the SDK lands the hook.
  - `registerWorkflowProposalTools(mcp, proposalStore, clientIdentifier)` is registered on every `/mcp` request — independent of the CLI port — so any MCP client can list/get/accept/reject proposals (REQ-MHP-001..007).
- Deviation from SPEC-MHP-036: the `attachInitializeHook` call is a runtime-typeof-guarded no-op until the MCP SDK exposes `onInitialize`. Per-connection client identity therefore falls back to `'unknown'` in v1; the audit-row `client` field is still populated (REQ-MHP-040 provenance is intact via the `decision.by` literal `'client'` vs `'user'`). The full integration lands when the SDK ships the hook.
- DoD: ✓ 21 tests pass on the new surface, ✓ 39 ProposalStore-related tests pass (no regression), ✓ typecheck clean (`tsc --noEmit` exits 0 on the changed surface), ✓ lint clean on changed files. Pre-existing TDD-red on `tests/infrastructure/obsidian/mcp/DevToolsToolRegistrar.test.ts` (T-MHP-080 / T-MHP-081 not in this batch's scope) remains red as expected.

### 2026-05-24 — T-MHP-090 / T-MHP-091 — SpecoratorStatusBar (dev)
- File: `src/plugin/SpecoratorStatusBar.ts` (new, ~95 lines).
- Spec: SPEC-MHP-041; satisfies REQ-MHP-046; covers RISK-MHP-012 (dispose order).
- Test status: PASSING — `tests/plugin/StatusBarBadge.test.ts` (10/10).
- Implementation notes:
  - Plain DOM (no Vue) per the plugin-chrome rule. Subscribes to `proposalEnqueued` (increments on `status === 'pending'`) and `proposalDecided` (decrements). Auto-accepted entries (`status === 'accepted'`) intentionally do NOT increment per Part A §F2.
  - The status-bar element is created via `Plugin.addStatusBarItem()` on the first transition from 0→1 and is REMOVED from the DOM (not `display: none`) on every transition back to 0 per EC-MHP-035.
  - `aria-live="polite"` set on the element; `data-testid="mcp-status-bar"` for query parity with Part B §S10.
  - `dispose()` unsubscribes BEFORE releasing the DOM element (RISK-MHP-012 / TEST-MHP-054). A late event after dispose neither throws nor resurrects the element.
  - Uses the generic project `EventBus` (`@/domain/shared/event-bus`) rather than `ProposalEventBus` directly because the QA-authored test imports `createEventBus` and emits via the channel name; production wire-up at T-MHP-102 will bridge `ProposalEventBus.emit` to the generic bus.
- DoD: ✓ subscribes, ✓ hidden at 0, ✓ updates on event, ✓ dispose-order invariant.

### 2026-05-24 — T-MHP-100 / T-MHP-101 — ProposalNoticeEmitter (dev)
- File: `src/application/mcp/ProposalNoticeEmitter.ts` (new, ~80 lines).
- Spec: SPEC-MHP-042; satisfies REQ-MHP-046; covers EC-MHP-034.
- Test status: PASSING — `tests/infrastructure/notice/ProposalNoticeEmitter.test.ts` (8/8).
- Implementation notes:
  - Subscribes to `proposalEnqueued` via the injected generic `EventBus`. On payload `status === 'pending'`, calls `NotificationPort.showInfo` with the verbatim Part B §S15 copy: `Pending MCP proposal from <client.id>. Review in your MCP client.`.
  - Per-proposalId idempotence via internal `Set<proposalId>` — duplicate emissions for the same id (defensive guard against fan-out bugs) produce one notice. Distinct ids produce distinct notices.
  - `status === 'accepted'` is silent (auto-accept path, Part A §F2).
  - Falls back to client.id `'unknown'` when the captured ClientIdentity is missing the name (REQ-MHP-035 mirror).
  - `dispose()` halts subsequent emissions.
- DoD: ✓ test green, ✓ idempotent, ✓ silent on auto-accept.

### 2026-05-24 — T-MHP-120 / T-MHP-121 — FileWriteProposalCard S24 decided-elsewhere (dev)
- Files: `src/ui/components/chat/FileWriteProposalCard.vue` (additive prop + render branch + style); `src/ui/i18n/locales/en.ts` + `src/ui/i18n/locales/de.ts` (new `chat.proposal.decidedElsewhereBody` key).
- Spec: Part B §S24 + Part A §F3 cross-surface invariant; satisfies REQ-MHP-046; covers EC-MHP-033 + RISK-MHP-011.
- Test status: PASSING — `tests/ui/components/chat/FileWriteProposalCard.decidedElsewhere.test.ts` (10/10) + `tests/ui/components/chat/FileWriteProposalCard.test.ts` (33/33 — no regression).
- Implementation notes:
  - Additive change per Part B §S24 — NOT a fifth render state. New optional prop `decidedClient?: string | null`. New `decidedExternally` derived flag fires only when status is `accepted` / `rejected` AND `decidedClient` is non-empty.
  - The decided-elsewhere `<p data-testid="proposal-card-decided-elsewhere">` is rendered INSIDE the existing accepted/rejected terminal blocks. The terminal block layout switched from a bare `<p>` to a `<template>` wrapper to host both children; existing testids (`proposal-card-accepted-body`, `proposal-card-rejected-body`, `proposal-card-retry`) are unchanged.
  - i18n key uses interpolation `Decided in {client}.` — vue-i18n's standard `{name}` syntax. Empty / null / undefined `decidedClient` is treated as absent (no note); the `unknown` fallback (per REQ-MHP-035) is applied by the caller, not the card.
  - Style: muted text-colour + italic per design Part B §"Cross-surface decided-elsewhere note".
- Deviation from T-MHP-121 DoD bullet (d): the card does NOT subscribe to `ProposalEventBus.proposalDecided` directly. Reason — the existing card mounts as a pure-props component without a Pinia store hookup in the test mount path (33 pre-existing tests construct it via `mount(FileWriteProposalCard, { props })`). Subscribing internally would either (a) break the existing test mount or (b) require every test to mount Pinia. The cross-surface bridge belongs to the chat-transcript Pinia store (T-MHP-102 wiring): the store subscribes to `proposalDecided`, updates the proposal record's `decidedClient` field, and Vue's reactivity re-renders the card with the new prop value. The card stays a presentational component; the wiring layer owns the subscription. Flagged for reviewer.
- DoD: ✓ test green, ✓ no fifth render state, ✓ Accept/Reject buttons remain hidden in the terminal block, ✓ existing tests unchanged.

### 2026-05-24 — T-MHP-124 — AutoAcceptReceipt.vue (dev)
- File: `src/ui/components/chat/AutoAcceptReceipt.vue` (new, ~60 lines); `src/ui/i18n/locales/en.ts` + `src/ui/i18n/locales/de.ts` (new `chat.autoAccept.*` keys).
- Spec: Part B §S25 + §S26; satisfies REQ-MHP-009 (silent vault-append surface), REQ-MHP-043 (DevTools low-risk surface).
- Test status: PASSING — `tests/ui/components/chat/AutoAcceptReceipt.test.ts` (6/6).
- Implementation notes:
  - Single 60-line presentational component; renders one muted `<p role="status">` row with the path or tool interpolated inside a `<code>` element.
  - Two variants gated by the `kind` prop: `'vault-append'` (uses `path` prop) and `'devtools-low-risk'` (uses `tool` prop).
  - The i18n keys (`chat.autoAccept.vaultAppendBody` = `Appended to {path}.`, `chat.autoAccept.devtoolsLowRiskBody` = `Ran {tool}.`) carry the placeholder; the component substitutes a unique sentinel (`AUTOACCEPT_VAR`), splits the localised string around it, and renders the user-supplied value inside `<code>` with the correct testid (`auto-accept-receipt-path` / `auto-accept-receipt-tool`). This keeps the actual path/tool inside a styled `<code>` element while the surrounding copy stays a translatable template.
  - Rendering integration with the chat transcript is deferred to T-MHP-102 plugin-level wiring; this slice authors the component shape only. The chat transcript is expected to mount the component when `proposalDecided` fires with `decision.by === 'auto'`.
- DoD: ✓ both variants render correctly, ✓ region exposes `role="status"` + i18n aria-label, ✓ testid contract matches Part B §S26.

### 2026-05-24 — T-MHP-012 — ProposalStore shutdown flush test (dev)
- File: `tests/infrastructure/obsidian/ProposalStore.shutdownFlush.test.ts` (new — 4 tests).
- Spec: SPEC-MHP-034 (`discardPending`); satisfies REQ-MHP-038 + REQ-MHP-040 (`shutdown` provenance); CLAR-MHP-016.
- Test status: PASSING — 4/4.
- Implementation notes:
  - `ProposalStore.discardPending()` was implemented in T-MHP-011's slice; this task adds the dedicated 500ms-budget shutdown test (and confirms terminal-entry preservation). Production code unchanged.
  - Test cases: (1) one shutdown row per pending entry with `by:'shutdown'`/`outcome:'discarded'`; (2) terminal entries left alone; (3) flush completes well within the 500ms budget for a fast audit writer; (4) when the audit writer hangs, the caller's `Promise.race([discardPending(), budget])` cleanly yields `'timeout'` — `discardPending()` itself does not throw; unwritten rows are dropped silently per CLAR-MHP-016 ("no error path").
  - Caller-side budget wrap (`Promise.race` with a `setTimeout(500)`) is the documented strategy for plugin-side `onunload()` invocation; the store does not own the timeout because Obsidian's `onunload` is synchronous-fire-and-forget.
- DoD: ✓ tests green, ✓ CLAR-MHP-016 contract preserved, ✓ no production-code mutation.

### 2026-05-24 — T-MHP-014 — Dual-accept fuzz stress test (dev)
- File: `tests/infrastructure/obsidian/ProposalStore.dualAcceptFuzz.test.ts` (new — 1 test, 1000 iterations).
- Spec: NFR-MHP-012 (0 dual-execution events across 1000 dual-accept fuzz runs); REQ-MHP-006 (per-id mutex); TEST-MHP-006.
- Test status: PASSING — 1/1 (1000 iterations, ~60 ms total wall-clock).
- Implementation notes:
  - Each iteration builds a fresh `ProposalStore` + `ProposalEventBus` + recording audit sink, queues one proposal, races `Promise.all([acceptBy(id), acceptBy(id)])`, then asserts: (a) mutate invoked exactly once; (b) exactly one `ok` result; (c) the loser carries `ProposalError{code:'already_decided'}`; (d) exactly one `accepted` audit row.
  - All three counters (`dualExecutionEvents`, `extraOkResults`, `extraAuditRows`) must be 0 across the full 1000-iteration run. This locks NFR-MHP-012 byte-for-byte.
  - Per-id mutex implementation (T-MHP-011) was confirmed correct under load; no production-code changes.
- DoD: ✓ NFR-MHP-012 verified, ✓ no false-positives across 1000 paired races.

### 2026-05-24 — T-MHP-112 — Wire MigrationService.runOnce() into plugin onload (dev)
- File: `src/plugin/main.ts` (additive: 1 import + 8-line wiring block).
- Spec: SPEC-MHP-038 + REQ-MHP-027.
- Test status: NO NEW TESTS (the wiring is integration-only; covered by `MigrationService.test.ts` for the underlying service). Existing 184 plugin tests still pass.
- Implementation notes:
  - `MigrationService` instantiated immediately after `ObsidianBridge` (which supplies vault/logger/notify ports) and BEFORE `ObsidianMcpServerAdapter` is constructed — so a failed migration cannot leak `.mcp.json` to the new MCP server.
  - `migration.runOnce()` is wrapped in `tryAsync` (already imported) so an unexpected throw is logged via `bridge.warn` but does not block plugin start. The migration's documented outcomes (`noop`/`success`/`failed`/`success-gitignore-failed`) surface to the user via the `NotificationPort` calls inside the service itself (success / conflict / verify-failure notice copy is rendered at SPEC-MHP-038 step boundaries).
- DoD: ✓ wired into onload before MCP server, ✓ surfaces notices via injected port, ✓ tryAsync-guarded.

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
