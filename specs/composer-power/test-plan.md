---
id: TEST-PLAN-CP-001
title: Composer Power (P4) — Test Plan
stage: testing
feature: composer-power
area: CP
epic: claudian-reboot
phase: P4
status: in-progress
owner: qa
integration_branch: next
created: 2026-05-25
updated: 2026-05-25
---

# Test Plan — Composer Power (P4)

Tracks the TEST-CP-001..028 automatable scenarios + the two manual legs (M1/M2)
against TASKS-CP-001 / SPEC-CP-001..038. U = unit, A = component, M = manual.

## Deleted-symbol guard verification (T-CP-001, NFR-CP-002)

The three new InjectionKeys (`MENTION_DATA_PROVIDER_PORT` /
`PROVIDER_COMMAND_CATALOG_PORT` / `SHELL_EXEC_PORT`) and the new domain/app/ui
paths are **not** caught by the `eslint.config.js` `DELETED_SUBSYSTEM_BAN` /
`DELETED_INJECTION_KEYS` guard — verified against the ban globs:

- `DELETED_SUBSYSTEM_BAN` lists `@/infrastructure/obsidian/Claude*` / `Cursor*` /
  `ObsidianMcp*` / `ObsidianCli*` / `ObsidianMetadataCache*` / `ObsidianCanvas*` /
  `ObsidianSecretStore*` / `ObsidianConfirmModal*` / `ObsidianMarkdownRender*` /
  `mcp/**`. The new `@/infrastructure/obsidian/ObsidianShellExec` and the
  `ObsidianMentionDataProvider` / `ObsidianProviderCommandCatalog` paths match
  **none** of these globs (`ObsidianShell*` / `ObsidianMention*` /
  `ObsidianProviderCommand*` are not banned).
- The new domain/application paths (`@/domain/chat/inline/**`,
  `@/domain/chat/composer/**`, `@/domain/ports/{MentionDataProviderPort,
  ProviderCommandCatalogPort,ShellExecPort}`, `@/application/chat/composer/**`)
  match no ban glob (`@/domain/chat` regrew in P1).
- `DELETED_INJECTION_KEYS` does not contain the three new keys.

`npm run lint` over the new domain/infra surface passes clean — no guard
relaxation task is required (verified by the dev DOMAIN+INFRA batch).

## Automatable scenarios (status by batch)

| TEST | Type | Owner | Status (DOMAIN+INFRA batch) |
|---|---|---|---|
| TEST-CP-001 | U | qa | green — `StreamChunk` additivity (T-CP-002/004) |
| TEST-CP-002 | U | qa | green — `ChatRuntimePort` additivity (T-CP-002/005/006) |
| TEST-CP-003 | U | qa | green — `MentionDataProviderPort` shape + Mock fixtures (T-CP-005/007/008/009) |
| TEST-CP-004 | U | qa | green — inline-block DTOs (T-CP-002/003) |
| TEST-CP-005 | U | qa | green — catalog/shell port shapes + `appendInstruction` (T-CP-005/007) |
| TEST-CP-006 | U | qa | green — `ComposerMode` value types (T-CP-002/004) |
| TEST-CP-012 | U | qa | green — Mock catalog request-id-guard backing (T-CP-008/009) |
| TEST-CP-016 | U | qa | green — LocalStorage shell err + fixtures (T-CP-010/011) |
| TEST-CP-020 | U | qa | backing green — Mock capable runtime (T-CP-008/009) |
| TEST-CP-024 | U/A | qa | backing green — Mock non-capable runtime (T-CP-008/009) |
| TEST-CP-028 | U | qa | green — Mock no-spawn ShellExec (T-CP-008/009) |
| TEST-CP-026 | A | qa | green — composer-mode composables + both-entry-point provides + mount (T-CP-029/030/048/049); **dev leg PASS 2026-05-25** — standalone smoke (`tests/ui/main.ts.test.ts`): `/`→slash dropdown, `@`→mention dropdown, Shift+Tab→PLAN indicator (capable mock), `!echo hi`+Enter→scripted-echo output block (T-CP-050) |
| TEST-CP-027 | grep+mount | qa | green — provider-addressed grep-gate hook + the mount leg (T-CP-025/026/048); the full `provider === 'claude'` grep gate runs at T-CP-053 |
| TEST-CP-007..011, 013..015, 017..025 | U/A | qa | green — APPLICATION/UI batches (T-CP-015..046) |

## Manual legs (M — coverage-excluded Obsidian production bridge)

Recorded for the single final epic-review human gate (autonomous drive). Never
self-claimed by an agent.

### TEST-CP-M1 — `ObsidianBridge` mention + catalog providers (SPEC-CP-007)

In a real Obsidian vault:
- `@` lists real vault files/folders via `VaultPort.listFiles`/`listFolders`.
- `/` lists real `<vault>/.claude/commands/**/*.md` entries.
- `$` lists real `<vault>/.claude/skills/**/SKILL.md` entries.
- an absent `.claude` folder lists only built-ins (`getEntries → []`).

Backed automatically by the Mock fixtures (TEST-CP-012) + LocalStorage fixtures
(TEST-CP-016). One-line S1 grep: `child_process`/`node:*` imported only in
`ObsidianShellExec.ts` + `ClaudeCliChatRuntime.ts`.

### TEST-CP-M2 — `ObsidianBridge` `ShellExec` + real-CLI inline-response honesty (SPEC-CP-008/011/027/033)

In a real Obsidian vault on desktop:
- a `!cmd` runs verbatim under the vault `cwd` (`FileSystemAdapter.getBasePath()`);
  surfaces stdout/stderr + exit code as a block; non-zero exit → `ok` with the
  code; spawn failure → `err`; timeout/maxbuffer → `exitCode 124` + `truncated`.
- the real `claude --print` CLI reports `supportsInlineResponse: false`, so an
  emitted ask-user/exit-plan/approval block renders **read-only** + a notice (the
  honest gated state).
- `InstructionConfirmModal` renders + resolves (accept appends to the system
  prompt, reject persists nothing) with **no `window.confirm`/`prompt`**.

S1 grep (noted): `node:child_process` is imported only in `ObsidianShellExec.ts`
and the existing `ClaudeCliChatRuntime.ts` — confirmed by
`Grep "node:child_process" src/`.
