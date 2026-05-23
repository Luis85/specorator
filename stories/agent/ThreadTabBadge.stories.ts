import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ThreadTabBadge from '@/ui/components/agent/ThreadTabBadge.vue';

/**
 * Storybook coverage for `<ThreadTabBadge>` (WS-AUX-4, T-AUX-203).
 * 24×24 status badge rendered inside each `ThreadTab`. Border colour
 * is driven by `data-state`; the `streaming` state animates via the
 * shared `thinking-pulse` keyframe (`animations.css`). Satisfies
 * REQ-AUX-019 and the WS-AUX-10 Storybook coverage gate (T-AUX-345).
 */
const meta: Meta<typeof ThreadTabBadge> = {
	title: 'Agent/ThreadTabBadge',
	component: ThreadTabBadge,
	args: {
		state: 'idle',
		digit: 1,
	},
	argTypes: {
		state: {
			control: 'select',
			options: ['active', 'streaming', 'attention', 'idle'],
		},
	},
	render: (args) => ({
		components: { ThreadTabBadge },
		setup() {
			return { args };
		},
		template: `
			<div class="specorator-root" style="padding: 24px; background: var(--sp-bg-primary); display: flex; gap: 12px;">
				<ThreadTabBadge v-bind="args" />
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof ThreadTabBadge>;

export const Default: Story = {};

export const Active: Story = {
	args: { state: 'active', digit: 2 },
};

export const Streaming: Story = {
	args: { state: 'streaming', digit: 3 },
};

export const Attention: Story = {
	args: { state: 'attention', digit: '!' },
};
