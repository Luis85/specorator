import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';

import McpIndicator from '@/ui/components/agent/McpIndicator.vue';
import { useMcpStatusStore } from '@/ui/stores/mcpStatusStore';

/**
 * Storybook coverage for `<McpIndicator>` (REQ-AUX-004 / REQ-AUX-017).
 * Two stories: active (glowing) + inactive.
 */
const meta: Meta<typeof McpIndicator> = {
	title: 'Agent/McpIndicator',
	component: McpIndicator,
};
export default meta;
type Story = StoryObj<typeof McpIndicator>;

function seed(active: boolean, count: number): void {
	setActivePinia(createPinia());
	const store = useMcpStatusStore();
	store.setActive(active);
	store.setCount(count);
}

export const Inactive: Story = {
	render: () => ({
		components: { McpIndicator },
		setup() {
			seed(false, 0);
			return {};
		},
		template: `
			<div class="specorator-root" style="padding: 16px;">
				<McpIndicator />
			</div>
		`,
	}),
};

export const Active: Story = {
	render: () => ({
		components: { McpIndicator },
		setup() {
			seed(true, 3);
			return {};
		},
		template: `
			<div class="specorator-root" style="padding: 16px;">
				<McpIndicator />
			</div>
		`,
	}),
};
