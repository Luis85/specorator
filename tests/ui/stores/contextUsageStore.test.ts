/**
 * Tests for `useContextUsageStore()` — per-thread token accumulator that
 * drives the `ContextMeter` donut.
 *
 * Satisfies REQ-AUX-004 (T-AUX-255, T-AUX-256).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { useContextUsageStore } from '@/ui/stores/contextUsageStore';

describe('useContextUsageStore()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('initial state', () => {
		it('tokensUsed is 0', () => {
			const store = useContextUsageStore();
			expect(store.tokensUsed).toBe(0);
		});

		it('tokensCap is null', () => {
			const store = useContextUsageStore();
			expect(store.tokensCap).toBeNull();
		});

		it('capProviderId and capModelId are null', () => {
			const store = useContextUsageStore();
			expect(store.capProviderId).toBeNull();
			expect(store.capModelId).toBeNull();
		});
	});

	describe('recordTokens(delta)', () => {
		it('T-AUX-255: accumulates token deltas', () => {
			const store = useContextUsageStore();
			store.recordTokens(100);
			store.recordTokens(50);
			expect(store.tokensUsed).toBe(150);
		});

		it('ignores zero and negative deltas', () => {
			const store = useContextUsageStore();
			store.recordTokens(100);
			store.recordTokens(0);
			store.recordTokens(-25);
			expect(store.tokensUsed).toBe(100);
		});
	});

	describe('reset()', () => {
		it('T-AUX-255: zeroes tokensUsed', () => {
			const store = useContextUsageStore();
			store.recordTokens(500);
			store.reset();
			expect(store.tokensUsed).toBe(0);
		});

		it('preserves cap fields across reset', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', 200_000);
			store.recordTokens(100);
			store.reset();
			expect(store.tokensCap).toBe(200_000);
			expect(store.capProviderId).toBe('claude');
			expect(store.capModelId).toBe('sonnet');
		});
	});

	describe('setCap(providerId, modelId, cap)', () => {
		it('T-AUX-255: invalidates tokensUsed on provider change', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', 200_000);
			store.recordTokens(100);
			store.setCap('codex', 'gpt5', 128_000);
			expect(store.tokensUsed).toBe(0);
			expect(store.tokensCap).toBe(128_000);
		});

		it('T-AUX-255: invalidates tokensUsed on model change within same provider', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', 200_000);
			store.recordTokens(100);
			store.setCap('claude', 'opus', 200_000);
			expect(store.tokensUsed).toBe(0);
		});

		it('does not invalidate when same provider+model is set', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', 200_000);
			store.recordTokens(100);
			store.setCap('claude', 'sonnet', 200_000);
			expect(store.tokensUsed).toBe(100);
		});

		it('accepts null cap', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', null);
			expect(store.tokensCap).toBeNull();
		});
	});

	describe('usageFraction getter', () => {
		it('T-AUX-256: returns null when cap is missing', () => {
			const store = useContextUsageStore();
			store.recordTokens(500);
			expect(store.usageFraction).toBeNull();
		});

		it('T-AUX-256: returns null when cap is zero', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', 0);
			store.recordTokens(500);
			expect(store.usageFraction).toBeNull();
		});

		it('returns fractional value 0..1', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', 1000);
			store.recordTokens(500);
			expect(store.usageFraction).toBe(0.5);
		});

		it('caps fraction at 1.0 when usage exceeds cap', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', 100);
			store.recordTokens(500);
			expect(store.usageFraction).toBe(1.0);
		});
	});

	describe('isWarning getter', () => {
		it('T-AUX-256: false when fraction is null', () => {
			const store = useContextUsageStore();
			store.recordTokens(500);
			expect(store.isWarning).toBe(false);
		});

		it('T-AUX-256: 0.8 triggers warning=true', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', 1000);
			store.recordTokens(800);
			expect(store.isWarning).toBe(true);
		});

		it('false below 0.8 threshold', () => {
			const store = useContextUsageStore();
			store.setCap('claude', 'sonnet', 1000);
			store.recordTokens(799);
			expect(store.isWarning).toBe(false);
		});
	});
});
