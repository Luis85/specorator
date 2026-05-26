---
id: TRACE-AS-001
title: Traceability matrix — Approvals & Security (Claudian Reboot P7)
stage: review
feature: approvals-security
status: validated
owner: reviewer
epic: claudian-reboot
phase: P7
area: AS
integration_branch: next
base_sha: 4f645a40
head_sha: a73d5995
created: 2026-05-26
updated: 2026-05-26
---

# Traceability — Approvals & Security (P7)

Regenerated at `/spec:review` from the P7 artifacts + the `git diff next..HEAD` code.
Every `must`/`should` REQ-AS has a downstream chain (SPEC → code `file:line` → TEST,
plus a manual leg where the surface is coverage-excluded). No orphan REQ.

Legend: **auto** = executed Vitest leg; **manual** = deferred human-run leg (real
Obsidian device-local store / real Claude SDK mapping+setMode / `npm run dev` smoke /
parity screenshots) — recorded **pending**, NOT counted green.

## Group A — Permission mode

| REQ | SPEC | Code (file:line) | TEST | Status |
|---|---|---|---|---|
| REQ-AS-001 render three modes | SPEC-AS-012 | `src/ui/chat/toolbar/PermissionToggle.vue:35,121-147` | TEST-AS-001 `tests/ui/chat/toolbar/PermissionToggle.live.test.ts:39` | auto green (label-text gap — see R-AS-001) |
| REQ-AS-002 set drives runtime | SPEC-AS-002/011 | `PermissionToggle.vue:63-65`; `ChatSurface.vue:494-496`; `foldControlOptions.ts:46-48`; `ClaudeCliChatRuntime.ts:108,366-369` | TEST-AS-002 `PermissionToggle.live.test.ts:62`; `tests/ui/stores/tabsStore.permissionMode.test.ts` | auto green + manual M3 (SDK flag) |
| REQ-AS-003 reflect + PLAN | SPEC-AS-012 | `PermissionToggle.vue:41-44,112-118` | TEST-AS-003 `PermissionToggle.live.test.ts:55` | auto green |
| REQ-AS-004 yolo auto-approve | SPEC-AS-010 | `ApprovalManager.ts:64-66`; `ClaudeCliChatRuntime.ts:380-381` | TEST-AS-004 `tests/application/chat/approvals/ApprovalManager.test.ts` (yolo); `MockApprovalRuntimeMode.test.ts` | auto green |
| REQ-AS-005 plan gates edits | SPEC-AS-007 | `ApprovalManager.ts:67-71`; `ClaudeCliChatRuntime.ts:173-186,315-317` | TEST-AS-005 (plan→prompt) `ApprovalManager.test.ts:94` | auto (defer leg) + manual M3 (setMode) |
| REQ-AS-006 per-tab mode | SPEC-AS-002 | `TabControls.ts:30`; `ChatSurface.vue:196-198` | TEST-AS-006 `PermissionToggle.live.test.ts:80`; `tabsStore.permissionMode.test.ts` | auto green |

## Group B — Approval rules & matching (pure core)

| REQ | SPEC | Code (file:line) | TEST | Status |
|---|---|---|---|---|
| REQ-AS-010 derive action pattern | SPEC-AS-004/026 | `ApprovalMatcher.ts:27-47` | TEST-AS-010 `tests/domain/chat/approvals/ApprovalMatcher.test.ts` | auto green |
| REQ-AS-011 bash explicit-wildcard | SPEC-AS-026 | `ApprovalMatcher.ts:111-124,158-168` | TEST-AS-011 `ApprovalMatcher.test.ts`; `ApprovalManager.test.ts:157` (`git *`↛`github`) | auto green |
| REQ-AS-012 file path-segment prefix | SPEC-AS-026 | `ApprovalMatcher.ts:126-134,142-156` | TEST-AS-012 `ApprovalMatcher.test.ts`; `ApprovalManager.test.ts:164` (`/a/b`↛`/a/bc.md`) | auto green |
| REQ-AS-013 other-tool prefix / `*`/empty | SPEC-AS-026 | `ApprovalMatcher.ts:95,104,136-139` | TEST-AS-013 `ApprovalMatcher.test.ts` | auto green |
| REQ-AS-014 null-action guard | SPEC-AS-026 | `ApprovalMatcher.ts:97-98` | TEST-AS-014 `ApprovalMatcher.test.ts` | auto green |
| REQ-AS-015 action description | SPEC-AS-026 | `ApprovalMatcher.ts:55-73` | TEST-AS-015 `ApprovalMatcher.test.ts` | auto green |
| REQ-AS-016 rule shape allow/deny + lifetime | SPEC-AS-005 | `ApprovalRule.ts:10-44` | TEST-AS-016 `tests/domain/chat/approvals/ApprovalRule.test.ts` | auto green |

## Group C — Decision flow

| REQ | SPEC | Code (file:line) | TEST | Status |
|---|---|---|---|---|
| REQ-AS-020 matched allow auto-approve | SPEC-AS-010/027 | `ApprovalManager.ts:87-99`; `ApprovalGateRuntime.ts:138-142` | TEST-AS-020 `ApprovalManager.test.ts:120`; `ChatSurface.approvals.test.ts` | auto green |
| REQ-AS-021 matched deny auto-deny | SPEC-AS-010 | `ApprovalManager.ts:92-94` | TEST-AS-021 `ApprovalManager.test.ts:127` | auto green |
| REQ-AS-022 unmatched → P4 prompt | SPEC-AS-016 | `ApprovalManager.ts:100`; `ApprovalGateRuntime.ts:143-148` | TEST-AS-022 `ChatSurface.approvals.test.ts` | auto green + manual M2 (dev) |
| REQ-AS-023 deny-wins / first-match | SPEC-AS-027 | `ApprovalManager.ts:89-96` | TEST-AS-023 `ApprovalManager.test.ts:133,316` | auto green |
| REQ-AS-024 mode short-circuits lookup | SPEC-AS-010 | `ApprovalManager.ts:64-71` | TEST-AS-024 `ApprovalManager.test.ts` (yolo+deny→allow) | auto green |
| REQ-AS-025 cancel denies + interrupt | SPEC-AS-010 | `ApprovalManager.ts:116-118`; `ApprovalGateRuntime.ts:145-148` | TEST-AS-025 `ApprovalManager.test.ts` (null) | auto green |

## Group D — Persistence (device-local store)

| REQ | SPEC | Code (file:line) | TEST | Status |
|---|---|---|---|---|
| REQ-AS-030 always → persist device-local | SPEC-AS-010/006 | `ApprovalManager.ts:127-145`; `ObsidianApprovalRuleStore.ts:38-48` | TEST-AS-030 `ApprovalManager.test.ts`; `ApprovalRuleStorePort.test.ts` | auto green (Mock/LS) + manual M1 (real device-local) |
| REQ-AS-031 once → session only | SPEC-AS-010 | `ApprovalManager.ts:122-125,167-183` | TEST-AS-031 `ApprovalManager.test.ts` | auto green |
| REQ-AS-032 persisted survive reload | SPEC-AS-006 | `ObsidianApprovalRuleStore.ts:34-36,69-80`; `LocalStorageApprovalRuleStore.ts:22-24,50-65` | TEST-AS-032 `LocalStorageApprovalRuleStore.test.ts`; `MockApprovalRuleStore.test.ts` | auto green (Mock/LS) + manual M1 |
| REQ-AS-033 session NOT survive reload | SPEC-AS-010 | `ApprovalManager.ts:44` (in-memory only) | TEST-AS-033 `ApprovalManager.test.ts` | auto green |
| REQ-AS-034 never data.json/vault | NFR-AS-003 | `ObsidianApprovalRuleStore.ts:30,70,83` (`loadLocalStorage`/`saveLocalStorage`) | TEST-AS-034 / TEST-AS-M1 | **manual M1 pending** (real device-local; code-evidence strong) |

## Group E — Status / approvals UI

| REQ | SPEC | Code (file:line) | TEST | Status |
|---|---|---|---|---|
| REQ-AS-040 show active mode | SPEC-AS-013 | `ApprovalsPanel.vue:22,37` | TEST-AS-040 `tests/ui/chat/approvals/ApprovalsPanel.test.ts` | auto green |
| REQ-AS-041 list current rules | SPEC-AS-014 | `ApprovalsPanel.vue:43-50`; `ApprovalRuleRow.vue` | TEST-AS-041 `ApprovalsPanel.test.ts`; `ApprovalRuleRow.test.ts` | auto green |
| REQ-AS-042 remove a persisted rule | SPEC-AS-014 | `ChatSurface.vue:499-503`; `ApprovalRuleRow.vue:45-53` | TEST-AS-042 `ApprovalRuleRow.test.ts`; `ChatSurface.approvals.test.ts` | auto green |
| REQ-AS-043 reflect changes live | SPEC-AS-016 | `ChatSurface.vue:217-223,292-294` | TEST-AS-043 `ChatSurface.approvals.test.ts` | auto green + manual M2 (dev) |

## Group F — Accessibility & additivity

| REQ | SPEC | Code (file:line) | TEST | Status |
|---|---|---|---|---|
| REQ-AS-050 keyboard-operable | NFR-AS-013 | `PermissionToggle.vue:84-101`; `ApprovalRuleRow.vue:45` | TEST-AS-050 `PermissionToggle.live.test.ts:70` | auto green |
| REQ-AS-051 AT state + accessible name | NFR-AS-013 | `PermissionToggle.vue:52-54,142`; `ApprovalsPanel.vue:34`; `ApprovalRuleRow.vue:50` | TEST-AS-051 `PermissionToggle.live.test.ts:48` | auto green (accessible-name TEXT undermined by R-AS-001 in `en`) |
| REQ-AS-052 no-rule+normal byte-identical | NFR-AS-001 | `foldControlOptions.ts:46-48`; `ChatSurface.vue:193,203-213,286-296` (optional inject degrade) | TEST-AS-052 `foldControlOptions.test.ts`; `ChatSurface.approvals.test.ts` (absent-port degrade) | auto green |
| REQ-AS-053 Mock + LocalStorage backings | NFR-AS-005 | `MockApprovalRuleStore.ts`; `LocalStorageApprovalRuleStore.ts`; `MockBridge.ts`; `LocalStorageBridge.ts` | TEST-AS-053 `MockApprovalRuleStore.test.ts`; `LocalStorageApprovalRuleStore.test.ts` | auto green |
| REQ-AS-054 fail-safe-to-prompt | NFR-AS-004 | `ApprovalManager.ts:73-84` | TEST-AS-054 `ApprovalManager.test.ts:172-196` | auto green |

## NFR coverage

| NFR | Evidence | Status |
|---|---|---|
| NFR-AS-001 additivity | `ChatTurn.ts:78-82` / `TabControls.ts:30` / `ChatRuntimePort.ts:48-58` additive optionals; `ToolbarCapabilities.permissionMode` type-broaden (behaviour-additive, typecheck-gated) | met |
| NFR-AS-002 no secret / inert data | `ApprovalRule.ts:10-28` readonly scalars; `ApprovalManager.ts:161-165` `{`-leading JSON fallback dropped to match-all | met |
| NFR-AS-003 device-local not vault/data.json | `ObsidianApprovalRuleStore.ts:30,70,83` | code-strong; **manual M1 pending** |
| NFR-AS-004 fail-safe | `ApprovalManager.ts:73-84` + TEST-AS-054 | met (auto) |
| NFR-AS-005 DDD/ports purity | no `obsidian`/`node:*`/Vue in domain+application AS files; `APPROVAL_RULE_STORE_PORT` one consumer, own key | met |
| NFR-AS-006 Vue no obsidian | new `src/ui/**` AS files import only `vue`/ports | met |
| NFR-AS-007 no v-html/blocking dialog | `ApprovalsPanel.vue`/`ApprovalRuleRow.vue`/`PermissionToggle.vue` declarative; `showInfo` non-blocking | met |
| NFR-AS-008 script setup / Result / DTOs | all new components `<script setup>`; `ApprovalManager`/store return `Result`; rules are DTOs | met |
| NFR-AS-009 totality | matcher total; `tryAsync` around store; never throws across the callback boundary | met (auto) |
| NFR-AS-010 test mirror + PO | `.po.ts` co-located for each mounted component; data-testid only | met |
| NFR-AS-011 coverage thresholds | parent verify gate (80/70/80/80) | deferred to parent run |
| NFR-AS-012 token parity | `tokens.css` §4.14 var-lookup-only slice; `styles.css` §4.13 comment fix | met (auto) + **manual M-screenshots pending** |
| NFR-AS-013 a11y | keyboard + `aria-selected` + accessible names | met (auto); see R-AS-001 (en label text) |
| NFR-AS-014 identity/manifest | no `manifest.json` change in diff | met |
| NFR-AS-015 i18n | new strings via TranslationPort — **EN default missing `permission.mode.*` (R-AS-001)** | **partial — defect** |
| NFR-AS-016 no new dep | no `package.json` runtime-dep change | met |

## ADR linkage

| ADR | Subject | Honoured by |
|---|---|---|
| ADR-AS-001 | `ApprovalRuleStorePort` + rule shape + device-local backing | `ApprovalRuleStorePort.ts`, three stores, `ApprovalRule.ts`, `ApprovalMatcher.ts` |
| ADR-AS-002 | additive permission-mode plumbing + SDK mapping/setMode | `ChatTurn.ts`, `TabControls.ts`, `foldControlOptions.ts`, `ClaudeCliChatRuntime.ts` |
| ADR-AS-003 | approval decision-flow use case | `ApprovalManager.ts`, `ApprovalGateRuntime.ts`, `Approval.ts` (deny-always) |

## CLAR / escalation

- **CLAR-AS-006** (action-pattern derivation): the gate derives `actionPattern` from
  `req.context` (`ApprovalGateRuntime.ts:157-159`) rather than `getActionPattern(tool, input)`,
  because the frozen `ApprovalRequest` keyset (`Approval.ts:18-25`, locked by
  `tests/domain/chat/inline/Approval.test.ts`) carries no structured input. Classified **P3
  (acceptable deferral)** — see review.md R-AS-002. No orphan; tracked.

## Orphan check

- No REQ-AS without a downstream chain.
- No SPEC-AS without a REQ parent.
- No new test without a REQ/EC anchor.
- No new ADR without a consuming code path.
- Manual legs M1 (device-local store) / M2 (`npm run dev` smoke) / M3 (real SDK
  mapping+setMode) / parity screenshots are **pending**, recorded not-green.
