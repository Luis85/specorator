import type { Meta, StoryObj } from '@storybook/vue3-vite';
import HelpPopover from '@/ui/components/agent/HelpPopover.vue';

/**
 * Storybook coverage for `<HelpPopover>` (WS-AUX-8b). Searchable, keyboard-
 * navigable command palette that replaces the static `/help` drawer inside
 * `AgentSidepanelRoot.vue`. The Default story renders the popover with eight
 * representative slash commands so the search + arrow-nav surface can be
 * exercised visually.
 */
const ITEMS = [
	{ id: 'clear', label: 'Clear input', shortcut: '/clear' },
	{ id: 'new', label: 'New conversation', shortcut: '/new' },
	{ id: 'help', label: 'Show help', shortcut: '/help' },
	{ id: 'advance', label: 'Advance stage', shortcut: '/advance-stage' },
	{ id: 'idea', label: 'Capture idea', shortcut: '/idea' },
	{ id: 'spec', label: 'Open spec', shortcut: '/spec' },
	{ id: 'tasks', label: 'Show tasks', shortcut: '/tasks' },
	{ id: 'review', label: 'Run review', shortcut: '/review' },
] as const;

const meta: Meta<typeof HelpPopover> = {
	title: 'Agent/HelpPopover',
	component: HelpPopover,
	render: () => ({
		components: { HelpPopover },
		setup() {
			return { items: ITEMS };
		},
		template: `
			<div class="specorator-root" style="padding: 16px; max-width: 360px;">
				<HelpPopover :items="items" />
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof HelpPopover>;

export const Default: Story = {};
