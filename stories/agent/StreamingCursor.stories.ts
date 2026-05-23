import type { Meta, StoryObj } from '@storybook/vue3-vite';
import StreamingCursor from '@/ui/components/agent/StreamingCursor.vue';

/**
 * Storybook coverage for `<StreamingCursor>` (REQ-AUX-008 / REQ-AUX-017,
 * spec §1.3.6). Two stories: default (animated) + reduced-motion (static).
 */
const meta: Meta<typeof StreamingCursor> = {
	title: 'Agent/StreamingCursor',
	component: StreamingCursor,
	render: () => ({
		components: { StreamingCursor },
		template: `
			<div class="specorator-root" style="padding: 16px; font-size: 14px;">
				<p style="color: var(--sp-text-normal, #ddd);">
					Streaming text ends here<StreamingCursor />
				</p>
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof StreamingCursor>;

export const Default: Story = {};

export const ReducedMotion: Story = {
	parameters: {
		chromatic: { prefersReducedMotion: 'reduce' },
	},
	render: () => ({
		components: { StreamingCursor },
		template: `
			<div class="specorator-root" style="padding: 16px; font-size: 14px;">
				<p style="color: var(--sp-text-normal, #ddd);">
					prefers-reduced-motion: reduce — cursor is static.<StreamingCursor />
				</p>
			</div>
		`,
	}),
};
