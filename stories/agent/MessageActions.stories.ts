import type { Meta, StoryObj } from '@storybook/vue3-vite';
import MessageActions from '@/ui/components/agent/MessageActions.vue';

/**
 * Storybook coverage for `<MessageActions>` (REQ-AUX-001 / REQ-AUX-002 /
 * REQ-AUX-016 / REQ-AUX-017, spec §1.4).
 */
const meta: Meta<typeof MessageActions> = {
	title: 'Agent/MessageActions',
	component: MessageActions,
	args: { messageId: 'm-1', role: 'assistant', isLatest: true, showFork: false },
	argTypes: {
		role: { control: { type: 'select' }, options: ['user', 'assistant'] },
		isLatest: { control: 'boolean' },
		showFork: { control: 'boolean' },
	},
	render: (args) => ({
		components: { MessageActions },
		setup: () => ({ args }),
		template: `
			<div class="specorator-root" style="padding: 16px;">
				<div class="sp-hover-host" style="
					padding: 12px;
					border: 1px dashed var(--sp-border, #888);
					border-radius: 6px;
				">
					<p style="margin: 0 0 8px;">Hover this row to reveal the actions.</p>
					<MessageActions v-bind="args" />
				</div>
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof MessageActions>;

export const AssistantLatest: Story = { args: { role: 'assistant', isLatest: true } };
export const AssistantOlder: Story = { args: { role: 'assistant', isLatest: false } };
export const User: Story = { args: { role: 'user', isLatest: false } };
export const WithFork: Story = {
	args: { role: 'assistant', isLatest: true, showFork: true },
};
