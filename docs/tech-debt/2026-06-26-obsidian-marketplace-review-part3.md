---
title: Obsidian marketplace review triage — part 3
date: 2026-06-26
status: resolved
scope: marketplace-submission
---

> Part 1: [`2026-06-26-obsidian-marketplace-review.md`](2026-06-26-obsidian-marketplace-review.md) ·
> Part 2: [`2026-06-26-obsidian-marketplace-review-part2.md`](2026-06-26-obsidian-marketplace-review-part2.md)

## Resolution (part 3)

Part 3 narrowed to the residual judgment-call set. Two decisions were taken:
**bump `minAppVersion` 1.11.5 → 1.13.0 and migrate all deprecations**, and
**keep the user-tool sandbox `Function` constructor (disclose)**.

### no-unnecessary-type-assertion — FIXED (4 sites)

Part 2 *assumed* our `typescript@6` needed these casts. Empirically false: the
problem was the `as` **form**. The idiomatic generic-parameter form is not an
assertion (so the bot doesn't flag it) and resolves identically under our TS:

| Site | Before | After |
|------|--------|-------|
| `ChatDropController.ts:57` | `querySelector(...) as HTMLElement \| null` | `querySelector<HTMLElement>(...)` |
| `ChatDropController.ts:83` | `e.dataTransfer as DataTransfer \| null` | `e.dataTransfer` (already that type) |
| `TabBar.ts:178-180` | `querySelectorAll(...) as HTMLElement[]` | `querySelectorAll<HTMLElement>(...)` |
| `fileLink.ts:328-330` | `target.closest(...) as HTMLElement \| null` | `target.closest<HTMLElement>(...)` |

### API deprecations — FIXED via minAppVersion bump (8 sites)

`manifest.minAppVersion` 1.11.5 → **1.13.0**; `obsidian` devDep `latest`(→1.12.3
cached) pinned to **^1.13.1** so the replacement APIs are typed. This drops
1.11.5–1.12.x users (deliberate; SecretStorage already required ≥1.11.5).

| Deprecation | Sites | Fix |
|-------------|-------|-----|
| `setWarning` → `setDestructive` | dialogButtons:24, VaultTrustModal:45, AgentBoardLaneEditor:156 | method swap (1.13 typing) |
| `setDynamicTooltip` | GeneralTabSections:115 | removed — 1.13 shows the value inline automatically |
| `display` → `getSettingDefinitions` | SpecoratorSettings:162,316,398,490 | **not migratable** — the declarative `getSettingDefinitions` API can't express this plugin's custom tabbed/searchable settings UI; `display()` override remains the supported render path. Consolidated all 4 calls behind one private `refreshDisplay()` wrapper carrying a single justified `eslint-disable no-deprecated`. The bot will still list `display` as a `Recommendation`; that is accepted. |

Bumping the typings turned `@typescript-eslint/no-deprecated` (error, src-wide)
onto the new JSDoc; only the 4 `display` calls surfaced — no other cascade.

Test fallout: the obsidian button mocks (`tests/__mocks__/obsidian.ts` + the
inline mock in `ConfirmModal.test.ts`) gained `setDestructive`.

### Function constructor (Error) — KEPT + disclosed

`SpecoratorToolRegistry.ts:30`. The user-tool sandbox transpiles + evaluates the
user's **own** vault files (`.specorator/tools/*.ts`) — dynamic evaluation *is*
the feature; input is local, not remote. Precedent: Dataview, Templater,
QuickAdd, JS Engine all execute user JS and are approved. The bot Errors
regardless of the justified inline disable; declare in submission notes.

### Not regressions

- **CSS `!important`** — `inline-edit.css` (CM6 widget overrides) + `container.css`
  (visibility-toggle utilities): justified host/CM6 overrides per `src/style/CLAUDE.md`.
- **ip-address** GHSA-v2v4-37r5-5v8g — locked `10.2.0` (part-1 override), `npm audit`
  reports nothing. Stale validator scan / DB lag; nothing to fix.

Verified: typecheck ✓ · lint ✓ · 8760 unit ✓ · 309 integration ✓ · build ✓.

---

## Raw findings (validator output)

## Source code

- **Error**: Using the `Function` constructor is dangerous because it executes arbitrary code, similar to `eval()`
  - src/features/tools/SpecoratorToolRegistry.ts:30
- **Warning**: This assertion is unnecessary since it does not change the type of the expression.
  - src/features/chat/controllers/ChatDropController.ts:57, src/features/chat/controllers/ChatDropController.ts:83, src/features/chat/tabs/TabBar.ts:178-180, src/utils/fileLink.ts:328-330
- **Recommendation**: `display` is deprecated. Since 1.13.0. Use {@link getSettingDefinitions } instead.
  - src/features/settings/SpecoratorSettings.ts:162, src/features/settings/SpecoratorSettings.ts:316, src/features/settings/SpecoratorSettings.ts:398, src/features/settings/SpecoratorSettings.ts:490
- **Recommendation**: `setDynamicTooltip` is deprecated. The value is now always shown inline next to the slider.
  - src/features/settings/ui/GeneralTabSections.ts:115
- **Recommendation**: `setWarning` is deprecated. Use {@link setDestructive} for a destructive button, or
`setDestructive().setCta()` for a destructive primary action.
  - src/features/tasks/ui/AgentBoardLaneEditor.ts:156, src/shared/modals/VaultTrustModal.ts:45, src/shared/modals/dialogButtons.ts:24

## CSS lint

- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.
  - src/style/features/inline-edit.css:6, src/style/features/inline-edit.css:20, src/style/features/inline-edit.css:29, src/style/features/inline-edit.css:36, src/style/features/inline-edit.css:45, src/style/features/inline-edit.css:46, src/style/features/inline-edit.css:47, src/style/features/inline-edit.css:48, src/style/features/inline-edit.css:49, src/style/features/inline-edit.css:51, src/style/features/inline-edit.css:52, src/style/features/inline-edit.css:57, src/style/features/inline-edit.css:58, src/style/features/inline-edit.css:163, src/style/features/inline-edit.css:168, src/style/features/inline-edit.css:169, src/style/features/inline-edit.css:170, src/style/features/inline-edit.css:171, src/style/base/container.css:11, src/style/base/container.css:15, src/style/base/container.css:19

## Dependencies

- **Warning**: Dependency has a potential vulnerability advisory
  - ip-address
  - https://github.com/advisories/GHSA-v2v4-37r5-5v8g