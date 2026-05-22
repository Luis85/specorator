import type { Meta, StoryObj } from '@storybook/vue3-vite';
import WelcomeSuggestionChip from '@/ui/components/agent/WelcomeSuggestionChip.vue';

/**
 * Storybook coverage for `<WelcomeSuggestionChip>` (WS-AUX-4, T-AUX-213).
 * Pure presentational chip in the welcome surface suggestion grid; click
 * bubbles via `pick`. Satisfies REQ-AUX-007 and the WS-AUX-10 Storybook
 * coverage gate (T-AUX-345).
 */
const meta: Meta<typeof WelcomeSuggestionChip> = {
	title: 'Agent/WelcomeSuggestionChip',
	component: WelcomeSuggestionChip,
	args: {
		id: 'slash',
		label: 'Try /help',
	},
	render: (args) => ({
		components: { WelcomeSuggestionChip },
		setup() {
			return { args };
		},
		template: `
			<div class="specorator-root" style="padding: 24px; background: var(--sp-bg-primary); display: flex; gap: 8px;">
				<WelcomeSuggestionChip v-bind="args" />
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof WelcomeSuggestionChip>;

export const Default: Story = {};

export const LongerLabel: Story = {
	args: { id: 'feature', label: 'Start a new feature' },
};
