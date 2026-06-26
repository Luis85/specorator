---
title: Obsidian marketplace review triage — part 2
date: 2026-06-26
status: in-progress
scope: marketplace-submission
---

> Part 1: [`2026-06-26-obsidian-marketplace-review.md`](2026-06-26-obsidian-marketplace-review.md)

## Resolution (part 2)

### Why findings "resurfaced"

Two distinct causes, neither a regression:

1. **Stale scan.** The bot ran on commit `48a1e51` (part-1 resolution), *before* the
   uncommitted working-tree fixes. The CSS `input.css:87,89,94,101-104` `!important`
   hits were already removed (re-scoped to `.specorator-input-wrapper .specorator-input`,
   0,2,0 specificity) — see part 1 § CSS follow-up. Those lines no longer exist.
2. **Stricter validator TS.** Our local ESLint already enforces `no-unsafe-*` /
   `no-unsafe-assignment` as **error** (`eslint.config.mjs`), and `npm run lint` is
   green — yet the bot reports 15 sites. Root cause: the marketplace validator resolves
   types with an **older `lib.d.ts`** (where `Function.prototype.bind`/`.call` and
   iterator `.next().value` are typed `any`) and likely `useUnknownInCatchVariables: false`
   (so `catch (err)` is `any`). Our newer TS types all of these precisely. The fix is
   code that is unambiguous under *both* resolutions.

### no-unsafe-* cluster — FIXED (15 sites)

| Site | `any` source (bot TS) | Fix |
|------|-----------------------|-----|
| `consoleSink.ts:19-22` | `target.error.bind(target)` → `any` | Arrow wrappers `(...args) => target.error(...args)` |
| `env.ts:377,378` | `Object.prototype.hasOwnProperty.call` → `any` | `Object.hasOwn(...)` (lib ES2022, returns `boolean`) |
| `cursorAgentEnv.ts:69` | same `.call` | `Object.hasOwn(...)` |
| `VaultSkillAggregator.ts:95,130,181,208` | `catch (err)` → `any` | `catch (err: unknown)` (×4) |
| `quickActionLastUsedStore.ts:140` | `catch (err)` | `catch (err: unknown)` |
| `persistPastedImages.ts:69` | `catch (err)` | `catch (err: unknown)` |
| `StatusPanel.ts:314,316,317` | `keys().next().value` → `any` | for-of over `keys()` (yields typed `string`) |
| `SpecoratorView.ts:105,114` | `prototype.load.bind(this)` → `any` | cast `as () => Promise<void> \| void` |
| `CursorChatUIConfig.ts:163,164,169` | object-literal method `this` → `any` | reference typed const `cursorChatUIConfig.*` not `this.*` |

### "" overridden by string — FIXED

`AgentBoardSettingsSection.ts:19` — `ProviderId` is an alias for `string`, so the
`| ''` constituent is redundant. Return type narrowed to `ProviderId`; the empty-string
runtime value (no enabled provider) is still produced via the `?? ''` fallback.

Verified: `npm run typecheck` ✓ · `npm run lint` ✓ · 8760 unit tests ✓ · `npm run build` ✓.

### Still deferred / not code-fixable

- **Function constructor (Error)** — `SpecoratorToolRegistry.ts:30`. The user-tool
  sandbox: transpile + evaluate the user's own vault `.specorator/tools/*.ts`. Dynamic
  evaluation **is** the feature; input is the user's own file, not remote content. The
  bot Errors regardless of the justified inline disable. Disclose in submission notes
  (same posture as part 1). Removing it deletes the user-tools capability.
- **`no-unnecessary-type-assertion`** — `ChatDropController.ts:57,83`, `TabBar.ts:178-180`,
  `fileLink.ts:328-330`. Genuine conflict: under our `typescript@6` + `typescript-eslint@8`
  these are load-bearing DOM casts that `tsc` requires; the bot's older TS considers them
  unnecessary. Cannot satisfy both — kept (matches part 1 decision; rule intentionally
  not enforced locally).
- **API deprecations** — `display`→`getSettingDefinitions` (×4), `setDynamicTooltip`,
  `setWarning`→`setDestructive` (×3). All "Since 1.13.0". `display` is a structural
  override migration that *requires* `minAppVersion` 1.13.0; the plugin targets 1.11.5
  (SecretStorage). Deferred until the minimum app version is intentionally raised.
  `Recommendation` severity.
- **CSS `!important`** — `input.css` already fixed (stale scan, see above).
  `inline-edit.css` (CM6 widget overrides) and `container.css` (visibility-toggle
  utilities) kept: justified host/CM6 overrides per `src/style/CLAUDE.md`. CM6 host
  specificity is not statically verifiable headless.
- **Dependencies** — `ip-address` GHSA-v2v4-37r5-5v8g already pinned `^10.2.0` via
  `package.json` overrides in part 1; transitive under MCP SDK. Re-verify the lockfile
  resolved version.

---

## Raw findings (validator output, commit `48a1e51`)

## Source code

- **Error**: Using the `Function` constructor is dangerous because it executes arbitrary code, similar to `eval()`
  - src/features/tools/SpecoratorToolRegistry.ts:30
- **Warning**: Unsafe assignment of an `error` or `any` typed value
  - @typescript-eslint/no-unsafe-assignment
  - src/core/logging/consoleSink.ts:19, src/core/logging/consoleSink.ts:20, src/core/logging/consoleSink.ts:21, src/core/logging/consoleSink.ts:22, src/features/chat/SpecoratorView.ts:105, src/features/chat/services/persistPastedImages.ts:69, src/features/chat/ui/StatusPanel.ts:314, src/features/quickActions/quickActionLastUsedStore.ts:140, src/features/quickActions/skills/VaultSkillAggregator.ts:95, src/features/quickActions/skills/VaultSkillAggregator.ts:130, src/features/quickActions/skills/VaultSkillAggregator.ts:181, src/features/quickActions/skills/VaultSkillAggregator.ts:208, src/providers/cursor/ui/CursorChatUIConfig.ts:163, src/utils/env.ts:377, src/utils/env.ts:378
- **Warning**: Returns unsafe values from typed code
  - @typescript-eslint/no-unsafe-return
  - src/features/chat/SpecoratorView.ts:114, src/providers/cursor/runtime/cursorAgentEnv.ts:69
- **Warning**: Unsafe call of an `error` or `any` typed value
  - @typescript-eslint/no-unsafe-call
  - src/features/chat/SpecoratorView.ts:114, src/providers/cursor/ui/CursorChatUIConfig.ts:163, src/providers/cursor/ui/CursorChatUIConfig.ts:169
- **Warning**: This assertion is unnecessary since it does not change the type of the expression.
  - src/features/chat/controllers/ChatDropController.ts:57, src/features/chat/controllers/ChatDropController.ts:83, src/features/chat/tabs/TabBar.ts:178-180, src/utils/fileLink.ts:328-330
- **Warning**: Passes unsafe values into typed parameters
  - @typescript-eslint/no-unsafe-argument
  - src/features/chat/ui/StatusPanel.ts:316, src/features/chat/ui/StatusPanel.ts:317, src/providers/cursor/ui/CursorChatUIConfig.ts:164
- **Warning**: "" is overridden by string in this union type.
  - src/features/settings/ui/AgentBoardSettingsSection.ts:19
- **Warning**: Unsafe member access on an `error` or `any` typed value
  - @typescript-eslint/no-unsafe-member-access
  - src/providers/cursor/ui/CursorChatUIConfig.ts:163, src/providers/cursor/ui/CursorChatUIConfig.ts:169
- **Recommendation**: `display` is deprecated. Since 1.13.0. Use {@link getSettingDefinitions } instead.
  - src/features/settings/SpecoratorSettings.ts:162, src/features/settings/SpecoratorSettings.ts:316, src/features/settings/SpecoratorSettings.ts:398, src/features/settings/SpecoratorSettings.ts:490
- **Recommendation**: `setDynamicTooltip` is deprecated. The value is now always shown inline next to the slider.
  - src/features/settings/ui/GeneralTabSections.ts:115
- **Recommendation**: `setWarning` is deprecated. Use {@link setDestructive} for a destructive button, or
`setDestructive().setCta()` for a destructive primary action.
  - src/features/tasks/ui/AgentBoardLaneEditor.ts:156, src/shared/modals/VaultTrustModal.ts:45, src/shared/modals/dialogButtons.ts:24

## CSS lint

- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.
  - src/style/features/inline-edit.css:6, src/style/features/inline-edit.css:20, src/style/features/inline-edit.css:29, src/style/features/inline-edit.css:36, src/style/features/inline-edit.css:45, src/style/features/inline-edit.css:46, src/style/features/inline-edit.css:47, src/style/features/inline-edit.css:48, src/style/features/inline-edit.css:49, src/style/features/inline-edit.css:51, src/style/features/inline-edit.css:52, src/style/features/inline-edit.css:57, src/style/features/inline-edit.css:58, src/style/features/inline-edit.css:163, src/style/features/inline-edit.css:168, src/style/features/inline-edit.css:169, src/style/features/inline-edit.css:170, src/style/features/inline-edit.css:171, src/style/components/input.css:87, src/style/components/input.css:89, src/style/components/input.css:94, src/style/components/input.css:101, src/style/components/input.css:102, src/style/components/input.css:103, src/style/components/input.css:104, src/style/base/container.css:11, src/style/base/container.css:15, src/style/base/container.css:19

## Dependencies

- **Warning**: Dependency has a potential vulnerability advisory
  - ip-address
  - https://github.com/advisories/GHSA-v2v4-37r5-5v8g