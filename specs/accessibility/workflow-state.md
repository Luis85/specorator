---
feature: accessibility
area: AY
current_stage: review
status: active
last_updated: 2026-05-27
last_agent: reviewer (REVIEW-AY-001 + TRACE-AY-001 complete; verdict approve-with-nits; hand-off → release-manager for T-AY-018 gate + the human REQ-AY-017 sign-off)
epic: claudian-reboot
phase: P12
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.9/§3.10/§4 P12 + audits + claudian-main accessibility.css stand in)
  research.md: skipped
  requirements.md: accepted (PRD-AY-001, 17 REQ-AY + 10 NFR-AY; autonomous accept)
  design.md: complete (DESIGN-AY-001, Parts A/B/C; no new port, no new ADR)
  spec.md: complete (SPEC-AY-001..011 + TEST-AY-001..017; coverage table)
  tasks.md: complete (TASKS-AY-001, 18 tasks T-AY-001..018; 3 chunks + GATE; coverage sanity-check)
  implementation-log.md: in-progress (Chunk 1 T-AY-001..005 + Chunk 2 T-AY-006..013 + Chunk 3 T-AY-014..016 logged; T-AY-018 gate + T-AY-017 human sign-off remain)
  test-plan.md: in-progress (T-AY-001 baseline + guard-verify note; parity-screenshots.md complete — TEST-AY-016 green)
  test-report.md: pending
  review.md: complete (REVIEW-AY-001 — verdict approve-with-nits; 0 P1/P2; 2 low nits R-AY-001/002)
  traceability.md: complete (TRACE-AY-001 — full REQ↔SPEC↔TASK↔code↔TEST chain; no orphans; REQ-AY-017 pending = human gate)
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — accessibility (P12, FINAL phase)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted |
| 4. Design | `design.md` | complete |
| 5. Specification | `spec.md` | complete |
| 6. Tasks | `tasks.md` | complete |
| 7. Implementation | `implementation-log.md` + code | in-progress (Chunk 1+2+3 done; T-AY-017/018 remain) |
| 8. Testing | `test-plan.md`, `test-report.md` | in-progress (TEST-AY-001..016 green; TEST-AY-017 human) |
| 9. Review | `review.md`, `traceability.md` | complete (approve-with-nits; 0 P1/P2; T-AY-018 gate + REQ-AY-017 human sign-off remain) |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P12 (a11y + final parity sign-off) — THE LAST PHASE

P0-P11 merged to `next` (P11 i18n-locales #452 / d4733464). P12 closes the epic: the accessibility
stylesheet + behaviour polish + the WCAG 2.2 AA sweep across all P1-P11 surfaces, then the **final parity
screenshot sign-off** (human).

**Scope (charter §4 P12 row line 195 + §3.9/§3.10):**
- **`src/ui/styles/accessibility.css`** — the global a11y layer matching/beating claudian's
  `accessibility.css`: `prefers-reduced-motion` (disable/soften the P-various animations in
  `animations.css`), `forced-colors`/high-contrast (system-color mapping, `forced-color-adjust`),
  `:focus-visible` ring (keyboard focus across all `--sp-*` surfaces), `.sr-only` screen-reader-only
  utility, any reduced-transparency. Registered in the build's CSS pipeline (like tokens.css/animations.css).
- **a11y behaviour polish** across the P1-P11 surfaces — ARIA roles/labels gaps, focus management
  (modals trap+restore — verify the P5/P7/P8 modal seams, the toolbar/settings keyboard order), live
  regions for streaming/notices where missing, alt/label text. Audit + fill gaps (much WCAG was built
  per-phase: data-testid, keyboard nav, ARIA — P12 sweeps for the remainder).
- **WCAG 2.2 AA** as the bar (charter §1 line 50-51: keyboard nav, focus management, forced-colors,
  reduced-motion).
- **The FINAL parity screenshot sign-off (ALL surfaces) — HUMAN-owned.** The accumulated manual-Obsidian
  + parity-screenshot legs from P5-P11 (TEST-*-M* across the phases) converge here as the single final
  human review gate (charter §6 / line 219). P12's automatable part = accessibility.css + the behaviour
  fixes + a11y tests; the screenshot sign-off itself is the human leg.

**Epic completion (after P12 merges — charter line 219, the original /goal end-state):** the whole reboot
(P0-P12) is on `next`, full verify gate green → **present the final review + open (DO NOT merge) the
`next`→`develop` PR.** Per the charter, `next`→`develop` is the human's call at parity.

**Epic constraints (every phase):** NO backwards compat; DDD inward imports; Vue never imports `obsidian`;
no `innerHTML`/`v-html` (build DOM safe); the accessibility.css uses `--sp-*` tokens + standard a11y
media queries (no new raw colors outside the token layer where avoidable — but forced-colors/system
colors are the documented exception); `<script setup>`; tests mirror `src/` + `data-testid`; coverage
80/70/80/80; perceptual `--sp-*` parity; identity stays Specorator; manifest untouched; CI SHA-pinned.
VERIFY GATE (`npm run verify` + `npm run test:all` zero) + the lightningcss-safe CSS comment rule.

**Operating mode (human directive, /goal 2026-05-26):** AUTONOMOUS DRIVE — P12 is the last phase; merge
to `next` after a green gate + green CI; deploy to `D:/TestVault`. Then present the final review + open
(don't merge) the `next`→`develop` PR. The single FINAL human review gate (screenshots + manual-Obsidian)
is the human's; surface it, don't self-claim.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.9/§3.10/§4 P12 + §1 (WCAG line 50-51) +
`claudian-audit-frontend.md` + `D:\Projects\claudian-main` (`accessibility.css` + the a11y behaviours) +
OUR `src/ui/styles/{tokens,animations}.css` + the P1-P11 components/modals for the behaviour sweep.

## Hand-off notes

```
2026-05-27 (orchestrator): P12 (LAST phase) bootstrapped on feature/accessibility (off next; P0-P11
                          merged). Scope = charter §3.10 accessibility.css + a11y behaviour polish +
                          WCAG 2.2 AA sweep across all surfaces; the final parity screenshot sign-off is
                          HUMAN-owned (the accumulated P5-P11 manual legs converge). Autonomous; no new
                          port/ADR expected (CSS layer + behaviour fixes). Next: /spec:requirements (pm)
                          grounded in charter §3.9/§3.10/§1 + the claudian accessibility.css + our
                          tokens/animations css + the P1-P11 surfaces. KEY: accessibility.css contents
                          (reduced-motion/forced-colors/focus-visible/sr-only), the behaviour-gap audit,
                          the WCAG 2.2 AA criteria, the human screenshot sign-off as the FINAL gate.
                          AFTER P12 MERGES: present the final review + open (don't merge) next→develop.
2026-05-27 (pm): /spec:requirements done. PRD-AY-001 accepted (autonomous) — 17 functional REQ-AY
                          (Group A accessibility.css+pipeline, B reduced-motion, C forced-colors+contrast,
                          D focus-visible+keyboard, E ARIA+sr-only+live-regions, F modal focus trap/restore
                          at P5/P7/P8/P10 seams, G additivity+no-raw-HTML, H final human sign-off) + 10
                          NFR-AY (WCAG 2.2 AA, token-discipline w/ documented forced-colors exception, no
                          v-html/innerHTML, additivity, coverage 80/70/80/80, manifest untouched,
                          lightningcss-safe, verify+test:all green). Automatable = REQ-AY-001..016 (TEST-AY-*);
                          REQ-AY-017 = HUMAN final parity screenshot sign-off (all surfaces, light+dark,
                          320/520/720) — the single final epic gate, not self-claimed. Ref bar = audit
                          line 358 (claudian accessibility.css minimal/focus-visible-only → meet+beat).
                          Two CLAR resolved (CLAR-AY-001 ref-file-not-readable→use audit chars; CLAR-AY-002
                          reduced-motion global-guard complements per-section token overrides). Hand-off →
                          /spec:design (Part A UX + Part B UI): open the actual claudian accessibility.css,
                          design the .specorator-root reduced-motion/forced-colors/focus-visible/sr-only
                          rule groups + the per-surface ARIA/live-region/modal-focus fixes.
2026-05-27 (architect): /spec:design + /spec:specify done. DESIGN-AY-001 (Parts A/B/C) + SPEC-AY-001
                          (11 SPEC items + TEST-AY-001..017) complete. CLAR-AY-001 RESOLVED by reading
                          the actual D:\Projects\claudian-main\src\style\accessibility.css — confirmed
                          MINIMAL: focus-visible outline rings only (41 lines, 3 selector groups, NO
                          reduced-motion / NO forced-colors / NO sr-only). So "meet" = the focus ring
                          (REQ-AY-007); "beat" = the other five groups. CLAR-AY-002 RESOLVED: the global
                          reduced-motion guard COMPLEMENTS (does not replace) the tokens.css per-section
                          overrides + the CQ-AUX-14 spin halt. accessibility.css = 6 rule groups (RG-1
                          reduced-motion guard, RG-2 spin halt, RG-3 forced-colors mapping, RG-4
                          forced-colors borders, RG-5 :focus-visible ring, RG-6 .sr-only) scoped to
                          .specorator-root, joins tokens.css+animations.css as the 3rd CSS layer at BOTH
                          import sites (src/plugin/main.ts:2 + src/ui/main.ts:14). FOCUS TOKEN: reuse the
                          EXISTING --sp-focus-ring (tokens.css:42) + --sp-shadow-focus-ring (:140) — NO
                          new token. MODAL FOCUS: Obsidian Modal base natively traps+restores focus → the
                          8 modal seams are VERIFY-ONLY, no hand-rolled trap. NO NEW PORT, NO NEW ADR
                          (CSS layer + additive ARIA, all existing patterns). Behaviour sweep = mostly
                          verify-only (busy region already aria-live polite+role=status, TabBar already
                          full ARIA+roving tabindex) + targeted fills (collapsible aria-expanded,
                          icon-only labels, RG-4 selector enumeration). SPLIT: TEST-AY-001..016 automatable
                          (CSS-rule-read / registration / PageObject mounts / additivity diff / discipline
                          scan); TEST-AY-017 = HUMAN final parity screenshot sign-off (all surfaces,
                          light+dark, 320/520/720) — the single final epic gate, agent PRESENTS not claims.
                          Hand-off → /spec:tasks (planner): 3 chunks — (1) accessibility.css + 2 import
                          edits; (2) behaviour-fix sweep; (3) tests + parity-screenshots.md artifact.
                          OPEN CLARIFICATIONS: none blocking. AFTER P12 MERGES: present final review +
                          open (DO NOT merge) next→develop PR — the human's call.
2026-05-27 (planner): /spec:tasks done. TASKS-AY-001 complete — 18 tasks (T-AY-001..018) decomposing
                          SPEC-AY-001..011 across 3 chunks + a GATE. CHUNK 1 (accessibility.css +
                          registration): T-AY-001 (baseline + guard verdict + parity-screenshots.md
                          scaffold), T-AY-002 (the new src/ui/styles/accessibility.css RG-1..6 +
                          register at BOTH import sites src/plugin/main.ts:2 + src/ui/main.ts:14),
                          T-AY-003/004 (RED RG file-read + registration, land first), T-AY-005 (RG-4
                          forced-colors-border selector enumeration). CHUNK 2 (behaviour-fix sweep,
                          additive + mostly verify-only): T-AY-006..009/013 RED component/PageObject
                          tests (forced-colors controls mounted, focus-visible+keyboard/labels,
                          live-region, aria-expanded+sr-only, modal trap/restore verify-only across the
                          8 seams); T-AY-010 (icon-only labels fill), T-AY-011 (notice-host live region),
                          T-AY-012 (collapsible aria-expanded fill). CHUNK 3 (tests + additivity gate):
                          T-AY-014 (additivity diff), T-AY-015 (no raw-HTML discipline scan), T-AY-016
                          (parity-screenshots.md completeness). GATE: T-AY-018 (full verify + lightningcss
                          build:web green + all-auto suites + parity self-review + draft PR into next),
                          then T-AY-017 = the HUMAN final cross-surface parity screenshot sign-off (all
                          P1-P11 surfaces, light+dark, 320/520/720 + the accumulated P5-P11 manual legs)
                          — the SINGLE FINAL EPIC GATE, owner: human, NEVER agent-self-claimed. GUARD
                          VERDICT: NO new InjectionKey/port/composable/component/ADR, NO guard-relax (CSS
                          layer + additive ARIA; manifest/locales byte-identical). lightningcss-safe ASCII
                          comments + RG-5 reuses --sp-focus-ring (no new token) + whole-project lint 0
                          notes carried per task. AFTER P12 MERGES: present final review + open (DO NOT
                          merge) next→develop PR — the human's call. Hand-off → /spec:implement (dev/qa):
                          first ready task = T-AY-001 (dev, baseline + scaffold), then dispatch chunk C1
                          (T-AY-003/004 RED → T-AY-002/005). Suggested dispatch: C1 accessibility.css;
                          C2 Chunk-2 RED scaffold; C3 the three fills (parallel); C4 gate tests; C5
                          T-AY-018 gate then T-AY-017 human sign-off.
2026-05-27 (dev): Chunk 1 (T-AY-001..005) COMPLETE on feature/accessibility (off next). Commits:
                          T-AY-001 6b9bf920 (docs(ay): test-plan baseline + guard-verify note +
                          parity-screenshots.md all-surfaces matrix scaffold + implementation-log);
                          T-AY-003/004 46dc3896 (test(ay): RED RG-1..6 file-read + both-site
                          registration tests, confirmed RED — file/imports absent);
                          T-AY-002 19144399 (feat(ay): src/ui/styles/accessibility.css RG-1..RG-6,
                          .specorator-root scoped, ASCII-only lightningcss-safe comments, no hex /
                          no raw non --sp-* var outside forced-colors; registered as 3rd CSS import
                          after tokens+animations at src/plugin/main.ts:3 + src/ui/main.ts:15;
                          RG-5 reuses --sp-focus-ring / --sp-shadow-focus-ring, NO new token);
                          T-AY-005 e2a1c53d (feat(ay): RG-4 forced-colors-border enumeration —
                          .sp-toggle-switch / [data-state] / .sp-chip / .sp-tab /
                          [role=option][aria-selected=true]). GREEN: 15 accessibility-css tests
                          (TEST-AY-001/002/003/004/005/006-file/007-file/009-file/015-css). vue-tsc 0,
                          whole-project lint 0 errors (22 pre-existing warnings), build:web lightningcss
                          GREEN (RG rules present in the standalone bundle; styles.css not hand-edited).
                          DEVIATION: RED test-helper bugs (mediaBlock all-blocks; RG-N section-marker
                          order scan; scoped-selector tokeniser) corrected when greening T-AY-002 —
                          assertions NOT weakened; folded into the T-AY-002 commit + logged.
                          REMAINING (out of this chunk; parent dispatches): Chunk 2 (T-AY-006..013
                          behaviour-fix sweep), Chunk 3 (T-AY-014..016 additivity/discipline/screenshot
                          completeness), GATE (T-AY-018 verify + draft next PR), T-AY-017 (HUMAN final
                          parity sign-off). Next agent: qa (Chunk 2 RED mount tests, dispatch C2).
2026-05-27 (dev): Chunk 2 (T-AY-006..013) + Chunk 3 (T-AY-014..016) COMPLETE on feature/accessibility.
                          Commits: T-AY-006 46869990 (forced-colors RG-4 controls mount leg + corrected
                          the RG-4 enumeration to the REAL swept selectors [role=switch] /
                          .sp-file-chips__chip / .sp-image-thumb / [data-state] / .sp-tab /
                          [role=option][aria-selected] — the T-AY-005 .sp-toggle-switch/.sp-chip were
                          dead; the mount leg surfaced it); T-AY-007 8eb7c8da (focus-visible reachability
                          + keyboard + accessible names — VERIFY-ONLY, all controls already labelled);
                          T-AY-008 2b59482c (RED live-region: busy verify + notice-host RED); T-AY-009
                          7603abf2 (collapsible aria-expanded flips + icon-only labels — VERIFY-ONLY, all
                          via SpCollapsible / already labelled); T-AY-011 5fcc472e (FILL: NoticeLiveRegion.vue
                          — the .sr-only standalone notice live region on the existing sp:notice channel,
                          no new port; wired into ui/main.ts); T-AY-013 39121ad5 (modal trap/restore
                          structural verify — all 8 seams extend Obsidian Modal; added a minimal Modal to
                          the obsidian test stub); T-AY-014 7ead8bb6 (additivity invariant — locale +
                          manifest byte-identical, src/ diff = ONLY the P12 allow-list, swept renders
                          intact); T-AY-015 07c1fb7f (discipline scan — no added innerHTML/v-html sink);
                          T-AY-016 3f103ef2 (parity-screenshots.md completeness + matrix marked complete).
                          T-AY-010 + T-AY-012 = VERIFY-ONLY no-op (no gap found; logged, no code change).
                          VERIFICATION: vue-tsc 0; whole-project lint 0 errors (22 pre-existing warnings);
                          a11y + styles suite 80 green; P5-P11 regression (TabBar/ChatComposer/FileChips/
                          ImageThumb/SpCollapsible/ToolCallBlock/ChatSurface/ServiceTierToggle/
                          PermissionToggle/ui/main/modalSeam) 102 green. ADDITIVITY CONFIRMED: src/ diff
                          vs next = accessibility.css + plugin/main.ts + ui/main.ts + NoticeLiveRegion.vue
                          ONLY; no swept template, no locale, no manifest changed. GENUINE FILLS =
                          NoticeLiveRegion (SPEC-AY-004 gap) + the RG-4 real-selector correction; all else
                          verify-only (the per-phase a11y sweep was thorough, as designed). REMAINING
                          (PARENT-OWNED, not executed): T-AY-018 (the gate — full verify + lightningcss
                          build:web + draft next PR) + T-AY-017 (HUMAN final parity sign-off, 👤). DID NOT
                          run verify/build/build:web/docs:api; DID NOT push. Next agent: parent (T-AY-018
                          gate, then present T-AY-017 to the human + open — do NOT merge — next→develop).
2026-05-27 (reviewer): /spec:review done. REVIEW-AY-001 + TRACE-AY-001 complete. VERDICT:
                          APPROVE-WITH-NITS — 0 critical/high/medium findings; 2 low doc-sync nits.
                          VERIFIED read-only: all 6 rule groups RG-1..RG-6 present + ordered in
                          src/ui/styles/accessibility.css (.specorator-root-scoped, ASCII comments,
                          system colours only inside forced-colors, RG-5 reuses --sp-focus-ring/
                          --sp-shadow-focus-ring — no new token); registered as 3rd CSS import at BOTH
                          sites (plugin/main.ts:3 + ui/main.ts:15). Ran the 2 CSS suites (15 green) +
                          tests/ui/a11y/ (40 green / 8 files). ADDITIVITY CONFIRMED: git diff next..HEAD
                          under src/ = EXACTLY accessibility.css + plugin/main.ts + ui/main.ts +
                          NoticeLiveRegion.vue (+ a test-only obsidian Modal stub); manifest.json +
                          all locales byte-identical (empty diff). WCAG 2.2 AA met at the automatable
                          level (focus-visible SC2.4.7, modal trap/restore SC2.1.2/2.4.3, forced-colors
                          SC1.4.x, reduced-motion SC2.3.3, status messages SC4.1.3, name/role/value);
                          visual conformance = the human leg. ARCH: no new port/InjectionKey/ADR;
                          NoticeLiveRegion is pure Vue on the sp:notice channel (no obsidian import);
                          no v-html/innerHTML; token discipline holds. Brand review: not-applicable.
                          NITS (non-blocking): R-AY-001 (stage frontmatter in impl-log/test-plan/
                          workflow-state lagged actual progress — partly fixed here), R-AY-002
                          (test-plan §4 RG-4 selector table still lists the corrected placeholders).
                          REQ-AY-017 (human final parity sign-off) recorded PENDING as the single final
                          epic gate. Hand-off → release-manager: run T-AY-018 (full verify + build:web
                          lightningcss + both-output presence + coverage 80/70/80/80), fold R-AY-001/002,
                          then PRESENT (do NOT merge) the next→develop PR + surface REQ-AY-017 to the human.
```
