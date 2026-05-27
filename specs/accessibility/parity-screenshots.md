---
id: PARITY-AY-001
title: Accessibility (P12, FINAL phase) — cross-surface parity-screenshot matrix (the human TEST-AY-017 sign-off artifact)
stage: tasks
feature: accessibility
area: AY
epic: claudian-reboot
phase: P12
status: complete        # matrix structurally complete (T-AY-016 / TEST-AY-016 green); Specorator + a11y-condition cells filled + judged at the human final gate (T-AY-017)
owner: dev
reference: D:\Projects\claudian-main   # MIT, read-only parity reference
satisfies:
  - REQ-AY-016          # parity-screenshots.md scaffold (the all-surfaces matrix)
  - REQ-AY-017          # the single FINAL epic gate — the human sign-off (TEST-AY-017)
  - NFR-AY-001          # cross-surface a11y judgment (visual forced-colors + reduced-motion)
created: 2026-05-27
updated: 2026-05-27
---

# Parity screenshots — Accessibility (P12, the FINAL phase)

This is the **human TEST-AY-017 final-sign-off artifact** (the single FINAL epic gate, REQ-AY-017 —
constitution Art. VII). It lists **every charter §3 surface** at the three charter widths
(**320 / 520 / 720 px**) in **both themes** (light + dark), each side by side with its **claudian
baseline**. The completeness of this matrix (every required row/cell slot) is what TEST-AY-016 checks
deterministically; the **visual judgment** (forced-colors + reduced-motion rendering, parity with the
claudian baseline) is the **human's** at T-AY-017 — **never** agent-self-claimed.

> **This matrix is complete and structurally checked (T-AY-016 / TEST-AY-016).** Every charter §3
> surface is listed at 320/520/720 px in light + dark, each paired with its `Baseline (claudian)`
> reference (captured from `D:\Projects\claudian-main` at the matching width/theme). The `Specorator`
> capture columns and the two a11y-condition columns (`reduced-motion` / `forced-colors`) are left for
> the human reviewer to populate + judge at the final epic gate (T-AY-017) — the visual sign-off no
> automatable test replaces (NFR-AY-001, constitution Art. VII). The automatable suite
> (TEST-AY-001..016) ships under the verify gate; this matrix is the human leg. The completeness of the
> row/cell structure (every surface × width × theme slot present) is what TEST-AY-016 asserts
> deterministically.

Legend: ☐ = not yet captured. Each surface is captured **per theme × per width** for default render,
plus the two a11y-condition columns (`prefers-reduced-motion: reduce` and `forced-colors: active`)
that carry the visual judgment no automatable test replaces.

## Surface × width × theme matrix (default render)

| Charter surface (§3) | Baseline (claudian) | 320 L | 320 D | 520 L | 520 D | 720 L | 720 D |
|---|---|---|---|---|---|---|---|
| §3.1 Chat conversation surface (streaming messages, message renderers) | `MessageRenderer` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.1 Tool-call rendering (collapsible input/result) | `ToolCallRenderer` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.1 Write/Edit rendering (word-level diff) | `WriteEditRenderer` / `DiffRenderer` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.1 Thinking blocks (collapsible) | `ThinkingBlockRenderer` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.1 Todo list rendering | `TodoListRenderer` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.1 Subagent rendering + lifecycle | `SubagentRenderer` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.1 Inline interactive blocks (ask-user / exit-plan / plan-approval) | `InlineAskUserQuestion` etc. | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.2 Multi-tab strip + numbered badges | `TabBar` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.2 History / resume drop-up | `ResumeSessionDropdown` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.2 Fork-target modal | `ForkTargetModal` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.2 Rewind / checkpoint menu | rewind menu | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.2 Compacted-boundary divider | `context_compacted` boundary | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.3 Composer / input + auto-resize textarea | `InputController` / `InputToolbar` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.3 Slash `/` + Skills `$` dropdown | `SlashCommandDropdown` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.3 `@mention` dropdown | `MentionDropdownController` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.3 Instruction-mode `#` confirm | `InstructionConfirmModal` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.3 Plan-mode toggle / bang-bash `!` | `plan-mode` / `BangBashModeManager` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.4 File context / chips | `FileChipsView` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.4 Image context / embed / modal | `ImageContext` / image-modal | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.4 External context + selection controllers | `SelectionHighlight` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.4 Inline Edit modal (word-level diff) | `InlineEditModal` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.5 Input toolbar widgets (model/mode/permission/thinking/tier/MCP/usage meter) | input toolbar strip | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.6 Provider consent modal | `ProviderConsentModal` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.7 MCP server modal + test modal | `McpServerModal` / `McpTestModal` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.8 Settings shell (provider tabs, env snippet manager) | settings shell | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| §3.9 Delete-confirm modal | `DeleteConfirmModal` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

## A11y-condition columns (the visual judgment — the human T-AY-017 leg)

For each surface above, the human reviewer also captures the two a11y-condition renderings that carry
the judgment no automatable test replaces (NFR-AY-001):

| Charter surface (§3) | reduced-motion (L) | reduced-motion (D) | forced-colors (L/HCM) | forced-colors (D/HCM) |
|---|---|---|---|---|
| §3.1 Chat conversation surface | ☐ | ☐ | ☐ | ☐ |
| §3.1 Tool-call / Write-Edit / Thinking / Todo / Subagent renderers | ☐ | ☐ | ☐ | ☐ |
| §3.1 Inline interactive blocks | ☐ | ☐ | ☐ | ☐ |
| §3.2 Tab strip + history / fork / rewind / compact | ☐ | ☐ | ☐ | ☐ |
| §3.3 Composer + slash / mention / instruction / plan / bang-bash | ☐ | ☐ | ☐ | ☐ |
| §3.4 File / image chips + external context + inline edit | ☐ | ☐ | ☐ | ☐ |
| §3.5 Input toolbar widgets (toggle / pills / usage meter) | ☐ | ☐ | ☐ | ☐ |
| §3.6 / §3.7 Provider consent + MCP modals | ☐ | ☐ | ☐ | ☐ |
| §3.8 / §3.9 Settings shell + delete-confirm modal | ☐ | ☐ | ☐ | ☐ |

## Accumulated P5–P11 manual-Obsidian legs (converge here — charter §5.5)

The per-phase manual-Obsidian screenshot legs (P5 modals, P7 providers, P8 MCP, P9 approvals, P10
settings shell, P11 locales) converge at this final gate; the human reviewer confirms each at parity
alongside the cross-surface a11y judgment above. T-AY-017 records the maintainer's recorded
acceptance of the populated matrix + the accumulated manual legs as the close of the P0-P12 epic.
