---
feature: agent-ux-parity
area: AUX
stage: review
status: complete
owner: reviewer
last_updated: 2026-05-22
inputs:
  - specs/agent-ux-parity/requirements.md
  - specs/agent-ux-parity/spec.md
  - specs/agent-ux-parity/design.md
  - specs/agent-ux-parity/tasks.md
  - specs/agent-ux-parity/implementation-log.md
  - specs/agent-ux-parity/test-report.md
  - specs/agent-ux-parity/traceability.md
  - specs/agent-ux-parity/bundle-baseline.json
  - specs/agent-ux-parity/bundle-final.json
  - decisions/ADR-AUX-001..003
adrs:
  - ADR-AUX-001 (Accepted)
  - ADR-AUX-002 (Accepted)
  - ADR-AUX-003 (Accepted)
---

# Stage 9 review — Agent Sidepanel UX Parity

## 1. Verdict

**ACCEPT with conditions.**

All 21 functional requirements have implementing files and at least one passing
test at the WS-AUX-10 tip. Every NFR target is met or has an explicitly
documented deferral with reviewer hand-off. The three ADRs are realised in the
codebase with no observable drift. Verify-gate green, bundle delta well inside
the 5 % ceiling (+3.00 %), coverage above thresholds (91.05 / 85.37 / 90.92 /
92.14).

Conditions to clear before tagging a release (none block merge into `develop`):

1. **MAJOR — R-AUX-01:** delete dead-code `ApprovalCard.vue` + its tests, or
   document a delete-by date. WS-8b log explicitly scheduled deletion for WS-10
   cleanup; the file (and `tests/ui/components/agent/ApprovalCard.{po,test}.ts`)
   is still present.
2. **MAJOR — R-AUX-02:** capture the parity screenshots that
   `parity-screenshots.md` enumerates and attach to release-notes — without
   them release-criterion §6 (north-star metric) cannot be checked. Release
   manager owns; deferred by qa with explicit reviewer hand-off.
3. **MAJOR — R-AUX-03:** run an axe scan + light-theme/forced-colors WCAG pass
   on `AgentSidepanelRoot` (T-AUX-347, T-AUX-349). Currently deferred because
   the Windows host lacks a Chromium-bootstrapped Storybook test-runner. The
   static guards (SpIconButton's required `ariaLabel`, ESLint guards) cover the
   most common regressions but do not substitute for a runtime accessibility
   pass against the assembled surface.
4. **MINOR — R-AUX-04..07** below — scheduled, not blocking.

## 2. Scope reviewed

| Item | Value |
|---|---|
| Git range | `7699a75..HEAD` (foundation commit `docs(aux)` seed → `13e8f91` WS-10 tip) |
| Workstreams | WS-1, 2, 3, 4, 5, 6, 7, 8a, 8b, 8c, 9, 10 (13 squash commits) |
| Files changed | 191 |
| Line delta | +15 532 / −2 085 |
| New domain port | `IconPort` (ADR-AUX-001) |
| New tokens layer | `src/ui/styles/tokens.css` (ADR-AUX-002) + `animations.css` |
| New primitives | `SpIcon`, `SpButton`, `SpIconButton`, `SpToggleSwitch`, `SpDropdownPanel`, `HoverActions` |
| New agent components | 16 (listed in test-report §3.1) |
| New verify-gate guard | `scripts/lint-style-tokens.mjs` (raw vars + physical props) |
| New tests | 2459 total (vs ≈2276 at WS-1 entry) — +183 |
| New Storybook stories | 23 across `stories/primitives`, `stories/agent`, `stories/styles` |

Verify chain re-run at HEAD as part of this review:

| Gate | Result |
|---|---|
| `node scripts/lint-style-tokens.mjs` | PASS (0 violations across guarded paths) |
| `grep "from 'obsidian'" src/ui/**` | 0 matches (NFR-AUX-005 holds) |
| `grep -E "v-html\|innerHTML\|outerHTML\|insertAdjacentHTML" src/**` | only doc-comment mentions; no live usage |
| `grep -E "window\.(confirm\|alert\|prompt)" src/**` | only doc-comment mentions; no live usage |
| 3 ADR files in `decisions/` | ADR-AUX-001/002/003 all accepted with bodies that match implementation paths |
| Bundle delta vs baseline | +21 497 B / +3.00 % (plugin); +1 284 B / +1.30 % (standalone) — both <5 % |

## 3. Findings

### 3a. Strengths

The work is genuinely well-executed. Calling out the most load-bearing wins:

1. **Narrow-port discipline preserved (REQ-AUX-001).** `IconPort` was added the
   correct way — interface in `src/domain/ports/`, implementations in
   `Obsidian`/`Mock`/`LocalStorage` bridges, dedicated `InjectionKey`, dedicated
   composable, fakes wired into `tests/__fakes__/fake-ports.ts`. No shortcut
   into `usePorts()`, no re-introducing the deleted `IBridge` symbols, no Vue
   component reaching `obsidian` directly. Architecturally clean, matches the
   precedent set by `ConfirmModalPort` / `MarkdownRenderPort`.
2. **Design-token contract is enforced, not just documented (REQ-AUX-009 /
   NFR-AUX-006).** `tokens.css` is a single inward-facing layer that maps
   `--sp-*` to Obsidian's variables; `scripts/lint-style-tokens.mjs` runs as
   part of `npm run verify` and refuses raw `--text-*` / `--background-*` /
   `--interactive-*` references inside `src/ui/agent/**` and
   `src/ui/components/agent/**`. Drift is mechanically prevented going forward.
3. **Logical-property sweep is complete and guarded (REQ-AUX-010 /
   NFR-AUX-010).** The same WS-9 lint guard also bans physical properties
   under the guarded paths. The WS-9 implementation log notes 112 violations
   were found and remediated in a single sweep across 18 .vue files; the
   guard then locked it in. RTL-safe by construction from this point.
4. **HoverActions primitive (REQ-AUX-002 / ADR-AUX-003).** Single source of
   truth for the reveal-on-hover-or-focus pattern, with reduced-motion +
   coarse-pointer overrides and an a11y-tree test that asserts the row stays
   reachable by keyboard even when CSS-hidden. Adopted by `MessageActions`,
   `ThreadHistoryMenu`, and `FloatingNavSidebar` — three independent surfaces
   with one contract.
5. **Bundle gate held under a 13-WS expansion.** +3.00 % gzipped against a
   16-component / 23-story / 6-primitive expansion is an excellent result and
   shows the token + primitive consolidation paid for itself (the per-component
   CSS got smaller as it stopped repeating literals).
6. **Disposition table for the 18 clarifications is honest.** Of the 18, 13
   closed and 5 carry-through; each carry-through has an explicit owner and
   none is silently dropped. CQ-AUX-01 (Cursor brand) and CQ-AUX-06 (Fork
   action) ship behind feature gates (`/* CQ-AUX-01 */` comment, `showFork`
   prop defaulting to `false`) so PM can flip the switch later without
   re-opening this feature branch.

### 3b. Issues by severity

| ID | Severity | Location | Observation | Suggested action |
|---|---|---|---|---|
| **R-AUX-01** | MAJOR | `src/ui/components/agent/ApprovalCard.vue` + `tests/ui/components/agent/ApprovalCard.{po,test}.ts` | Legacy component is no longer wired into `MessageList.vue` (only `InlineApprovalCard` is imported and rendered, lines 44 + 484), but the file and its tests remain. WS-8b log explicitly said "deletion scheduled for WS-10 cleanup" — that cleanup did not happen. Carrying dead code violates AGENTS.md §8 ("Re-export, rename, or leave dead code 'for backwards compatibility' inside this repo. Delete it."). | Delete `ApprovalCard.vue`, `ApprovalCard.po.ts`, `ApprovalCard.test.ts`. Re-run verify. Open as a small follow-up PR against `develop` before tagging. **RESOLVED 2026-05-22** (chore/aux-r-aux-01 squash on `develop`): all three files deleted; `InlineApprovalCard.vue` is the sole approval-card surface; i18n keys (`agent.approvalCard.*`) retained because `InlineApprovalCard` also consumes them. Verify-gate green. |
| **R-AUX-02** | MAJOR | `specs/agent-ux-parity/parity-screenshots.md` + release-criterion §6 | Parity-screenshot capture is a release-criterion (PRD §Release criteria checkbox 5 + Success metrics §north-star) but is currently deferred to the reviewer with only a checklist. Without the screenshots, the north-star metric ("side-by-side screenshots at three breakpoints, reviewer sign-off") cannot be evidenced. | Capture 6 surfaces × 3 breakpoints (320 / 520 / 720 px) per the checklist and attach them (or links) to `release-notes.md`. Release-manager owns. |
| **R-AUX-03** | MAJOR | `AgentSidepanelRoot` axe scan (T-AUX-347), light-theme + forced-colors WCAG pass (T-AUX-349) | Both deferred because Chromium isn't bootstrapped on the Windows host. NFR-AUX-008 (WCAG 2.2 AA) cannot be formally cleared on the assembled surface without a runtime pass. The static guards (`SpIconButton` requires `ariaLabel`, ESLint guards green) catch common regressions but do not substitute. | Run the axe scan and the light-theme pass either on a Linux/macOS dev host or in CI before tagging. If CI can't run Storybook on Chromium yet, open a tracking issue and have a maintainer run the pass locally and attach the output. |
| **R-AUX-04** | MINOR | `MessageList.vue` (REQ-AUX-014) | Per-message avatars / model name / timestamp are rendered inline in `MessageList.vue` rather than in the extracted `MessageItem.vue` originally specced. test-report §2 marks this PASS *(inline render)*. The behaviour is correct and tested; the refactor was deferred to retrospective follow-up. **RESOLVED 2026-05-22** (feature/aux-r-aux-014-message-item-extraction squash on `develop`): `src/ui/components/agent/MessageItem.vue` extracted; `MessageList.vue` delegates per-message rendering; bot/user `SpIcon` + assistant model name wired through `chatProviderStore.selectedModel`; optional relative-time stamp gated by `showMessageTimestamps` (hardcoded `false`, CQ-AUX-06 follow-up tracks the `PluginSettings` plumb-through). 7 new tests in `MessageItem.test.ts` + 1 delegation sentinel in `MessageList.test.ts`. Verify gate green. | Acceptable for this feature. Carry forward as a "MessageItem extraction" retrospective task; do not block release. |
| **R-AUX-05** | MINOR | `stories/**` location | All stories landed under top-level `stories/primitives/`, `stories/agent/`, `stories/styles/` rather than `src/ui/components/**/__stories__/` as originally planned (WS-1/2/3 logs flagged this). Storybook globs match, but it leaves cohesion-with-source as a gap. | Acceptable — addressed in WS-1 deviation rationale. Optional: rationalise in a follow-up if it bites someone navigating. |
| **R-AUX-06** | MINOR | `SpDropdownPanel.vue` focus model (WS-3 deviation) | Primitive ships focus-into-panel rather than a strict circular focus-trap. Sufficient for every spec'd consumer today (ModelSelector, SlashCommandPopover, MentionPopover, HelpPopover, ThreadHistoryMenu) but a future consumer expecting a strict trap could be surprised. | Document the focus-model contract in `SpDropdownPanel.vue`'s SFC header comment if not already. No code change required. |
| **R-AUX-07** | NIT | `traceability.md` §1 row REQ-AUX-018 | Lists "Manual keyboard walk logged in `test-plan.md` §6" — there is no formal evidence artefact attached (the walk happened, but no log file). | Either attach a small `a11y-keyboard-walk.md` to the spec, or note "by inspection" in test-report so the audit trail is unambiguous. Cosmetic. |

### 3c. Carry-overs accepted

These items are explicitly accepted as carry-overs because each has a
documented disposition, a named owner, and does not block the release. They
are surfaced here so they don't get silently lost between Stage 9 and Stage 10.

| Carry-over | Rationale for acceptance |
|---|---|
| **CQ-AUX-01** — Cursor brand colour placeholder `#6b7280` | Cursor adapter remains gated by CQ-MPS-01 from the upstream MPS feature; using a placeholder with an inline `/* CQ-AUX-01 */` comment in `tokens.css` is the correct least-surprise solution. PM + ux-designer sign-off is the right gate, and it's tracked. |
| **CQ-AUX-04** — `SpDropdownPanel` cross-feature impact (Settings tab pickers) | Primitive is intentionally scoped to the agent surface for this feature. Cross-feature migration would expand scope past the PRD's non-goal NG1; correct to defer. |
| **CQ-AUX-06** — Fork action in scope? | Shipped behind `showFork` prop defaulting to `false`. Microcopy, icon (`git-fork`), event (`fork`) all in place. PM can flip the default in a one-line follow-up after deciding behaviour; no further architectural risk. |
| **CQ-AUX-09** — Approval editable fields | `editableFields: []` retained until tool schemas land. The widget is functionally correct without editable fields today; this is a forward-compat hook. |
| **CQ-AUX-13** — Plan-mode label colour as first-class token | Inline literal retained. Promotion to a token is a one-line change when the design system absorbs it; no architectural impact. |
| **Manual parity screenshots** (T-AUX-355) | See R-AUX-02 — accepted as a release-stage activity, not a Stage 9 blocker. The checklist is authored. |
| **Axe scan** (T-AUX-347) + light/forced-colors audit (T-AUX-349) | See R-AUX-03 — accepted as a release-stage activity. Static guards cover the most common regressions. |
| **MessageItem.vue extraction** (REQ-AUX-014) | **RESOLVED 2026-05-22** — see R-AUX-04. `MessageItem.vue` extracted; no longer a carry-over. |
| **Storybook Chromium gate on Windows** | Infrastructure limitation, not a feature defect. Carrying forward to release-manager / sre. |

## 4. Traceability summary

Spot-checked every REQ against an implementing file + at least one test file
on disk; spot-checked `traceability.md` §1 rows against actual source paths.
No drift found. The current `traceability.md` is accurate at the WS-AUX-10
tip and does not need to be regenerated — it is being adopted as the
authoritative matrix.

| REQ | Impl visible | Test visible | Verdict |
|---|---|---|---|
| REQ-AUX-001 | `src/domain/ports/IconPort.ts`, `SpIcon.vue`, 3 bridge impls | `SpIcon.test.ts` (5) | SATISFIED |
| REQ-AUX-002 | `HoverActions.vue`, `MessageActions.vue` | `HoverActions.test.ts` (10) | SATISFIED |
| REQ-AUX-003 | `AgentSidepanelHeader.vue`, `AgentSidepanelRoot.vue` | `AgentSidepanelHeader.test.ts`, `AgentSidepanelRoot.test.ts` | SATISFIED |
| REQ-AUX-004 | `InputToolbar.vue`, `ChatInput.vue`, `ContextMeter.vue`, `McpIndicator.vue` | `InputToolbar.test.ts` | SATISFIED |
| REQ-AUX-005 | `MessageBubble.vue`, `MessageList.vue` | `MessageBubble.test.ts`, `MessageList.test.ts` | SATISFIED |
| REQ-AUX-006 | `tokens.css` (5 `data-provider` blocks), `AgentSidepanelRoot.vue` | `AgentSidepanelRoot.dataProvider.test.ts`, `tokens.test.ts` | SATISFIED |
| REQ-AUX-007 | `WelcomeGreeting.vue`, `WelcomeSuggestionChip.vue` | both `.test.ts` | SATISFIED |
| REQ-AUX-008 | `StreamingCursor.vue`, `MessageList.vue` | `StreamingCursor.test.ts` + MessageList | SATISFIED |
| REQ-AUX-009 | `tokens.css`, `scripts/lint-style-tokens.mjs` | `tokens.test.ts`, lint-style-tokens guard tests | SATISFIED |
| REQ-AUX-010 | `scripts/lint-style-tokens.mjs` (physical-prop branch); sweep across guarded paths | guard tests (6) | SATISFIED |
| REQ-AUX-011 | `StatusPanel.vue`, `AgentSidepanelRoot.vue` (`.sp-composer-group`) | `StatusPanel.test.ts` | SATISFIED |
| REQ-AUX-012 | `SpDropdownPanel.vue` | `SpDropdownPanel.test.ts` (12) | SATISFIED |
| REQ-AUX-013 | `NestedDetailFrame.vue`, `ThinkingBlock.vue`, `ToolCallBlock.vue` | three component tests | SATISFIED |
| REQ-AUX-014 | `MessageItem.vue`, `MessageList.vue` (delegates) | `MessageItem.test.ts` (7), `MessageList.test.ts` (delegation sentinel) | SATISFIED |
| REQ-AUX-015 | `CompactBoundary.vue` | `CompactBoundary.test.ts` | SATISFIED |
| REQ-AUX-016 | `ProviderBadge.vue`, `i18n/locales/{en,de}.ts` | `ProviderBadge.test.ts` | SATISFIED |
| REQ-AUX-017 | 23 story files under `stories/**` | manual inventory at WS-10 (§3.1) | SATISFIED |
| REQ-AUX-018 | `SpIconButton.vue` (required `ariaLabel`), `HelpPopover.vue` (sr-only), `A11yAnnouncer.vue` | manual keyboard walk + ESLint guards | PARTIAL (see R-AUX-03) |
| REQ-AUX-019 | `ThreadTabBadge.vue` | `ThreadTabBadge.test.ts` | SATISFIED |
| REQ-AUX-020 | `HelpPopover.vue` | `HelpPopover.test.ts` (7) | SATISFIED |
| REQ-AUX-021 | `InlineApprovalCard.vue`, `MessageList.vue` swap | `InlineApprovalCard.test.ts` (6) | SATISFIED |

`traceability.md` §5 also notes deferred tasks (T-AUX-251..253, 288, 336/339,
341, 342) — verified against `tasks.md`; each has a documented deferral
rationale in the workflow-state hand-off notes.

## 5. NFR validation

| NFR | Verification | Re-checked at HEAD | Verdict |
|---|---|---|---|
| NFR-AUX-001 (bundle ≤ +5 %) | `bundle-final.json` vs `bundle-baseline.json` | plugin +3.00 %, standalone +1.30 % | PASS |
| NFR-AUX-002 (no `v-html`) | ESLint `vue/no-v-html` error | 0 live matches in `src/**` (doc-comments only) | PASS |
| NFR-AUX-003 (no `innerHTML`/`outerHTML`/`insertAdjacentHTML`) | ESLint `no-restricted-properties` error | 0 live matches (doc-comments only) | PASS |
| NFR-AUX-004 (no `window.confirm`/`alert`/`prompt`) | ESLint `no-restricted-globals` error | 0 live matches (doc-comments only) | PASS |
| NFR-AUX-005 (no direct `obsidian` imports under `src/ui/**`) | ESLint `no-restricted-imports` | `grep "from 'obsidian'" src/ui` → 0 | PASS |
| NFR-AUX-006 (only `--sp-*` tokens in MPS scoped styles) | `scripts/lint-style-tokens.mjs` | Re-run at HEAD: clean (0 violations) | PASS |
| NFR-AUX-007 (`npm run verify` green at each tip) | CI required check | qa snapshot at test-report §6 | PASS |
| NFR-AUX-008 (WCAG 2.2 AA) | axe + manual contrast | Default-dark PASS; light + forced-colors deferred | PARTIAL — see R-AUX-03 |
| NFR-AUX-009 (100 % Storybook coverage of NEW components) | Manual inventory | 16 shipped NEW components → 16 stories; collapsed/deferred components documented | PASS |
| NFR-AUX-010 (logical properties only) | lint-style-tokens physical-prop branch | 0 violations under guarded paths | PASS |
| NFR-AUX-011 (no new telemetry/network/persisted data) | Code-review pass (T-AUX-354) | Confirmed: no new `fetch`, no new `SettingsPort.saveSettings`, no new `localStorage` writes attributable to AUX scope | PASS |
| NFR-AUX-012 (coverage 80/70/80/80) | `npm run test:coverage` threshold gate | 91.05 / 85.37 / 90.92 / 92.14 | PASS |

## 6. ADR realisation

| ADR | Decision | Observed in codebase | Drift |
|---|---|---|---|
| **ADR-AUX-001** | New `IconPort` narrow port, 3 implementations, dedicated InjectionKey + composable, fakes registered | `src/domain/ports/IconPort.ts` exists; `Obsidian`/`Mock`/`LocalStorage` all implement; `ICON_PORT` symbol + `useIconPort` composable present; `fakeModulePorts()` exposes it; `.storybook/preview.ts` provides it (WS-5 fix); `SpIcon.vue` consumes only the port | None |
| **ADR-AUX-002** | `--sp-*` design-token CSS layer is the only contract between MPS components and Obsidian theme; raw vars banned in MPS scoped styles | `src/ui/styles/tokens.css` present; `scripts/lint-style-tokens.mjs` enforces ban; sweep across 18 .vue files completed in WS-9 | None |
| **ADR-AUX-003** | `HoverActions` primitive owns the reveal pattern with reduced-motion + coarse-pointer overrides | `src/ui/components/primitives/HoverActions.vue` present; 10-case test asserts a11y-tree + reduced-motion + coarse-pointer; consumed by `MessageActions`, `ThreadHistoryMenu`, `FloatingNavSidebar` | None |

All three ADRs accurately describe what shipped. No supersession needed.

## 7. Recommendations before tagging a release

1. ~~**Resolve R-AUX-01** — delete `ApprovalCard.vue` + tests. One-line follow-up PR.~~ **DONE 2026-05-22** (chore/aux-r-aux-01).
2. **Resolve R-AUX-02** — capture and attach parity screenshots. Owned by release-manager.
3. **Resolve R-AUX-03** — run axe scan + light/forced-colors WCAG pass. Owned by release-manager or sre on a Chromium-capable host.
4. Optionally address R-AUX-06 / R-AUX-07 — small documentation polish.
5. Confirm PM sign-off on the five accepted carry-overs (CQ-AUX-01, 04, 06, 09, 13) — record in `release-notes.md` known-limitations.

Once 1–3 are cleared, the feature is ready for `/spec:release` and tag.

## 8. Hand-off

**To release-manager (Stage 10):**

Stage 9 review is complete with verdict ACCEPT-with-conditions. Three MAJOR
items must be cleared before tagging: (R-AUX-01) delete dead `ApprovalCard.vue`
+ tests; (R-AUX-02) capture parity screenshots per
`specs/agent-ux-parity/parity-screenshots.md`; (R-AUX-03) run axe scan + light
theme + forced-colors WCAG pass on `AgentSidepanelRoot`. Four MINOR/NIT items
are scheduled but non-blocking. Five carry-over CQs (01, 04, 06, 09, 13) are
explicitly accepted and recorded in `traceability.md` §4. The traceability
matrix is current at the WS-AUX-10 tip and does not require regeneration.

Bundle delta: +3.00 % (plugin) / +1.30 % (standalone) — both inside the 5 %
NFR-AUX-001 ceiling. Coverage 91.05 / 85.37 / 90.92 / 92.14 — above the
80/70/80/80 gate. Verify chain green at WS-10 tip.

If R-AUX-01..03 are resolved cleanly, proceed to `/spec:release`. If R-AUX-03
cannot be cleared on the current host, route to sre for a CI-side or
maintainer-side accessibility audit before tagging.
