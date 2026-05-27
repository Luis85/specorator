---
feature: accessibility
area: AY
current_stage: requirements
status: active
last_updated: 2026-05-27
last_agent: orchestrator (bootstrap)
epic: claudian-reboot
phase: P12
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.9/§3.10/§4 P12 + audits + claudian-main accessibility.css stand in)
  research.md: skipped
  requirements.md: pending
  design.md: pending
  spec.md: pending
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — accessibility (P12, FINAL phase)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
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
```
