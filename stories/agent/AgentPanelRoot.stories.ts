import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AgentPanelRoot from '@/ui/agent/AgentPanelRoot.vue';

/**
 * The empty P0 agent panel (SPEC-PSR-006). The only surviving Storybook surface
 * after the reboot; chat/feature/onboarding stories regrow per phase. i18n is
 * installed by `.storybook/preview.ts`.
 */
const meta = {
	title: 'Agent/AgentPanelRoot',
	component: AgentPanelRoot,
} satisfies Meta<typeof AgentPanelRoot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
