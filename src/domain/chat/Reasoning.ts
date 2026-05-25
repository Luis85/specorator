/**
 * Reasoning choice (P6, SPEC-TC-002, ADR-TC-002 §2) — the discriminated union the
 * thinking selector folds into `ChatRuntimeQueryOptions.reasoning`. Mirrors
 * claudian-main `ThinkingBudgetSelector` (effort gears vs token-budget gears) +
 * `ProviderReasoningOption`. Pure domain type — no class, no `obsidian`, no
 * `node:*`, no Vue.
 */

/**
 * The Claude adaptive-effort vocabulary — a closed lower-case union (SPEC-TC-002,
 * resolved open item #1). The display labels ("High"/"Medium"/"Low") are i18n
 * strings; the stored + folded value is the lower-case token.
 */
export type ReasoningEffort = 'high' | 'medium' | 'low';

/**
 * The reasoning selection. `kind` is the discriminant the fold + view-model
 * narrow on:
 * - `effort` — effort providers (Claude); `value` is a {@link ReasoningEffort}.
 * - `budget` — token-budget providers (descriptor-driven, P9); `tokens` is a
 *   finite, non-negative integer (the catalog descriptor supplies the option set
 *   and each option's `tokens` — there is no hard-coded budget default in P6,
 *   resolved open item #2).
 *
 * The "no reasoning chosen" state is the **absence** of `reasoning` on the tab
 * controls, not a sentinel value.
 */
export type ReasoningChoice =
	| { readonly kind: 'effort'; readonly value: ReasoningEffort }
	| { readonly kind: 'budget'; readonly tokens: number };
