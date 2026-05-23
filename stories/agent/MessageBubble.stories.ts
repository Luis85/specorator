import type { Meta, StoryObj } from '@storybook/vue3-vite';
import MessageBubble from '@/ui/components/agent/MessageBubble.vue';

/**
 * Storybook coverage for `<MessageBubble>` (REQ-AUX-005 / REQ-AUX-017,
 * spec §1.4). One story per role variant; long + RTL content covered.
 */
const meta: Meta<typeof MessageBubble> = {
	title: 'Agent/MessageBubble',
	component: MessageBubble,
	args: { role: 'user' },
	argTypes: {
		role: { control: { type: 'select' }, options: ['user', 'assistant', 'system'] },
	},
	render: (args) => ({
		components: { MessageBubble },
		setup: () => ({ args }),
		template: `
			<div class="specorator-root" style="
				display: flex;
				flex-direction: column;
				gap: 12px;
				padding: 16px;
				background: var(--sp-bg-primary, #111);
				min-block-size: 200px;
			">
				<MessageBubble v-bind="args">
					<p>Short example content.</p>
				</MessageBubble>
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof MessageBubble>;

export const UserShort: Story = { args: { role: 'user' } };
export const AssistantMarkdown: Story = {
	args: { role: 'assistant' },
	render: (args) => ({
		components: { MessageBubble },
		setup: () => ({ args }),
		template: `
			<div class="specorator-root" style="padding: 16px; background: var(--sp-bg-primary, #111);">
				<MessageBubble v-bind="args">
					<p>The assistant turn renders transparent and full-width.</p>
					<p>Multiple paragraphs are stacked without any chrome.</p>
				</MessageBubble>
			</div>
		`,
	}),
};
export const UserLongRtl: Story = {
	args: { role: 'user' },
	render: (args) => ({
		components: { MessageBubble },
		setup: () => ({ args }),
		template: `
			<div class="specorator-root" style="display: flex; flex-direction: column; padding: 16px; background: var(--sp-bg-primary, #111);">
				<MessageBubble v-bind="args">
					<p>هذه فقرة طويلة باللغة العربية لإظهار اتجاه النص التلقائي داخل فقاعة المستخدم.</p>
				</MessageBubble>
			</div>
		`,
	}),
};
export const System: Story = { args: { role: 'system' } };
