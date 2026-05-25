---
id: PARITY-CP-001
title: Composer Power (P4) — Parity Screenshots (baseline skeleton)
stage: review
feature: composer-power
area: CP
epic: claudian-reboot
phase: P4
status: skeleton
owner: human (final epic-review gate)
reference: D:\Projects\claudian-main
created: 2026-05-25
updated: 2026-05-25
---

# Parity Screenshots — Composer Power (P4)

Per-sub-surface × charter widths (320 / 520 / 720 px) × light/dark. The
**baseline** column is captured from `D:\Projects\claudian-main` pre-impl (this
skeleton). The **Specorator** column is filled at the single final epic-review
human gate (NFR-CP-011, charter §5). Not captured in CI — recorded here for the
autonomous-drive final review.

## Sub-surfaces

| Sub-surface | Claudian source |
|---|---|
| Slash/skills palette (drop-UP `/` / `$`) | `shared/components/SlashCommandDropdown.ts` |
| Mention palette (`@`, two-line agent/MCP rows) | `shared/mention/MentionDropdownController.ts` |
| Instruction mode placeholder + `InstructionConfirmModal` | `shared/modals/InstructionConfirmModal.ts` |
| Plan-mode indicator (teal PLAN) + plan border | `features/plan-mode.css`, `InputToolbar.ts` |
| Inline ask-user block | `features/chat/rendering/InlineAskUserQuestion.ts` |
| Inline exit-plan block | `features/chat/rendering/InlineExitPlanMode.ts` |
| Inline plan-approval block | `features/chat/rendering/InlinePlanApproval.ts` |
| Bang-bash mono mode + output block | `features/chat/services/BangBashService.ts` |

## Matrix (baseline = claudian-main; Specorator = final review)

| Sub-surface | Width | Theme | Baseline | Specorator |
|---|---|---|---|---|
| Slash/skills palette | 320 | light | _capture_ | _final review_ |
| Slash/skills palette | 320 | dark | _capture_ | _final review_ |
| Slash/skills palette | 520 | light | _capture_ | _final review_ |
| Slash/skills palette | 520 | dark | _capture_ | _final review_ |
| Slash/skills palette | 720 | light | _capture_ | _final review_ |
| Slash/skills palette | 720 | dark | _capture_ | _final review_ |
| Mention palette | 320 | light | _capture_ | _final review_ |
| Mention palette | 320 | dark | _capture_ | _final review_ |
| Mention palette | 520 | light | _capture_ | _final review_ |
| Mention palette | 520 | dark | _capture_ | _final review_ |
| Mention palette | 720 | light | _capture_ | _final review_ |
| Mention palette | 720 | dark | _capture_ | _final review_ |
| Instruction mode + confirm | 320 | light | _capture_ | _final review_ |
| Instruction mode + confirm | 320 | dark | _capture_ | _final review_ |
| Instruction mode + confirm | 520 | light | _capture_ | _final review_ |
| Instruction mode + confirm | 520 | dark | _capture_ | _final review_ |
| Instruction mode + confirm | 720 | light | _capture_ | _final review_ |
| Instruction mode + confirm | 720 | dark | _capture_ | _final review_ |
| Plan-mode indicator + border | 320 | light | _capture_ | _final review_ |
| Plan-mode indicator + border | 320 | dark | _capture_ | _final review_ |
| Plan-mode indicator + border | 520 | light | _capture_ | _final review_ |
| Plan-mode indicator + border | 520 | dark | _capture_ | _final review_ |
| Plan-mode indicator + border | 720 | light | _capture_ | _final review_ |
| Plan-mode indicator + border | 720 | dark | _capture_ | _final review_ |
| Inline ask-user block | 320 | light | _capture_ | _final review_ |
| Inline ask-user block | 320 | dark | _capture_ | _final review_ |
| Inline ask-user block | 520 | light | _capture_ | _final review_ |
| Inline ask-user block | 520 | dark | _capture_ | _final review_ |
| Inline ask-user block | 720 | light | _capture_ | _final review_ |
| Inline ask-user block | 720 | dark | _capture_ | _final review_ |
| Inline exit-plan block | 320 | light | _capture_ | _final review_ |
| Inline exit-plan block | 320 | dark | _capture_ | _final review_ |
| Inline exit-plan block | 520 | light | _capture_ | _final review_ |
| Inline exit-plan block | 520 | dark | _capture_ | _final review_ |
| Inline exit-plan block | 720 | light | _capture_ | _final review_ |
| Inline exit-plan block | 720 | dark | _capture_ | _final review_ |
| Inline plan-approval block | 320 | light | _capture_ | _final review_ |
| Inline plan-approval block | 320 | dark | _capture_ | _final review_ |
| Inline plan-approval block | 520 | light | _capture_ | _final review_ |
| Inline plan-approval block | 520 | dark | _capture_ | _final review_ |
| Inline plan-approval block | 720 | light | _capture_ | _final review_ |
| Inline plan-approval block | 720 | dark | _capture_ | _final review_ |
| Bang-bash mode + output | 320 | light | _capture_ | _final review_ |
| Bang-bash mode + output | 320 | dark | _capture_ | _final review_ |
| Bang-bash mode + output | 520 | light | _capture_ | _final review_ |
| Bang-bash mode + output | 520 | dark | _capture_ | _final review_ |
| Bang-bash mode + output | 720 | light | _capture_ | _final review_ |
| Bang-bash mode + output | 720 | dark | _capture_ | _final review_ |

> Baseline captures land under `specs/composer-power/parity/baseline/`; Specorator
> captures under `specs/composer-power/parity/specorator/` at the final gate.
> Perceptual parity (theme-derived `--sp-*` tokens), not byte-parity.
