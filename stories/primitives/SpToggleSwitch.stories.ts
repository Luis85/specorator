import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import SpToggleSwitch from '@/ui/components/primitives/SpToggleSwitch.vue'

/**
 * Storybook coverage for `<SpToggleSwitch>` (REQ-AUX-017, spec §1.3.13).
 */
const meta: Meta<typeof SpToggleSwitch> = {
	title: 'Primitives/SpToggleSwitch',
	component: SpToggleSwitch,
	args: { modelValue: false, label: 'Thinking', disabled: false },
	argTypes: {
		label: { control: 'text' },
		ariaLabel: { control: 'text' },
		modelValue: { control: 'boolean' },
		disabled: { control: 'boolean' },
	},
	render: (args) => ({
		components: { SpToggleSwitch },
		setup() {
			const value = ref(Boolean(args.modelValue))
			return { args, value }
		},
		template: '<SpToggleSwitch v-bind="args" v-model="value" />',
	}),
}
export default meta
type Story = StoryObj<typeof SpToggleSwitch>

export const Off: Story = { args: { modelValue: false, label: 'Thinking' } }
export const On: Story = { args: { modelValue: true, label: 'Thinking' } }
export const Disabled: Story = { args: { modelValue: false, label: 'Plan mode', disabled: true } }
export const LongLabel: Story = {
	args: {
		modelValue: false,
		label: 'Allow all tools without confirmation prompts',
	},
}
