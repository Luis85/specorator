import type { Meta, StoryObj } from '@storybook/vue3-vite';
import FloatingNavSidebar from '@/ui/components/agent/FloatingNavSidebar.vue';

/**
 * Storybook coverage for `<FloatingNavSidebar>` (WS-AUX-9, T-AUX-330).
 *
 * Renders the right-edge floating column with 32px circular buttons at the
 * resting opacity (0.15) and full opacity (1.0) on hover, plus a narrow-pane
 * variant that asserts the column is hidden under the 360px breakpoint.
 */
const meta: Meta<typeof FloatingNavSidebar> = {
	title: 'Agent/FloatingNavSidebar',
	component: FloatingNavSidebar,
	render: (args) => ({
		components: { FloatingNavSidebar },
		setup() {
			return { args };
		},
		template: `
			<div class="specorator-root" style="position: relative; padding: 16px; width: 480px; min-height: 320px; background: var(--sp-bg-primary);">
				<p>Hover the column on the right to lift opacity to 1.</p>
				<FloatingNavSidebar v-bind="args" />
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof FloatingNavSidebar>;

export const Wide: Story = {
	args: { narrow: false },
};

export const NarrowHidden: Story = {
	args: { narrow: true },
};
