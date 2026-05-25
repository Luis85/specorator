---
id: PARITY-TS-001
title: Threads & Sessions (P3) — parity-screenshot matrix (baseline scaffold)
stage: tasks
feature: threads-sessions
area: TS
epic: claudian-reboot
phase: P3
status: scaffold        # baseline column captured pre-impl; Specorator column filled at the final review
owner: dev
reference: D:\Projects\claudian-main   # MIT, read-only parity reference
satisfies:
  - NFR-TS-012          # per-surface parity-screenshot capture (charter §5)
  - NFR-TS-001          # deleted-symbol guard verification (T-TS-001 lint leg)
created: 2026-05-25
updated: 2026-05-25
---

# Parity screenshots — Threads & Sessions (P3)

Per the charter §5 / NFR-TS-012 parity discipline, the seven P3 sub-surfaces are captured at the
three charter widths (320 / 520 / 720 px), light + dark, against the `D:\Projects\claudian-main`
baseline. This file is the **baseline scaffold** (T-TS-001): the `Baseline` column is captured pre-impl
from claudian-main; the `Specorator` column is filled at the single final epic-review human gate
(T-TS-040/041) — **never** self-claimed by an agent (it is a visual judgment task).

> Capture is a **human-owned** leg. The implementation batches (domain/infra/application/UI) do not
> fill the Specorator column; they only ensure the scaffold exists so the baseline is recorded before
> code lands.

## Sub-surface × width × theme matrix

| Sub-surface | claudian-main reference | 320px L | 320px D | 520px L | 520px D | 720px L | 720px D |
|---|---|---|---|---|---|---|---|
| Numbered square tab badges + border-colour state machine | `TabBar` / tab badge | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Drop-UP blurred history menu | `ResumeSessionDropdown` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Resume row (per-conversation) | history list row | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Fork-target modal | fork modal | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Two-mode rewind menu | rewind menu | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Compacted-boundary divider | `context_compacted` boundary | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Title-gen spin | title pending/spinner | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

Legend: ☐ = not yet captured. Baseline cells are filled by the human capturing claudian-main at the
matching width/theme; Specorator cells are filled at the final review (T-TS-040/041).

## Deleted-symbol guard verification (T-TS-001 lint leg, NFR-TS-001)

Confirmed against `eslint.config.js` on branch `feature/threads-sessions` (commit at T-TS-001): neither
`DELETED_SUBSYSTEM_BAN.group` nor `DELETED_INJECTION_KEYS.importNames` lists any P3 symbol —

- `PROVIDER_HISTORY_PORT` — **not** in `DELETED_INJECTION_KEYS.importNames`.
- `ProviderHistoryPort` / `@/domain/ports/ProviderHistoryPort` — **not** in `DELETED_SUBSYSTEM_BAN.group`.
- `ConversationRecord` / `@/domain/chat/ConversationRecord` — `@/domain/chat` regrew in P1 and is off
  the ban list; the new path matches no ban glob.
- `@/infrastructure/history/**` (the pure codec) and `@/infrastructure/obsidian/history/**` (the vault
  store) — match no ban glob (the obsidian ban globs are `Claude*` / `Cursor*` / `ObsidianMcp*` etc.,
  not `history/**`).

So **no guard-relaxation task is required in P3** (verified — see `tasks.md` deleted-symbol-guard note).
The full lint pass that exercises the new key/port imports lands with T-TS-004 (the barrel + key) and
T-TS-008/010/011 (the codec + stores). This file records the pre-impl confirmation.
