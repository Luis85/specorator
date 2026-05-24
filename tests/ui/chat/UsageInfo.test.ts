/**
 * T-RR-035 (RED) — `UsageInfo.vue` turn-level token info (TEST-RR-004/022, EC-RR-12).
 *
 * SPEC-RR-031. Turn-level (NOT a content block) — reads `chatStore.usage` (the
 * DTO P1 stored). When set, renders context tokens + ~percentage of the context
 * window (+ optional model name) via `--sp-*`-tokened declarative text. EC-RR-12:
 * `chatStore.usage === null` → renders NOTHING (no usage element, no zero-token
 * placeholder). Missing `contextWindow` → tokens only, percentage omitted. This
 * is NOT the P6 240° arc meter (NG5) — in-turn token text only. Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-RR-024/024a, NFR-RR-006.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import UsageInfo from '@/ui/chat/UsageInfo.vue';
import { useChatStore } from '@/ui/stores/chatStore';
import type { UsageInfo as UsageInfoDto } from '@/domain/ports';
import { UsageInfoPageObject } from './UsageInfo.po';

function mountUsage(usage: UsageInfoDto | null) {
	const store = useChatStore();
	store.usage = usage;
	const wrapper = mount(UsageInfo);
	return { wrapper, store, po: new UsageInfoPageObject(wrapper) };
}

const fullUsage: UsageInfoDto = {
	model: 'claude-opus',
	inputTokens: 1000,
	contextWindow: 200000,
	contextTokens: 50000,
	percentage: 25,
};

describe('UsageInfo (TEST-RR-004/022)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('renders the context tokens + ~percentage when usage is set', () => {
		const { po } = mountUsage(fullUsage);
		expect(po.exists()).toBe(true);
		expect(po.tokensText()).toContain('50000');
		expect(po.percentageExists()).toBe(true);
		expect(po.percentageText()).toContain('25');
	});

	it('renders the optional model name when present', () => {
		const { po } = mountUsage(fullUsage);
		expect(po.modelExists()).toBe(true);
		expect(po.modelText()).toContain('claude-opus');
	});

	it('EC-RR-12: renders nothing when usage is null', () => {
		const { po } = mountUsage(null);
		expect(po.exists()).toBe(false);
	});

	it('omits the percentage gracefully when contextWindow is missing/zero (tokens only)', () => {
		const { po } = mountUsage({
			inputTokens: 100,
			contextWindow: 0,
			contextTokens: 100,
			percentage: 0,
		});
		expect(po.exists()).toBe(true);
		expect(po.tokensText()).toContain('100');
		expect(po.percentageExists()).toBe(false);
	});

	it('omits the model element when no model is reported', () => {
		const { po } = mountUsage({
			inputTokens: 10,
			contextWindow: 1000,
			contextTokens: 10,
			percentage: 1,
		});
		expect(po.modelExists()).toBe(false);
	});
});
