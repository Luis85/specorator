---
id: REVIEW-AS-001
title: Stage-9 review — Approvals & Security (Claudian Reboot P7)
stage: review
feature: approvals-security
status: complete
owner: reviewer
verdict: approve-with-conditions
epic: claudian-reboot
phase: P7
area: AS
integration_branch: next
base_sha: 4f645a40
head_sha: a73d5995
created: 2026-05-26
updated: 2026-05-26
---

# Review — Approvals & Security (P7)

**Verdict: Approved with conditions (changes-requested on one defect).**

The P7 approval engine is genuinely live, the security-correctness core is exact and
well-tested, the additivity invariant holds, and the device-local persistence story is
correct. **One user-visible defect blocks a clean approve: the English default locale is
missing the `permission.mode.{normal,plan,yolo}` labels** that the live toggle renders, so
the headline P7 control shows raw i18n key strings in the default UI. Fix R-AS-001, then
the branch is clear to merge to `next` (subject to the parent's full `verify`/`test:all`
run and the recorded manual legs).

## Diff scope

`git diff next..HEAD` — 39 source files (+ specs/ADRs/tests), `next` @ `4f645a40`
unchanged, so this is the entire P7 feature. 41 commits, strict TDD RED→green ordering.

## Finding counts by severity

| Severity | Count | IDs |
|---|---|---|
| critical | 0 | — |
| high | 1 | R-AS-001 |
| medium | 1 | R-AS-002 (CLAR-AS-006 ruling) |
| low | 3 | R-AS-003, R-AS-004, R-AS-005 |

No P1/P2 (critical) findings. **One P3-equivalent high (R-AS-001) must be fixed before
merge.** R-AS-002 is the CLAR-AS-006 ruling (acceptable deferral, tracked). The lows are
scheduled, not blocking.

---

## Findings

### R-AS-001 — `high` — EN default locale missing the live permission-mode labels

- **Category:** i18n / parity regression (NFR-AS-015, REQ-AS-001/051).
- **Location:** `src/ui/i18n/locales/en.ts` (the `agent.chat.toolbar.permission` block,
  lines 101-105) vs the consumer `src/ui/chat/toolbar/PermissionToggle.vue:49`
  (`t(\`agent.chat.toolbar.permission.mode.${mode}\`)`) and `:53` (the accessible name).
- **Evidence:** resolved both locale bundles —
  - `en.agent.chat.toolbar.permission` keys = `['label','plan','deferred']` → **`mode` is
    absent.**
  - `de.agent.chat.toolbar.permission.mode` = `{ normal:'Normal', plan:'Plan',
    yolo:'Automatisch erlauben' }` → present.
  English is the fallback/default locale (`main.ts` / `AgentSidebarView` seed via
  `toSupportedLocale`). With the key missing, vue-i18n renders the literal key string. So in
  the default English UI the live three-mode toggle shows
  `agent.chat.toolbar.permission.mode.normal` / `.plan` / `.yolo` as the visible option text,
  and the PLAN-label / control accessible name carries the same raw string — directly
  undercutting REQ-AS-001 ("render the three Claudian permission modes") and REQ-AS-051
  (accessible-name quality). The German locale, ironically, is correct.
- **Why the test net missed it:** `tests/ui/chat/toolbar/PermissionToggle.live.test.ts`
  asserts option **presence** by `data-mode` (`optionFor`) and selection by `aria-selected`
  (`selectedMode`), plus `ariaLabel().length > 0` — never the visible **text**. The raw key
  string satisfies `length > 0`, so the assertion passes despite the broken label. The DE
  asymmetry suggests the EN keys were dropped (or never added) when the DE batch landed.
- **Recommendation:** add `mode: { normal, plan, yolo }` under
  `agent.chat.toolbar.permission` in `en.ts` (mirroring `de.ts`); strengthen one live-toggle
  test to assert the rendered option text equals the resolved label (so the gap can't
  re-open). Verify the other 8 locales for the same omission before the epic i18n pass (P11).
- **Owner:** dev (en.ts) + qa (the text assertion). UI component code is correct — no change
  there.

### R-AS-002 — `medium` — CLAR-AS-006: `req.context`-based action derivation is an acceptable deferral (P3)

- **Category:** correctness / spec-consistency (CLAR-AS-006, SPEC-AS-003 vs SPEC-AS-016).
- **Location:** `src/ui/chat/composer/ApprovalGateRuntime.ts:157-159` (`deriveAction` reads
  `req.context` as the action pattern), vs the brief's ask to thread
  `getActionPattern(tool, input)`.
- **Ruling: P3 — acceptable deferral, NOT a P1/P2 correctness gap.** Two facts make the
  current behaviour safe and the structured-pattern follow-up genuinely deferrable:
  1. **The live Claude path never fires the approval callback today.** The CLI reducer
     (`reduceClaudeStream.ts`) emits only `exit_plan_mode` (:551) and `ask_user_question`
     (:556) — **it never emits an `approval_request` chunk.** The `approval_request` branch in
     `ClaudeCliChatRuntime._routeInlineRequest` (:187-194) is dead on the one-shot
     `claude --print` transport, which honestly reports `supportsInlineResponse:false`. The
     entire engine is forward-compatible plumbing for a future interactive transport. So the
     derivation choice does not "leave rule-matching broken on the live path" — there is no
     live approval path yet to break, by design.
  2. **For runtimes that put the raw command/path/glob in `context`, `req.context`-based
     matching works** — Bash `"git status"` matches a `"git *"` rule (green TEST-AS-020).
     The risk is only that a future interactive runtime might place a *human-readable
     description* (e.g. `"Run command: git status"`) in `context` rather than the raw pattern,
     in which case matching would silently degrade to **prompt** (fail-safe — never a silent
     auto-allow). That is the safe failure direction.
  3. The Dev correctly refused to force it: widening `ApprovalRequest` with `input?`/
     `actionPattern?` breaks the frozen QA keyset assertion in
     `tests/domain/chat/inline/Approval.test.ts` (SPEC-AS-003 byte-identical-to-P4). Per
     Article I.3, the spec must change first. SPEC-AS-016 is internally inconsistent (it cites
     `getActionPattern(req.tool, …)` while the request carries no `input`).
- **Recommendation:** carry CLAR-AS-006 to the architect for the future interactive-transport
  phase (P8/P9). Resolution is either (a) amend SPEC-AS-003 to permit an additive optional
  `input?`/`actionPattern?` on `ApprovalRequest` (+ QA updates the keyset test), or (b) a
  side-channel keyed by `requestId`. **Not a merge blocker for P7** because there is no live
  approval path and the failure direction is fail-safe. Recommend the runtime that first emits
  a live `approval_request` is required to place the raw `getActionPattern` value in `context`
  (or carry structured input) as part of its phase.
- **Owner:** architect (spec amendment, future phase).

### R-AS-003 — `low` — en.ts `approvals` block indentation is irregular

- **Category:** style/maintainability.
- **Location:** `src/ui/i18n/locales/en.ts:133-148` — the `approvals` block is indented one
  level shallower than its sibling `toolbar`/`mode` blocks. Structurally valid (resolves
  correctly under `agent.chat.approvals`, confirmed by resolving the bundle) and Prettier will
  normalise it, but it reads as a near-miss and likely shares the same origin as R-AS-001 (a
  hand-edited locale block).
- **Recommendation:** run `npm run format` on `en.ts` when fixing R-AS-001.
- **Owner:** dev.

### R-AS-004 — `low` — `toolbar.permission.deferred` string retained though the live seam removes it

- **Category:** dead-string risk (acknowledged deviation #2 in implementation-log).
- **Location:** `en.ts:104` / `PermissionToggle.vue:106`. The `deferred` notice is still
  reachable via the no-live-mode P6 seam (`onDeferredActivate`), which only renders when no
  `mode` prop is supplied. In production `ChatSurface` always supplies a live mode
  (`activePermissionMode`), so the seam path is dead there — but the standalone P6 toolbar
  tests still exercise it. AGENTS.md §8 forbids dead-code "for back-compat", but this is a
  documented transitional seam, not back-compat scaffolding.
- **Recommendation:** schedule removal of the `deferred` seam + string once no caller mounts
  `PermissionToggle` without a `mode` (a P10/P11 cleanup). Track it; not urgent.
- **Owner:** dev (later phase).

### R-AS-005 — `low` — session-rule `id` and persisted `id` use different mint schemes

- **Category:** minor consistency.
- **Location:** `ApprovalManager.ts:176` (`session-rule-${seq}`) vs
  `ObsidianApprovalRuleStore.ts:44` / `LocalStorageApprovalRuleStore.ts:33`
  (`crypto.randomUUID()`) vs `MockApprovalRuleStore.ts:59` (`mock-rule-${seq}`). No collision
  risk (session ids carry the `session-` prefix; removal only targets persisted ids and the
  panel hides the remove button for session rows). Cosmetic only.
- **Recommendation:** none required; noted for awareness.
- **Owner:** —

---

## Security-correctness confirmation (the load-bearing P7 concern)

Verified by reading the code and running `ApprovalMatcher.test.ts` + `ApprovalManager.test.ts`
(54 passing) and the full P7 subset (84 passing):

- **Fail-safe-to-prompt — CONFIRMED.** `ApprovalManager.decide` (`:73-84`) wraps
  `store.loadRules()` in `tryAsync`; on any load error it logs (no rule content), shows the
  non-blocking `storeError` notice, and returns `ok('prompt')`. It **never** auto-allows on a
  store fault. TEST-AS-054 asserts exactly this, plus "logs no rule content" and "never throws
  across the boundary". The `Result.err` path in `ApprovalRuleStorePort` is the only failure
  channel — no throw crosses the approval callback. (NFR-AS-004/009.)
- **Deny-wins — CONFIRMED.** `decide` (`:89-96`) returns `ok('deny')` on the first matching
  deny **before** committing to any allow; a matching allow only wins if no deny matched. Tests
  cover persisted-allow+persisted-deny and persisted-allow+session-deny. (REQ-AS-021/023.)
- **Mode gate — CONFIRMED.** `yolo` returns `ok('allow')` with no rule lookup; `plan` returns
  `ok('prompt')` (defers to the P4 exit-plan gate); `normal`/absent loads+matches; absent mode
  ≡ `normal`. Mode is evaluated **first** (CLAR-AS-004). (REQ-AS-004/005/024.)
- **Matcher safety — CONFIRMED** (verbatim parity with claudian-main
  `core/security/ApprovalManager.ts`): bash `"git *"` ↛ `"github"` (explicit-wildcard +
  `matchesBashPrefix` requires a `' '`/exact boundary); a **bare bash prefix without a
  wildcard never matches** (`:122-123` returns `false`); file `/a/b` ↛ `/a/bc.md` but ⊃
  `/a/b/c.md` (`isPathPrefixMatch` segment boundary); null-action + content rule ↛ match
  (`:97-98`). The only deviation from claudian's `if (!rulePattern)` is the explicit
  `=== undefined || === ''` guard — functionally identical for `string | undefined`.
- **Device-local, never vault/data.json — CONFIRMED (code-strong; manual M1 pending).**
  `ObsidianApprovalRuleStore` uses only `app.loadLocalStorage`/`saveLocalStorage` under
  `'specorator:approval-rules'` (`:30,70,83`) — no `VaultPort`, no `data.json`, no
  `SettingsPort`. Specorator deliberately diverges from claudian's `.claude/settings.json`
  `projectSettings` destination (CHARTER-REQ-SET). Rules are inert DTOs (readonly scalars,
  `ApprovalRule.ts:10-28`); the `{`-leading `JSON.stringify` fallback pattern is dropped to
  match-all so no serialised input lands in a rule (`ApprovalManager.ts:161-165`, NFR-AS-002).
  The real device-local round-trip + the "data.json/vault untouched" assertion is the
  coverage-excluded **manual leg TEST-AS-M1** — recorded pending, not marked green.

## Live-wiring + provide confirmation (the P5 lesson)

- **`ApprovalManager.decide` is on the real approval path — CONFIRMED.** `ChatSurface` builds
  one per-surface `ApprovalManager` (`:203-210`) and wraps the active runtime in
  `ApprovalGateRuntime` (`:286-296`), which is the **inner-most** decorator
  (`EnqueueRuntime` wraps the gate, `:297-299`). `setApprovalCallback` routes through
  `gateApproval` → `manager.decide` (`ApprovalGateRuntime.ts:128-138`). An `allow`/`deny`
  resolves silently (no block renders); `prompt` delegates to the enqueue path then routes the
  user answer through `applyDecision`.
- **`*-always` → `applyDecision` → `store.addRule` — CONFIRMED.** `applyDecision`
  (`ApprovalManager.ts:127-145`) persists a `lifetime:'persisted'` rule via
  `store.addRule`; `allow`/`deny` go to in-memory session rules; cancel persists nothing.
- **Port provided in BOTH entry points — CONFIRMED.** `AgentSidebarView.ts:169`
  (`bridge.approvalRuleStore`) and `src/ui/main.ts:116` (MockBridge). Both import
  `APPROVAL_RULE_STORE_PORT`.
- **Panel mounts — CONFIRMED.** `ChatSurface.vue:625-630` mounts `ApprovalsPanel`
  `v-if="hasApprovals"` (manager present), wired `:mode` / `:rules` / `@remove`.
- **Optional-inject degrade = byte-identical P4 always-prompt — CONFIRMED.**
  `approvalStore = inject(APPROVAL_RULE_STORE_PORT, undefined)` (`:193`); when absent,
  `approvalManager = null` → no `ApprovalGateRuntime` (`gated = runtime`, `:286-296`), no panel
  mounts, and `decide` is never consulted. The chain is the byte-identical P4 path. The
  `foldControlOptions` `permissionMode` clause (`:46-48`) writes nothing for `normal`/absent,
  so a no-rule + normal turn serialises exactly as on `next`. (REQ-AS-052 / NFR-AS-001.)

## CLAR-AS-006 ruling

**P3 — acceptable deferral.** The live Claude transport emits no `approval_request` chunk
today (reducer evidence above), so the `req.context`-based derivation cannot break a live
path that does not exist; for raw-pattern `context` it matches correctly; and the only
degradation direction (a description-shaped `context`) is fail-safe-to-prompt. Forcing the
structured `getActionPattern(tool, input)` would require breaking the frozen `ApprovalRequest`
keyset (SPEC-AS-003 + its QA test), which Article I.3 forbids without a spec amendment first.
Carry to the architect for the interactive-transport phase. See R-AS-002.

## Architecture & additivity

- DDD layering clean: no `obsidian`/`node:*`/Vue in the domain or application AS files
  (`ApprovalMatcher`, `ApprovalRule`, `PermissionMode`, `ApprovalRuleStorePort`,
  `ApprovalManager`, `foldControlOptions`); `obsidian` confined to
  `ObsidianApprovalRuleStore`/`AgentSidebarView`. New `src/ui/**` AS files import only `vue` +
  ports. No `v-html`; mounted components have co-located `.po.ts` querying by `data-testid`.
- Narrow-port discipline: `ApprovalRuleStorePort` is store-only, one consumer, own
  `APPROVAL_RULE_STORE_PORT` key, no aggregate; backed on all three bridges.
- Additivity: `ChatRuntimeQueryOptions.permissionMode?`, `TabControls.permissionMode?`,
  `ApprovalDecision` +`'deny-always'`, `ApprovalRequest` keyset unchanged. The single
  non-additive change is the `ToolbarCapabilities.permissionMode` type-broaden
  (`'default'|'plan'` → `PermissionMode`) — flagged in design as behaviour-additive and
  typecheck-gated.

## Constitution check

No violations. Article I.3 (spec-before-code) was honoured on CLAR-AS-006 (escalated, not
forced). Article V traceability holds (see `traceability.md` — no orphan REQ). The one defect
(R-AS-001) is an implementation/i18n omission, not a principle breach.

## Risks / manual legs (pending — NOT green)

- **TEST-AS-M1** — real Obsidian device-local store round-trip + "data.json/vault untouched".
- **TEST-AS-M3** — real Claude SDK `--permission-mode` mapping + plan-exit `setMode` session sync.
- **TEST-AS-M2 / dev smoke** — `npm run dev` interactive flow (REQ-AS-022/040/043/054 dev leg).
- **Parity screenshots** — status panel + permission toggle + approvals list @ 320/520/720 px,
  light + dark.
These are recorded pending in `test-plan.md`/`parity-screenshots.md` and feed the single final
epic-review gate. Do not count them green.

## Brand review

Not-applicable — no `sites/`, `templates/`, or brand-token surface in the diff. The UI added
is plugin chat surface CSS using the project `--sp-*` token layer (`tokens.css` §4.14 is
var-lookup-only; no hex, no raw Obsidian var). NFR-AS-012 token parity is met in code; the
visual parity screenshots are the pending manual leg above.

## Quality metrics evidence

`specorator quality:metrics` not run in this read-only review pass (the parent owns the full
`verify`/`test:all`/coverage run). Deterministic evidence used instead: 54 + 84 = passing P7
Vitest legs executed directly here; the additivity/degrade path read in `ChatSurface`; the
matcher parity diff against `D:\Projects\claudian-main`. Coverage thresholds (NFR-AS-011) are
deferred to the parent's `npm run test:coverage`.

## Conditions to clear the verdict to "approve"

1. **R-AS-001 fixed** — add `permission.mode.{normal,plan,yolo}` to `en.ts` (+ a text
   assertion in the live-toggle test). **Blocking.**
2. Parent confirms `npm run verify` + `npm run test:all` exit zero on the branch.
3. The four manual legs (M1/M2/M3 + parity screenshots) recorded for the epic gate.

R-AS-002 (CLAR-AS-006) is tracked for the architect, not a P7 blocker. R-AS-003/004/005 are
scheduled.
