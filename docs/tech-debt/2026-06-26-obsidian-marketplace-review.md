---
title: Obsidian marketplace review triage
date: 2026-06-26
status: resolved
scope: marketplace-submission
---

## Scorecard

| Category | Status | Notes |
|----------|--------|-------|
| Behavior warnings | ✅ disclosed | identity read is migration-only; `fs`/`child_process` are core to a CLI-spawning plugin |
| Lint Errors | ✅ fixed | + local guards now mirror the bot (see below) |
| Dependency advisory | ✅ patched | all high-severity cleared via `overrides`; MCP SDK held at 1.29.0 |
| Source-code warnings | ✅ fixed + locked | 22 hand-fixed, 101 assertions auto-cleaned, 9 type-aware rules promoted to error |
| Obsidian API deprecations | ⏸️ deferred | replacements are 1.13-only; adopting forces `minAppVersion` 1.11.5 → 1.13.0 |
| CSS | ✅ mostly fixed | `text-decoration` + 3 redundant `!important` removed; ~27 justified host/CM6 overrides kept |

Gate at close: `typecheck` ✓ · `lint` ✓ · 9069 tests ✓ · `build` ✓ · LOC ✓.

## Resolution (2026-06-26)

### Lint Errors — FIXED in code

| Error | Site | Fix |
|-------|------|-----|
| `Function` constructor / implied eval | `SpecoratorToolRegistry.ts:29` | Justified inline disable — user-tool sandbox evaluation IS the feature; input is the user's own vault file. Rules `no-new-func` + `@typescript-eslint/no-implied-eval` now enabled in `eslint.config.mjs` (src-only) to mirror the marketplace validator. |
| Undescribed directive | `EventBus.ts:12` | Removed: dropped the generic constraint so no `any` / no disable is needed. |
| Undescribed directive | `cursorHistoryStore.ts:258` | Added `-- reason` description (lazy `node:sqlite` require). |
| Disallowed disable of `no-explicit-any` | `EventBus.ts:12` | Removed — unconstrained `M` accepts interface event maps without `any`. |
| Disallowed disable of `sentence-case` | 11 sites | All inline disables removed. Product nouns (`Claude Code`, `Agent Board`, `Quick Actions`) whitelisted in the rule's `brands` config; preset-name desc lowercased to genuine prose; firstRunBanner span reordered so `<code>` ends the line. Exposed + fixed a real typo: "Claude code" → "Claude Code". |

Verified: `npm run typecheck` ✓, `npm run lint` ✓, EventBus unit tests ✓.

### Linter + pipeline tightened to catch regressions

So these findings fail `npm run lint` locally instead of resurfacing at the next
submission (CI `lint` job already runs `npm run lint`, blocking — no new job
needed). Added `@eslint-community/eslint-plugin-eslint-comments`; rules scoped to
`src/**/*.ts` to match the marketplace bot's scope:

| Guard | Rule | Mirrors finding |
|-------|------|-----------------|
| Every disable must justify itself | `eslint-comments/require-description` (error) | "Unexpected undescribed directive comment" |
| Can't silence the security/UI rules inline | `eslint-comments/no-restricted-disable` (error) — `no-explicit-any`, `sentence-case` | "Disabling X is not allowed" |
| Stale disables fail | `reportUnusedDisableDirectives` warn → error | (defense-in-depth) |
| Function constructor banned outside the sandbox | `no-new-func` + `no-implied-eval` (error, src only) | "Function constructor is dangerous" / "Implied eval" |

Verified each guard fires with the exact bot wording via a throwaway `src/` probe.
Policy documented in [`docs/build-ci/quality-gates.md`](../build-ci/quality-gates.md) § "Directive-comment discipline".

### Behavior warnings — DISCLOSURE (not code-fixable; capabilities are core)

These are `Warning` severity (reviewer disclosure), not `Error`. Each capability is intrinsic to a plugin that spawns provider CLIs and reads their native transcripts:

- **System identity (`os.hostname`)** — single site `utils/env.ts:362` (`getLegacyHostnameKey`). Migration-only: legacy per-device settings were keyed by hostname; the plugin already moved to an opaque random device key (`createOpaqueDeviceSettingsKey`). Hostname is read once to migrate old data, never transmitted. Fingerprint risk already mitigated. Removable after a deprecation window.
- **`fs` outside vault API** — required to read native CLI transcripts/configs under `~/.claude`, `~/.codex`, `~/.cursor` and to resolve CLI binaries on PATH. Routed through `HomeFileAdapter` / CLI resolvers.
- **`child_process`** — required to spawn the Claude/Codex/Cursor/Opencode CLIs and the `!`bash + git services. Child env is allowlisted via `providers/subprocessEnvironmentAllowlist`.

Action for submission: declare these three in the plugin README / submission notes with the justifications above.

### Dependency advisory — FIXED via `overrides`

All review-flagged advisories are transitive under `@modelcontextprotocol/sdk@1.29.0`
(the plugin is an MCP *client*; the vulnerable hono/express server paths aren't
exercised, but the bot flags the tree). Pinned to patched versions via
`package.json` `overrides`, holding the SDK at 1.29.0 — no breaking bump:

| Dep | Was | Now | Advisory |
|-----|-----|-----|----------|
| hono | 4.12.10 | ^4.12.27 | GHSA-26pp-8wgv-hjvm (+ ~20 others) |
| @hono/node-server | 1.19.12 | ^1.19.14 | GHSA-92pp-h63x-v22m |
| fast-uri | 3.1.0 | ^3.1.2 | GHSA-q3j6-qgpj-74h6 (high) |
| ip-address | 10.1.0 | ^10.2.0 | GHSA-v2v4-37r5-5v8g |
| qs | 6.15.0 | ^6.15.3 | GHSA-q8mj-m7cp-5q26 |
| ws (dev, jsdom) | 8.20.0 | ^8.21.0 | GHSA-58qx-3vcg-4xpx (high) |

Carets keep the SDK's expected majors (an initial `>=` pin wrongly pulled
@hono/node-server 2.x / fast-uri 4.x — reverted). **All high-severity cleared.**
`npm audit fix` was rejected: it skewed jest's internal monorepo versions
(`clearMocksOnScope is not a function`), breaking 41 test suites. `overrides` is
surgical — it touches only the vulnerable transitive deps, leaving the jest tree
untouched. Verified: typecheck ✓, lint ✓, build ✓, 9069 tests ✓.

Remaining 21 advisories (2 low, 19 moderate) are **dev-only** build/test tooling
(babel, esbuild, js-yaml via jest) — not bundled into `main.js`, not in the
marketplace scan. `js-yaml` needs `npm audit fix --force` (breaks ts-jest); deferred.

### Type-aware lint warnings — FIXED + locked

The review's `Source code` warning categories were enabled as `error` (src-only,
type-aware), the backlogs driven to zero, then locked per the ratchet policy:

| Rule | Count | Fix |
|------|-------|-----|
| `no-unnecessary-type-assertion` | 101 | Autofixed (removed redundant `as`). **Not** permanently enforced — false-positives on load-bearing DOM casts under ts@6 + tseslint@8 (3 files reverted: ChatDropController, TabBar, fileLink). One-time cleanup only. |
| `no-floating-promises` | 5 | `void` marker on fire-and-forget `runtime.cleanup()` / `revealLeaf`. |
| `no-misused-promises` | 4 | `forEach` arrow → block body; two `addEventListener` async handlers → `.then`; `Plugin.onunload` → sync `void`-IIFE teardown (Obsidian ignores its return). |
| `unbound-method` | 5 | Root cause was method-shorthand types (`foo(): void`) implying `this`; converted to property syntax (`foo: () => void`) on 4 interfaces — the recommended style. |
| `no-unsafe-assignment` | 3 | Typed the narrowed JSON array / catch param (`unknown`) / map element. |
| `await-thenable` | 2 | Dropped `await` on non-thenable `updatePlanModeUI`. |
| `no-unsafe-call` | 1 | Gave `new Function(...)` an explicit call signature. |
| `no-unsafe-return` | 1 | Typed the `.map` param `unknown`. |
| `no-deprecated` | 1 | `z.ZodTypeAny` → `z.ZodType`. |

Verified: typecheck ✓, lint ✓, build ✓, 9069 tests ✓, LOC guard ✓.

### Remaining (non-blocking, deferred)

- **Obsidian API deprecations** — DEFERRED (compat tradeoff, not a cleanup). Flagged:
  `display` → `getSettingDefinitions` (SpecoratorSettings ×4), `setDynamicTooltip`
  (GeneralTabSections), `setWarning` → `setDestructive` (AgentBoardLaneEditor,
  VaultTrustModal, dialogButtons). All are "Since 1.13.0"; the replacement APIs
  (`setDestructive`, `getSettingDefinitions`) are **1.13-only runtime methods**, absent
  from our installed `obsidian` 1.12.3 typings — which is why `no-deprecated` can't see
  them. Adopting them would require bumping `manifest.minAppVersion` 1.11.5 → 1.13.0,
  dropping 1.11.5–1.12.x users. The plugin deliberately targets 1.11.5 (SecretStorage).
  Revisit when the minimum app version is intentionally raised. `Recommendation` severity.
- **CSS lint** — PARTIALLY FIXED:
  - `text-decoration` partial support (file-link.css ×2): FIXED. Replaced the
    `text-decoration-color` longhand with `border-bottom` — universally supported,
    reproduces the same faint→bright underline, no visual change.
  - `!important` (~30): 3 removed (evidence-backed safe), ~27 kept (justified):
    - **Removed**: the three mode-border `!important` (plan-mode, instruction, bash) —
      proven redundant by specificity/source-order analysis (compound or later-defined
      selectors already beat the single-class base `.specorator-input-wrapper` border).
    - **Kept**: CodeMirror 6 inline-edit overrides (`inline-edit.css`), Obsidian textarea
      resets (`input.css` border/background/box-shadow), and visibility toggle utilities
      (`.specorator-hidden` etc.). These override host/CM6 styles — the exact case the
      project's own [`src/style/CLAUDE.md`](../../src/style/CLAUDE.md) policy permits
      (`!important` allowed "unless overriding Obsidian defaults" — these all do). Stripping
      them risks untested visual regressions in surfaces with no CSS test coverage.

---

## Behavior

- **Warning**: Plugin reads system identity information (hostname, user info, or environment variables)
  - Reading system identity information (os.hostname, os.userInfo, os.networkInterfaces, or identity-related environment variables) may be used to fingerprint the user's machine.
- **Warning**: **Direct Filesystem Access**: Uses the Node.js `fs` module to access the filesystem outside of the Obsidian vault API. Can read and write any file on the system.
- **Warning**: **Shell Execution**: Executes shell commands via `child_process`. Gives the plugin full control over the system.
- **Recommendation**: **Vault Enumeration**: Enumerates all files in the vault (`vault.getFiles`, `getMarkdownFiles`, etc.). Gives the plugin access to every file path in the vault.
- **Recommendation**: **Clipboard Access**: Reads or writes the system clipboard. May expose content copied from outside Obsidian.
- **Recommendation**: **Dynamic Code Execution**: Executes dynamically generated code via `eval()` or `new Function()`. Prevents full static analysis of plugin behavior.
- **Pass**: **Vault Read**: Reads individual vault files via the Obsidian API (`vault.read`, `vault.cachedRead`)
- **Pass**: **Vault Write**: Creates or modifies vault files via the Obsidian API (`vault.modify`, `vault.create`, etc.)

## Source code

- **Error**: Unexpected undescribed directive comment. Include descriptions to explain why the comment is necessary.
  - src/core/events/EventBus.ts:12, src/providers/cursor/history/cursorHistoryStore.ts:258
- **Error**: Disabling '@typescript-eslint/no-explicit-any' is not allowed.
  - src/core/events/EventBus.ts:12
- **Error**: Disabling 'obsidianmd/ui/sentence-case' is not allowed.
  - src/features/chat/SpecoratorView.ts:425, src/features/settings/firstRunBanner/FirstRunBanner.ts:30, src/features/settings/ui/AgentBoardSettingsSection.ts:49, src/features/settings/ui/AgentBoardSettingsSection.ts:53, src/features/settings/ui/AgentBoardSettingsSection.ts:69, src/features/settings/ui/AgentBoardSettingsSection.ts:84, src/features/settings/ui/AgentBoardSettingsSection.ts:104, src/features/settings/ui/AgentBoardSettingsSection.ts:131, src/features/settings/ui/AgentBoardSettingsSection.ts:135, src/features/settings/ui/QuickActionsSettingsTab.ts:15, src/features/tasks/ui/AgentBoardView.ts:161
- **Error**: Using the `Function` constructor is dangerous because it executes arbitrary code, similar to `eval()`
  - src/features/tools/SpecoratorToolRegistry.ts:29
- **Warning**: This assertion is unnecessary since it does not change the type of the expression.
  - src/app/environment/EnvironmentApplyService.ts:191, src/core/bootstrap/SessionStorage.ts:225, src/core/logging/redact.ts:59, src/core/logging/redact.ts:60, src/core/providers/secretEnvVars.ts:385, src/core/security/urlSafety.ts:357, src/core/usage/keys.ts:46, src/features/agents/roster/view/AgentDetailEditor.ts:181, src/features/agents/roster/view/AgentDetailEditor.ts:193, src/features/chat/controllers/ChatDropController.ts:57, src/features/chat/controllers/ChatDropController.ts:83, src/features/chat/controllers/StreamController.ts:755, src/features/chat/rendering/MessageActionBar.ts:132, src/features/chat/tabs/TabBar.ts:178-180, src/features/chat/tabs/tabModelPolicy.ts:31, src/features/chat/tabs/tabModelPolicy.ts:32, src/features/chat/tabs/tabModelPolicy.ts:33, src/features/chat/tabs/tabUi.ts:91, src/features/chat/tabs/tabUi.ts:92, src/features/quickActions/quickActionLastUsedStore.ts:64, src/features/quickActions/skills/skillIndexPersistence.ts:55, src/features/quickActions/skills/skillIndexPersistence.ts:55, src/features/quickActions/ui/QuickActionLaunchModal.ts:120, src/features/quickActions/ui/QuickActionLaunchModal.ts:181, src/features/settings/SpecoratorSettings.ts:570, src/features/settings/customModels/CustomModelsTable.ts:121-123, src/features/settings/customModels/CustomModelsTable.ts:127-129, src/features/settings/customModels/CustomModelsTable.ts:133-135, src/features/settings/firstRunBanner/FirstRunBanner.ts:22-24, src/features/settings/ui/AgentBoardSettingsSection.ts:20, src/features/settings/ui/AgentBoardSettingsSection.ts:20, src/features/settings/ui/AgentBoardSettingsSection.ts:153, src/features/tasks/commands/workOrderResolution.ts:25, src/features/tasks/commands/workOrderResolution.ts:27, src/features/tasks/commands/workOrderResolution.ts:29, src/features/tasks/defaultProviderResolver.ts:11, src/features/tasks/execution/ChatTabExecutionSurface.ts:43, src/features/tasks/execution/ChatTabExecutionSurface.ts:81, src/features/tasks/execution/TaskRunCoordinator.ts:118, src/features/tasks/ui/AgentBoardView.ts:327, src/features/tasks/ui/AgentBoardView.ts:391, src/features/tasks/ui/AgentBoardView.ts:840, src/features/tasks/ui/AgentBoardView.ts:841, src/features/tasks/ui/AgentBoardView.ts:848, src/features/tasks/ui/AgentBoardView.ts:849, src/features/tasks/ui/WorkOrderDetailModal.ts:337, src/features/tasks/ui/WorkOrderTemplateEditorModal.ts:292, src/features/tasks/ui/WorkOrderTemplateEditorModal.ts:312, src/features/tasks/ui/agentBoardCardActions.ts:298, src/features/tasks/ui/workOrderFieldOptions.ts:30, src/features/tasks/ui/workOrderFieldOptions.ts:31, src/main.ts:221, src/providers/claude/history/ClaudeConversationHistoryService.ts:221, src/providers/claude/history/ClaudeConversationHistoryService.ts:246, src/providers/claude/history/ClaudeConversationHistoryService.ts:362, src/providers/claude/history/ClaudeConversationHistoryService.ts:369, src/providers/claude/runtime/ClaudeApprovalHandler.ts:100, src/providers/claude/runtime/ClaudeChatRuntime.ts:1469, src/providers/claude/runtime/ClaudeChatRuntime.ts:1831, src/providers/codex/history/CodexConversationHistoryService.ts:106, src/providers/codex/history/CodexConversationHistoryService.ts:113, src/providers/cursor/history/CursorConversationHistoryService.ts:156, src/providers/cursor/history/CursorConversationHistoryService.ts:165, src/providers/cursor/runtime/cursorAskUserQuestion.ts:69, src/utils/fileLink.ts:328-330
- **Warning**: Unsafe assignment of an `error` or `any` typed value
  - @typescript-eslint/no-unsafe-assignment
  - src/core/logging/consoleSink.ts:19, src/core/logging/consoleSink.ts:20, src/core/logging/consoleSink.ts:21, src/core/logging/consoleSink.ts:22, src/core/providers/secretEnvVars.ts:277-279, src/features/chat/services/persistPastedImages.ts:69, src/features/quickActions/quickActionLastUsedStore.ts:140, src/features/quickActions/quickActionLastUsedStore.ts:208, src/features/quickActions/skills/VaultSkillAggregator.ts:95, src/features/quickActions/skills/VaultSkillAggregator.ts:130, src/features/quickActions/skills/VaultSkillAggregator.ts:181, src/features/quickActions/skills/VaultSkillAggregator.ts:208, src/providers/cursor/runtime/cursorTaskPayload.ts:69, src/providers/cursor/ui/CursorChatUIConfig.ts:163, src/utils/env.ts:377, src/utils/env.ts:378
- **Warning**: Unexpected `await` of a non-Promise (non-"Thenable") value.
  - src/features/chat/tabs/tabUi.ts:366, src/features/chat/tabs/tabUi.ts:369
- **Warning**: Promise returned in function argument where a void return was expected.
  - src/features/settings/registry/renderField.ts:99, src/features/tasks/ui/AgentBoardLaneEditor.ts:258-266, src/features/tasks/ui/AgentBoardLaneEditor.ts:288-302
- **Warning**: "" is overridden by string in this union type.
  - src/features/settings/ui/AgentBoardSettingsSection.ts:19
- **Warning**: Returns unsafe values from typed code
  - @typescript-eslint/no-unsafe-return
  - src/features/tasks/config/BoardConfigStore.ts:160, src/providers/cursor/runtime/cursorAgentEnv.ts:69
- **Warning**: A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
If a function does not access `this`, it can be annotated with `this: void`.
  - src/features/tasks/ui/WorkOrderDetailModal.ts:403, src/features/tasks/ui/workOrderFooterActions.ts:53, src/providers/cursor/runtime/CursorChatRuntime.ts:185, src/shared/settings/cliPathSetting.ts:58, src/shared/settings/cliPathSetting.ts:58
- **Warning**: Implied eval. Do not use the Function constructor to create functions.
  - src/features/tools/SpecoratorToolRegistry.ts:29
- **Warning**: Unsafe call of an `error` or `any` typed value
  - @typescript-eslint/no-unsafe-call
  - src/features/tools/SpecoratorToolRegistry.ts:34, src/providers/cursor/ui/CursorChatUIConfig.ts:163, src/providers/cursor/ui/CursorChatUIConfig.ts:169
- **Warning**: Promise-returning method provided where a void return was expected by extended/implemented type 'Plugin'.
  - src/main.ts:429-459
- **Warning**: Promises must be awaited, end with a call to .catch, end with a call to .then with a rejection handler or be explicitly marked as ignored with the `void` operator.
  - src/main.ts:911, src/providers/opencode/app/OpencodeRuntimeCommandLoader.ts:64, src/providers/opencode/ui/OpencodeChatUIConfig.ts:130, src/providers/opencode/ui/visibleModelsPicker.ts:116, src/providers/opencode/ui/visibleModelsPicker.ts:385
- **Warning**: Unsafe member access on an `error` or `any` typed value
  - @typescript-eslint/no-unsafe-member-access
  - src/providers/cursor/ui/CursorChatUIConfig.ts:163, src/providers/cursor/ui/CursorChatUIConfig.ts:169
- **Warning**: Passes unsafe values into typed parameters
  - @typescript-eslint/no-unsafe-argument
  - src/providers/cursor/ui/CursorChatUIConfig.ts:164
- **Recommendation**: `display` is deprecated. Since 1.13.0. Use {@link getSettingDefinitions } instead.
  - src/features/settings/SpecoratorSettings.ts:162, src/features/settings/SpecoratorSettings.ts:316, src/features/settings/SpecoratorSettings.ts:398, src/features/settings/SpecoratorSettings.ts:490
- **Recommendation**: `setDynamicTooltip` is deprecated. The value is now always shown inline next to the slider.
  - src/features/settings/ui/GeneralTabSections.ts:115
- **Recommendation**: `setWarning` is deprecated. Use {@link setDestructive} for a destructive button, or
`setDestructive().setCta()` for a destructive primary action.
  - src/features/tasks/ui/AgentBoardLaneEditor.ts:156, src/shared/modals/VaultTrustModal.ts:45, src/shared/modals/dialogButtons.ts:24
- **Recommendation**: `ZodTypeAny` is deprecated. Use z.ZodType (without generics) instead.
  - src/features/tools/toolTypes.ts:15

## CSS lint

- **Warning**: Unexpected browser feature "text-decoration" is only partially supported by Obsidian 1.11.4
  - src/style/features/file-link.css:29, src/style/features/file-link.css:35
- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.
  - src/style/features/inline-edit.css:6, src/style/features/inline-edit.css:20, src/style/features/inline-edit.css:29, src/style/features/inline-edit.css:36, src/style/features/inline-edit.css:45, src/style/features/inline-edit.css:46, src/style/features/inline-edit.css:47, src/style/features/inline-edit.css:48, src/style/features/inline-edit.css:49, src/style/features/inline-edit.css:51, src/style/features/inline-edit.css:52, src/style/features/inline-edit.css:57, src/style/features/inline-edit.css:58, src/style/features/inline-edit.css:163, src/style/features/inline-edit.css:168, src/style/features/inline-edit.css:169, src/style/features/inline-edit.css:170, src/style/features/inline-edit.css:171, src/style/features/plan-mode.css:101, src/style/components/input.css:87, src/style/components/input.css:89, src/style/components/input.css:94, src/style/components/input.css:101, src/style/components/input.css:102, src/style/components/input.css:103, src/style/components/input.css:104, src/style/components/input.css:313, src/style/components/input.css:319, src/style/base/container.css:11, src/style/base/container.css:15, src/style/base/container.css:19

## Dependencies

- **Warning**: Dependency has a potential vulnerability advisory
  - @hono/node-server
  - fast-uri
  - hono
  - ip-address
  - qs
  - https://github.com/advisories/GHSA-26pp-8wgv-hjvm