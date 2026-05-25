---
id: PARITY-CA-001
title: Context & Attachments (P5) — parity screenshot matrix
stage: implementation
feature: context-attachments
area: CA
epic: claudian-reboot
phase: P5
owner: dev (baseline scaffold) / human (capture + Specorator column)
reference: D:\Projects\claudian-main
created: 2026-05-25
updated: 2026-05-25
---

# Parity screenshots — Context & Attachments (P5)

Per T-CA-001 (NFR-CA-007 baseline leg) this is the per-sub-surface × width ×
theme matrix the single final epic-review human gate (TEST-CA-M2) fills in. The
**baseline** column captures `D:\Projects\claudian-main`; the **Specorator**
column is filled at the final review (autonomous-drive — no per-phase human
checkpoint). Agents never self-claim a parity row.

Charter widths: **320 / 520 / 720 px**; themes: **light + dark**.

The four P5 sub-surfaces (charter §5 / NFR-CA-007):

1. **File-context chips + wikilink row** — `file-context/view/FileChipsView.ts`, `utils/fileLink.ts`.
2. **Image thumbnail bar + full-size image modal** — `ImageContext.ts`, `utils/imageEmbed.ts`, image-modal css.
3. **Selection indicator chip + in-editor selection highlight** — the selection controllers, `SelectionHighlight.ts`.
4. **Inline-edit prompt → querying → word-diff preview → accept/reject** — `features/inline-edit/ui/InlineEditModal.ts`.

## Sub-surface 1 — File-context chips + wikilink row

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Sub-surface 2 — Image thumbnail bar + full-size image modal

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Sub-surface 3 — Selection indicator chip + in-editor highlight

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Sub-surface 4 — Inline-edit prompt → querying → word-diff → accept/reject

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

> **Note:** the baseline capture is a human-run leg (requires running
> `claudian-main` in Obsidian); the scaffold above is the agent deliverable for
> T-CA-001. Captures + the Specorator column ride the single final epic-review
> gate (TEST-CA-M2).
