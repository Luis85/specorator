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

	it('shows the no-feature-in-focus copy when no thread is active', () => {
		const { po } = mountHeader({ activeFeature: null, hasActiveThread: false });
		expect(po.featureChip.exists()).toBe(false);
		expect(po.featureEmpty.exists()).toBe(true);
		expect(po.featureEmpty.text()).toBe('No feature in focus');
	});

	it('shows the active feature slug when a thread carries one', () => {
		const { po } = mountHeader({ activeFeature: 'my-feature', hasActiveThread: true });
		expect(po.featureEmpty.exists()).toBe(false);
		expect(po.featureChip.exists()).toBe(true);
		expect(po.featureChip.text()).toContain('my-feature');
	});

	it('shows the no-feature copy even when a thread is active but its feature is null', () => {
		const { po } = mountHeader({ activeFeature: null, hasActiveThread: true });
		expect(po.featureChip.exists()).toBe(false);
		expect(po.featureEmpty.exists()).toBe(true);
	});

	describe('new-conversation button', () => {
		it('is disabled when no thread is active', () => {
			const { po } = mountHeader({ activeFeature: null, hasActiveThread: false });
			expect(po.newConversationButton.exists()).toBe(true);
			expect(po.newConversationDisabled()).toBe(true);
		});

		it('is enabled when a thread is active', () => {
			const { po } = mountHeader({ activeFeature: 'foo', hasActiveThread: true });
			expect(po.newConversationDisabled()).toBe(false);
		});

		it('emits "new-conversation" when clicked while enabled', async () => {
			const { wrapper, po } = mountHeader({ activeFeature: 'foo', hasActiveThread: true });
			await po.clickNewConversation();
			expect(wrapper.emitted('new-conversation')).toEqual([[]]);
		});

		it('does not emit when clicked while disabled', async () => {
			const { wrapper, po } = mountHeader({ activeFeature: null, hasActiveThread: false });
			await po.clickNewConversation();
			expect(wrapper.emitted('new-conversation')).toBeUndefined();
		});

		// Codex P1 (PR #369 second review): mid-request reset would strand
		// the in-flight response on a no-longer-active thread.
		it('is disabled while a chat turn is in flight even when a thread is active', () => {
			const { po } = mountHeader({
				activeFeature: 'foo',
				hasActiveThread: true,
				requestInFlight: true,
			});
			expect(po.newConversationDisabled()).toBe(true);
		});

		it('does not emit while requestInFlight is true', async () => {
			const { wrapper, po } = mountHeader({
				activeFeature: 'foo',
				hasActiveThread: true,
				requestInFlight: true,
			});
			await po.clickNewConversation();
			expect(wrapper.emitted('new-conversation')).toBeUndefined();
		});

		it('toggles disabled when requestInFlight transitions in either direction', async () => {
			const { wrapper, po } = mountHeader({
				activeFeature: 'foo',
				hasActiveThread: true,
				requestInFlight: false,
			});
			expect(po.newConversationDisabled()).toBe(false);
			await wrapper.setProps({ requestInFlight: true });
			expect(po.newConversationDisabled()).toBe(true);
			await wrapper.setProps({ requestInFlight: false });
			expect(po.newConversationDisabled()).toBe(false);
		});
	});
});
