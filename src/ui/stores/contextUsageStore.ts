import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * `contextUsageStore` — per-thread token accumulator that drives the
 * `ContextMeter` donut in `InputToolbar`.
 *
 * - `tokensUsed` accumulates input + output tokens from the streaming reducer
 *   via `recordTokens(delta)`.
 * - `tokensCap` is the provider+model capability window from
 *   `ProviderRegistry.getCapabilities().contextWindow`. `null` when unknown.
 * - `setCap(providerId, modelId, cap)` invalidates `tokensUsed` whenever
 *   the active provider/model changes — token counts from a previous model
 *   don't carry over to the new context window.
 * - `reset()` zeroes `tokensUsed` (called on `/clear` and new-thread).
 *
 * Spec: §1.2, REQ-AUX-004.
 */
export const useContextUsageStore = defineStore('contextUsage', () => {
	const tokensUsed = ref<number>(0);
	const tokensCap = ref<number | null>(null);
	const capProviderId = ref<string | null>(null);
	const capModelId = ref<string | null>(null);

	/** Accumulate a token delta from the streaming reducer. Non-positive deltas are ignored. */
	function recordTokens(delta: number): void {
		if (delta <= 0) return;
		tokensUsed.value = tokensUsed.value + delta;
	}

	/** Reset the counter for a new thread or after `/clear`. Cap fields are preserved. */
	function reset(): void {
		tokensUsed.value = 0;
	}

	/**
	 * Set the cap from a `ProviderRegistry` lookup. When the (provider, model)
	 * pair changes we invalidate `tokensUsed` — a fresh context window means
	 * accumulated counts from the previous model no longer apply.
	 */
	function setCap(providerId: string, modelId: string, cap: number | null): void {
		const changed = providerId !== capProviderId.value || modelId !== capModelId.value;
		capProviderId.value = providerId;
		capModelId.value = modelId;
		tokensCap.value = cap;
		if (changed) {
			tokensUsed.value = 0;
		}
	}

	/** Fractional usage 0..1, or `null` when cap is unknown. */
	const usageFraction = computed<number | null>(() => {
		const cap = tokensCap.value;
		if (cap === null || cap <= 0) return null;
		const raw = tokensUsed.value / cap;
		return raw > 1 ? 1 : raw;
	});

	/** Usage is in the warning range (>= 80%). */
	const isWarning = computed<boolean>(() => {
		const f = usageFraction.value;
		if (f === null) return false;
		return f >= 0.8;
	});

	return {
		tokensUsed,
		tokensCap,
		capProviderId,
		capModelId,
		usageFraction,
		isWarning,
		recordTokens,
		reset,
		setCap,
	};
});
