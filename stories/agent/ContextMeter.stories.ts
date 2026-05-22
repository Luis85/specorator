import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';

import ContextMeter from '@/ui/components/agent/ContextMeter.vue';
import { useContextUsageStore } from '@/ui/stores/contextUsageStore';

/**
 * Storybook coverage for `<ContextMeter>` (REQ-AUX-004 / REQ-AUX-017,
 * spec §1.3.4). Six stories covering 0/25/50/80/95% + unknown-cap.
 */
function seed(fraction: number | null): void {
	setActivePinia(createPinia());
	const store = useContextUsageStore();
	if (fraction === null) {
		store.recordTokens(500);
		return;
	}
	const cap = 1000;
	store.setCap('claude', 'sonnet', cap);
	store.recordTokens(Math.round(cap * fraction));
}

const meta: Meta<typeof ContextMeter> = {
	title: 'Agent/ContextMeter',
	component: ContextMeter,
};
export default meta;
type Story = StoryObj<typeof ContextMeter>;

function story(fraction: number | null): Story {
	return {
		render: () => ({
			components: { ContextMeter },
			setup() {
				seed(fraction);
				return {};
			},
			template: `
				<div class="specorator-root" style="padding: 16px; display: inline-flex; gap: 12px;">
					<ContextMeter />
				</div>
			`,
		}),
	};
}

export const Empty: Story = story(0);
export const Quarter: Story = story(0.25);
export const Half: Story = story(0.5);
export const Warning: Story = story(0.8);
export const NearFull: Story = story(0.95);
export const UnknownCap: Story = story(null);
