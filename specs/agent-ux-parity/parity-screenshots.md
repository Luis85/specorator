---
feature: agent-ux-parity
area: AUX
stage: testing
status: draft
owner: qa
last_updated: 2026-05-22
requirement: REQ-AUX-017
task: T-AUX-355
---

# Parity screenshot checklist — Agent Sidepanel UX Parity

> Gate artefact for **T-AUX-355**. Capture a manual side-by-side comparison of
> Specorator's agent sidepanel against the Claudian reference at three
> representative breakpoints. The actual `.png` capture is a **manual followup**
> performed by a human reviewer with both plugins installed in the same vault;
> this document is the checklist + acceptance contract.

## 1. Setup

1. Open a single Obsidian vault with **both** Specorator (branch
   `feature/aux-ws-10-storybook-parity-bundle`) and Claudian (current release)
   enabled.
2. Toggle the system theme to **dark** (default audit pass).
3. Snap the right sidebar to each of the three target widths via the resize
   handle; verify against the browser inspector pixel readout.
4. Capture at 1× DPI (no Retina up-scale). Save under
   `specs/agent-ux-parity/screenshots/<screen>-<breakpoint>.png`.

## 2. Breakpoints

| Breakpoint | Target width | Driving spec |
|---|---|---|
| Narrow | ~320 px | spec §8 edge case "Narrow sidepanel <300 px" — `FloatingNavSidebar.visible = false`, composer toolbar wraps to two rows. |
| Mid | ~520 px | Default; primary daily-use width. |
| Wide | ~720 px | spec §8 edge case "Wide sidepanel ≥720 px" — `FloatingNavSidebar` always visible. |

## 3. Screens to capture

For each screen × breakpoint cell (18 captures total — 6 screens × 3 widths)
write `[ ]` or `[x]` to mark complete; attach the filename when added.

### 3.1 Welcome (empty thread)

- [ ] `welcome-320.png` — empty-thread `WelcomeGreeting` + suggestion chips; verify hour-banded greeting, serif `--sp-font-serif` (Copernicus stack), no dashed tile grid. (REQ-AUX-007)
- [ ] `welcome-520.png`
- [ ] `welcome-720.png`

### 3.2 Transcript with bubbles

- [ ] `transcript-320.png` — at least one user + one assistant message; verify user-bubble asymmetric `border-end-end-radius`, assistant-bubble transparent full-width, `[data-role]` differentiation. (REQ-AUX-005)
- [ ] `transcript-520.png`
- [ ] `transcript-720.png`

### 3.3 Composer toolbar

- [ ] `composer-320.png` — verify InputToolbar slot order `model · mode · permission · thinking · mcp · context-meter · send` (REQ-AUX-004); ContextMeter donut visible; McpIndicator zap + count visible when MCP active.
- [ ] `composer-520.png`
- [ ] `composer-720.png`

### 3.4 Status panel (during stream)

- [ ] `status-320.png` — StatusPanel grouped with composer inside `.sp-composer-group` (REQ-AUX-011); TodoList + BashHistoryList rendered; `TransportStatusPill` if degraded.
- [ ] `status-520.png`
- [ ] `status-720.png`

### 3.5 Approval card

- [ ] `approval-320.png` — `InlineApprovalCard` with single-tab single-resource case; Deny button has default focus (SPEC-MPS-001 §8.4); items prefixed with `▌`. (REQ-AUX-021)
- [ ] `approval-520.png`
- [ ] `approval-720.png`

### 3.6 Popovers (help + slash + mention)

- [ ] `popovers-320.png` — open `HelpPopover` (`/help`); verify search input + arrow-nav active row + sr-only result count. (REQ-AUX-020)
- [ ] `popovers-520.png` — open `SlashCommandPopover` (`/`); verify `SpDropdownPanel` shell + backdrop blur.
- [ ] `popovers-720.png` — open `MentionDropdown` (`@`); verify same primitive.

## 4. Acceptance criteria

For each capture compare against the Claudian reference and flag any of:

- Brand-color mis-match (Specorator should use `--sp-brand` per
  `[data-provider]`; Claudian uses a fixed orange).
- Hover-action reveal pattern (Specorator uses `HoverActions` opacity transition;
  Claudian shows static action row). **Diff is expected — log, do not flag.**
- Icon-set drift (Specorator uses Lucide via IconPort; Claudian uses Obsidian
  internals).
- Logical-property vs physical-property layout (Specorator must use logical;
  Claudian is mixed). **Diff is expected — log, do not flag.**

Findings logged inline below the relevant row. Critical visual regressions
escalate to a CQ for the reviewer stage.

## 5. Known limitations

- Capture cannot be automated in CI because Storybook stories do not exhaust
  the full sidepanel composition (router, store wiring, provider switch are
  AgentSidepanelRoot-only). Playwright tier is out of scope for this feature.
- Forced-colors / high-contrast capture deferred to the WCAG 2.2 AA audit
  (T-AUX-349) — see `test-report.md`.

## 6. Status

Checklist authored 2026-05-22 (qa, WS-AUX-10). Manual capture pass deferred
to release-stage reviewer.
