import type { Meta, StoryObj } from '@storybook/vue3-vite';
import InlineApprovalCard from '@/ui/components/agent/InlineApprovalCard.vue';

/**
 * Storybook coverage for `<InlineApprovalCard>` (WS-AUX-8a). Single
 * default story — Claudian-parity tabbed approval widget rendered with a
 * representative `Bash` tool request. Additive surface alongside
 * `ApprovalCard.vue`; MessageList swap-in happens in WS-8b.
 */
const meta: Meta<typeof InlineApprovalCard> = {
	title: 'Agent/InlineApprovalCard',
	component: InlineApprovalCard,
	render: () => ({
		components: { InlineApprovalCard },
		template: `
			<div class="specorator-root" style="padding: 16px; max-width: 480px;">
				<InlineApprovalCard
					:request="{ tool: 'Bash', scope: 'git status', previewText: '$ git status' }"
					providerId="claude"
				/>
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof InlineApprovalCard>;

export const Default: Story = {};
