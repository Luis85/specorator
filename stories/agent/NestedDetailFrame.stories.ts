import type { Meta, StoryObj } from '@storybook/vue3-vite';
import NestedDetailFrame from '@/ui/components/agent/NestedDetailFrame.vue';

/**
 * Storybook coverage for `<NestedDetailFrame>` (REQ-AUX-013 / REQ-AUX-017,
 * spec §1.3.7). One story per `status` variant.
 */
const meta: Meta<typeof NestedDetailFrame> = {
	title: 'Agent/NestedDetailFrame',
	component: NestedDetailFrame,
	args: {
		icon: 'brain',
		label: 'Thinking',
		summary: 'Considering the user request',
		status: 'idle',
		defaultExpanded: true,
	},
	argTypes: {
		status: {
			control: { type: 'select' },
			options: ['idle', 'running', 'complete', 'error'],
		},
	},
	render: (args) => ({
		components: { NestedDetailFrame },
		setup: () => ({ args }),
		template: `
			<div class="specorator-root" style="padding: 16px;">
				<NestedDetailFrame v-bind="args">
					<p>The slotted body lives inside the indented region.</p>
					<pre style="font-family: var(--sp-font-mono, monospace);">{ "tool": "Bash", "args": ["ls", "-la"] }</pre>
				</NestedDetailFrame>
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof NestedDetailFrame>;

export const Idle: Story = { args: { status: 'idle' } };
export const Running: Story = { args: { status: 'running' } };
export const Complete: Story = { args: { status: 'complete' } };
export const ErrorState: Story = { args: { status: 'error' } };
export const Collapsed: Story = { args: { defaultExpanded: false } };
