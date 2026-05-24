import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';

import InputToolbar from '@/ui/components/agent/InputToolbar.vue';
import { useContextUsageStore } from '@/ui/stores/contextUsageStore';
import { useMessagesStore } from '@/ui/stores/messagesStore';

/**
 * Storybook coverage for `<InputToolbar>` (REQ-AUX-004 / REQ-AUX-017,
 * spec §1.3.3).
 *
 * Stories: idle / streaming / narrow-pane.
 */
const meta: Meta<typeof InputToolbar> = {
	title: 'Agent/InputToolbar',
	component: InputToolbar,
};
export default meta;
type Story = StoryObj<typeof InputToolbar>;

function seedIdle(): void {
	setActivePinia(createPinia());
	const ctx = useContextUsageStore();
	ctx.setCap('claude', 'sonnet', 200_000);
	ctx.recordTokens(45_000);
}

function seedStreaming(): void {
	seedIdle();
	useMessagesStore().beginRequest();
}

export const Idle: Story = {
	render: () => ({
		components: { InputToolbar },
		setup() {
			seedIdle();
			return {};
		},
		template: `
			<div class="specorator-root" style="padding: 16px; min-width: 480px;">
				<InputToolbar />
			</div>
		`,
	}),
};

export const Streaming: Story = {
	render: () => ({
		components: { InputToolbar },
		setup() {
			seedStreaming();
			return {};
		},
		template: `
			<div class="specorator-root" style="padding: 16px; min-width: 480px;">
				<InputToolbar />
			</div>
		`,
	}),
};

export const NarrowPane: Story = {
	render: () => ({
		components: { InputToolbar },
		setup() {
			seedIdle();
			return {};
		},
		template: `
			<div class="specorator-root" style="padding: 16px; width: 320px;">
				<InputToolbar :narrow="true" />
			</div>
		`,
	}),
};
