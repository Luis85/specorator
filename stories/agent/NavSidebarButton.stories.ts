import type { Meta, StoryObj } from '@storybook/vue3-vite';
import NavSidebarButton from '@/ui/components/agent/NavSidebarButton.vue';

/**
 * Storybook coverage for `<NavSidebarButton>` (WS-AUX-9, T-AUX-330).
 * Circular icon button used by `<FloatingNavSidebar>`. Includes a
 * disabled variant and an icon variant.
 */
const meta: Meta<typeof NavSidebarButton> = {
	title: 'Agent/NavSidebarButton',
	component: NavSidebarButton,
	args: {
		icon: 'trash-2',
		ariaLabel: 'Clear conversation',
	},
	render: (args) => ({
		components: { NavSidebarButton },
		setup() {
			return { args };
		},
		template: `
			<div class="specorator-root" style="padding: 24px; background: var(--sp-bg-primary);">
				<NavSidebarButton v-bind="args" />
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof NavSidebarButton>;

export const Default: Story = {};

export const Disabled: Story = {
	args: { disabled: true },
};
