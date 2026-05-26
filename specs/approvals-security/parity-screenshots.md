---
id: PARITY-AS-001
title: Approvals & Security (P7) — parity screenshot matrix
stage: implementation
feature: approvals-security
area: AS
epic: claudian-reboot
phase: P7
owner: dev (baseline scaffold) / human (capture + Specorator column)
reference: D:\Projects\claudian-main
created: 2026-05-26
updated: 2026-05-26
---

# Parity screenshots — Approvals & Security (P7)

Per T-AS-001 (NFR-AS-012 baseline leg) this is the per-surface × width × theme
matrix the single final epic-review human gate (TEST-AS-M2) fills in. The
**baseline** column captures `D:\Projects\claudian-main`; the **Specorator**
column is filled at the final review (autonomous-drive — no per-phase human
checkpoint). Agents never self-claim a parity row.

Charter widths: **320 / 520 / 720 px**; themes: **light + dark**.

## Baseline reference (claudian-main)

The P7 approval surfaces map to `D:\Projects\claudian-main`:

- **`ApprovalManager` matching semantics** — `src/core/security/ApprovalManager.ts`:
  - `getActionPattern` (`:13`) — Bash → `input.command.trim()` (or `''`);
    Read/Write/Edit → `input.file_path` or `null`; NotebookEdit →
    `input.notebook_path ?? input.file_path` or `null`; Glob/Grep →
    `input.pattern` or `null`; default → `JSON.stringify(input)`.
  - `getActionDescription` (`:35`) — "Run command: …" (Bash), "Read file: …",
    "Write to file: …", "Edit file: …", "Search files matching: …" (Glob),
    "Search content matching: …" (Grep), else "{tool}: {pattern}"; a `null`
    pattern renders `(unknown)`.
  - `matchesRulePattern` (`:60`) — no rule pattern → match-all `true`; null action +
    content rule → `false`; `\`→`/` normalise (`:71`); `'*'` → `true`; exact → `true`;
    Bash explicit-wildcard only (`":*"` colon form `:87`, `"*"` space form `:92`; a
    bare prefix never matches `:96`); file `isPathPrefixMatch` (`:116`);
    other-tool simple prefix (`:111`).
  - `isPathPrefixMatch` (`:116`) — `startsWith` + (trailing `/` subtree `:121` OR
    equal length `:125` OR the char at `rule.length` is `/` `:129`).
  - `matchesBashPrefix` (`:132`) — exact OR (prefix ends with space) `startsWith(prefix)`
    OR `startsWith(prefix + ' ')`.
- **The approval decision flow** — `src/providers/claude/runtime/ClaudeApprovalHandler.ts`:
  the `CanUseTool` callback (mode/allowedTools gate → exit-plan → ask-user →
  approval → decision), the cancel `{behavior:'deny',interrupt:true}` (`:114`), the
  plan-exit `setMode destination:'session'` (`:63–71`).
- **The persisted-rule destination + the SDK mapping** —
  `src/providers/claude/security/ClaudePermissionUpdates.ts` (`:11–12` session-vs-project
  destination, `:30–31` `behavior:'allow'` + the `if (pattern && !pattern.startsWith('{'))`
  JSON-fallback guard), `resolveSDKPermissionMode`
  (`yolo`↔`bypassPermissions` / `plan`↔`plan` / `normal`↔`default`).
- **The three-mode set** — `src/core/types/settings.ts:76`
  (`PermissionMode = 'yolo' | 'plan' | 'normal'`).
- **The running/approval styling** — `permission-toggle.css` (the three-mode control +
  the PLAN display special-case + the active-mode fill) and `status-panel.css` (the
  running/approval row state + the rule-list spacing).

Each surface carries a stable `data-testid` in the Specorator port
(`toolbar-permission`, `toolbar-permission-plan`, `toolbar-permission-option`,
`inline-approval`, `inline-approval-option`, `inline-approval-deny-always`,
`approvals-panel`, `approvals-mode`, `approvals-rule`, `approvals-rule-remove`,
`approvals-empty`).

## Surface 1 — Permission toggle, mode = normal

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `permission-toggle.css` normal pill_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 2 — Permission toggle, mode = yolo

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `permission-toggle.css` yolo pill_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 3 — Permission toggle, mode = plan (PLAN label special-case)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `permission-toggle.css` PLAN label_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 4 — Inline approval block, four-option row (Allow once · Always allow · Deny once · Always deny)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `ClaudeApprovalHandler` option row_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 5 — Approvals panel (allow/deny × persisted/session mix + empty state)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `status-panel.css` rule list + empty_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 6 — Auto-decided turn (no prompt rendered)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — auto-allow/auto-deny, block absent_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |
