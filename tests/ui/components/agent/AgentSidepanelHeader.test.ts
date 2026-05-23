/**
 * Tests for `AgentSidepanelHeader.vue` (IDEA-ASV-001, specs/agent-sidepanel-v2).
 * Covers the three header states (no thread, thread with feature, thread
 * without feature) and the `new-conversation` emit.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AgentSidepanelHeader from '@/ui/components/agent/AgentSidepanelHeader.vue';
import { i18n } from '@/ui/i18n';
import { AgentSidepanelHeaderPO } from './AgentSidepanelHeader.po';

function mountHeader(props: {
	activeFeature: string | null;
	hasActiveThread: boolean;
	requestInFlight?: boolean;
}) {
	const wrapper = mount(AgentSidepanelHeader, {
		global: { plugins: [i18n] },
		props,
	});
	return { wrapper, po: new AgentSidepanelHeaderPO(wrapper) };
}

describe('AgentSidepanelHeader', () => {
	it('renders the header root with the localised title', () => {
		const { po } = mountHeader({ activeFeature: null, hasActiveThread: false });
		expect(po.root.exists()).toBe(true);
		expect(po.titleText()).toBe('Specorator agent');
	});

	// G2.1 (RALPH G2): Claudian-parity header — render NOTHING in the
	// feature slot when no feature is in focus. The "No feature in focus"
	// caption is gone; the header band is just logo+title (+ history/new
	// in the floating nav sidebar).
	it('renders no feature slot when no thread is active', () => {
		const { po } = mountHeader({ activeFeature: null, hasActiveThread: false });
		expect(po.featureChip.exists()).toBe(false);
		expect(po.featureEmpty.exists()).toBe(false);
	});

	it('shows the active feature slug when a thread carries one', () => {
		const { po } = mountHeader({ activeFeature: 'my-feature', hasActiveThread: true });
		expect(po.featureEmpty.exists()).toBe(false);
		expect(po.featureChip.exists()).toBe(true);
		expect(po.featureChip.text()).toContain('my-feature');
	});

	it('renders no feature slot when a thread is active but its feature is null', () => {
		const { po } = mountHeader({ activeFeature: null, hasActiveThread: true });
		expect(po.featureChip.exists()).toBe(false);
		expect(po.featureEmpty.exists()).toBe(false);
	});

	// G2.4 (RALPH G2): the "New conversation" affordance moved to the
	// floating nav sidebar — the header band collapses to logo+title only.
	describe('header band (G2.4 Claudian collapse)', () => {
		it('does NOT render a new-conversation button in the header', () => {
			const { po } = mountHeader({ activeFeature: 'foo', hasActiveThread: true });
			expect(po.newConversationButton.exists()).toBe(false);
		});

		it('does NOT render a new-conversation button when no thread is active', () => {
			const { po } = mountHeader({ activeFeature: null, hasActiveThread: false });
			expect(po.newConversationButton.exists()).toBe(false);
		});
	});
});
