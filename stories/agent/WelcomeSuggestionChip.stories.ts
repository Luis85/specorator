import type { Meta, StoryObj } from '@storybook/vue3-vite';
import WelcomeSuggestionChip from '@/ui/components/agent/WelcomeSuggestionChip.vue';

/**
 * Storybook coverage for `<WelcomeSuggestionChip>` (WS-AUX-4, T-AUX-213).
 * Pure presentational chip in the welcome surface suggestion grid; click
 * bubbles via `pick`. Satisfies REQ-AUX-007 and the WS-AUX-10 Storybook
 * coverage gate (T-AUX-345).
 *
 * QW-D — chip now supports a Lucide icon rendered via `<SpIcon>`.
 */
const meta: Meta<typeof WelcomeSuggestionChip> = {
	title: 'Agent/WelcomeSuggestionChip',
	component: WelcomeSuggestionChip,
	args: {
		id: 'findOrphans',
		label: 'Find orphan notes',
		icon: 'unplug',
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

export const SummarizeActive: Story = {
	args: { id: 'summarizeActive', label: 'Summarize active note', icon: 'file-text' },
};

export const ProjectsTag: Story = {
	args: { id: 'projectsTag', label: 'Find #project notes', icon: 'hash' },
};

export const BrokenLinks: Story = {
	args: { id: 'brokenLinks', label: 'Audit broken wikilinks', icon: 'link-2-off' },
};

export const NoIcon: Story = {
	args: { id: 'findOrphans', label: 'Find orphan notes', icon: undefined },
};
