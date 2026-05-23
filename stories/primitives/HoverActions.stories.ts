import type { Meta, StoryObj } from '@storybook/vue3-vite'
import HoverActions from '@/ui/components/primitives/HoverActions.vue'

/**
 * Storybook coverage for `<HoverActions>` (REQ-AUX-002 / REQ-AUX-017,
 * spec §1.3.2, ADR-AUX-003).
 *
 * Each story wraps the primitive in a `.sp-hover-host` parent so the
 * `:hover` / `:focus-within` reveal selectors apply. The
 * `reduced-motion` story sets `prefers-reduced-motion` via the Storybook
 * docs panel — visual contract is the snap (no transition).
 */
const meta: Meta<typeof HoverActions> = {
	title: 'Primitives/HoverActions',
	component: HoverActions,
	args: { placement: 'block-end-inline-end', alwaysVisible: false },
	argTypes: {
		placement: {
			control: { type: 'select' },
			options: ['block-end-inline-end', 'block-end-inline-start', 'block-start-inline-end'],
		},
		alwaysVisible: { control: 'boolean' },
	},
	render: (args) => ({
		components: { HoverActions },
		setup: () => ({ args }),
		template: `
			<div class="specorator-root">
				<div class="sp-hover-host" style="
					position: relative;
					padding: 16px 24px;
					min-height: 80px;
					min-width: 240px;
					border: 1px solid var(--sp-border, #ccc);
					border-radius: 8px;
				">
					<span>Hover me to reveal actions</span>
					<HoverActions v-bind="args" style="position: absolute; inset-block-end: 8px; inset-inline-end: 8px;">
						<button>copy</button>
						<button>edit</button>
					</HoverActions>
				</div>
			</div>
		`,
	}),
}
export default meta
type Story = StoryObj<typeof HoverActions>

export const BlockEndInlineEnd: Story = { args: { placement: 'block-end-inline-end' } }
export const BlockEndInlineStart: Story = { args: { placement: 'block-end-inline-start' } }
export const BlockStartInlineEnd: Story = { args: { placement: 'block-start-inline-end' } }
export const AlwaysVisible: Story = { args: { alwaysVisible: true } }

export const ReducedMotion: Story = {
	parameters: {
		// Storybook-a11y / preview decorator can flip this; the screenshot
		// captures the snap (no transition) behaviour.
		chromatic: { prefersReducedMotion: 'reduce' },
	},
	args: { alwaysVisible: true },
	render: () => ({
		components: { HoverActions },
		template: `
			<div class="specorator-root">
				<div class="sp-hover-host" style="
					padding: 16px;
					border: 1px solid var(--sp-border, #ccc);
					border-radius: 8px;
				">
					<p>prefers-reduced-motion: reduce — actions stay visible without transition.</p>
					<HoverActions :alwaysVisible="true">
						<button>copy</button>
						<button>edit</button>
					</HoverActions>
				</div>
			</div>
		`,
	}),
}
