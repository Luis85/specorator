import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import SpDropdownPanel from '@/ui/components/primitives/SpDropdownPanel.vue'

/**
 * Storybook coverage for `<SpDropdownPanel>` (REQ-AUX-017, spec §1.3.14).
 */
const meta: Meta<typeof SpDropdownPanel> = {
	title: 'Primitives/SpDropdownPanel',
	component: SpDropdownPanel,
	args: { open: true, ariaLabel: 'Models', anchorMode: 'dropup' },
	argTypes: {
		open: { control: 'boolean' },
		anchorMode: { control: { type: 'select' }, options: ['dropup', 'dropdown'] },
		ariaLabel: { control: 'text' },
	},
	render: (args) => ({
		components: { SpDropdownPanel },
		setup() {
			const open = ref(Boolean(args.open))
			return { args, open }
		},
		template: `
			<div class="specorator-root" style="position: relative; height: 320px; padding: 16px;">
				<button @click="open = !open">Toggle</button>
				<SpDropdownPanel
					v-bind="args"
					:open="open"
					@close="open = false"
				>
					<div style="display: grid; gap: 4px;">
						<button>Claude</button>
						<button>Codex</button>
						<button>Opencode</button>
					</div>
				</SpDropdownPanel>
			</div>
		`,
	}),
}
export default meta
type Story = StoryObj<typeof SpDropdownPanel>

export const Dropup: Story = { args: { anchorMode: 'dropup' } }
export const Dropdown: Story = { args: { anchorMode: 'dropdown' } }

export const LongContent: Story = {
	render: () => ({
		components: { SpDropdownPanel },
		setup() {
			const open = ref(true)
			return { open }
		},
		template: `
			<div class="specorator-root" style="position: relative; height: 320px; padding: 16px;">
				<SpDropdownPanel :open="open" ariaLabel="Models" @close="open = false">
					<div style="display: grid; gap: 4px;">
						<button v-for="i in 18" :key="i">Option {{ i }}</button>
					</div>
				</SpDropdownPanel>
			</div>
		`,
	}),
}

export const NarrowViewport: Story = {
	parameters: { viewport: { defaultViewport: 'mobile1' } },
	render: () => ({
		components: { SpDropdownPanel },
		setup() {
			const open = ref(true)
			return { open }
		},
		template: `
			<div class="specorator-root" style="position: relative; width: 320px; height: 320px; padding: 8px;">
				<SpDropdownPanel :open="open" ariaLabel="Models" @close="open = false">
					<div style="display: grid; gap: 4px;">
						<button>Claude Sonnet</button>
						<button>Claude Opus</button>
						<button>Codex</button>
					</div>
				</SpDropdownPanel>
			</div>
		`,
	}),
}
