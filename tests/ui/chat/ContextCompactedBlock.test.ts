/**
 * T-RR-035 (RED) — `ContextCompactedBlock.vue` static notice (TEST-RR-025, NG1).
 *
 * SPEC-RR-032. A static "context compacted" notice rendered when a
 * `{type:'context_compacted'}` block is present. NO compaction machinery (NG1).
 * Declarative text only — no `v-html` (NFR-RR-006). Queried by `data-testid`
 * only (ADR-009).
 *
 * Traces: REQ-RR-007, NFR-RR-006.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ContextCompactedBlock from '@/ui/chat/ContextCompactedBlock.vue';
import { ContextCompactedBlockPageObject } from './ContextCompactedBlock.po';

describe('ContextCompactedBlock (TEST-RR-025)', () => {
	it('renders a static context-compacted notice', () => {
		const wrapper = mount(ContextCompactedBlock);
		const po = new ContextCompactedBlockPageObject(wrapper);
		expect(po.exists()).toBe(true);
		expect(po.text().toLowerCase()).toContain('context');
	});
});
