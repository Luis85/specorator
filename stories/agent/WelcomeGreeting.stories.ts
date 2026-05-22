import type { Meta, StoryObj } from '@storybook/vue3-vite';
import WelcomeGreeting from '@/ui/components/agent/WelcomeGreeting.vue';

/**
 * Storybook coverage for `<WelcomeGreeting>` (WS-AUX-4, T-AUX-210).
 * Centred serif greeting shown on empty threads. Variant is computed
 * from the local hour; `hourOverride` makes the four time bands
 * deterministically renderable. Satisfies REQ-AUX-007 and the WS-AUX-10
 * Storybook coverage gate (T-AUX-345).
 */
const meta: Meta<typeof WelcomeGreeting> = {
	title: 'Agent/WelcomeGreeting',
	component: WelcomeGreeting,
	render: (args) => ({
		components: { WelcomeGreeting },
		setup() {
			return { args };
		},
		template: `
			<div class="specorator-root" style="padding: 24px; background: var(--sp-bg-primary); max-width: 480px;">
				<WelcomeGreeting v-bind="args" />
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof WelcomeGreeting>;

export const Morning: Story = {
	args: { hourOverride: 9 },
};

export const Afternoon: Story = {
	args: { hourOverride: 14 },
};

export const Evening: Story = {
	args: { hourOverride: 20 },
};

export const Night: Story = {
	args: { hourOverride: 2 },
};
