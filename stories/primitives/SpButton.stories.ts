import type { Meta, StoryObj } from '@storybook/vue3-vite'
import SpButton from '@/ui/components/primitives/SpButton.vue'

/**
 * Storybook coverage for `<SpButton>` (REQ-AUX-017, spec §1.3.12).
 *
 * The primitive has no port dependencies — every variant + state is
 * exercised purely through props + slot content.
 */
const meta: Meta<typeof SpButton> = {
	title: 'Primitives/SpButton',
	component: SpButton,
	args: { variant: 'secondary', disabled: false, loading: false, type: 'button' },
	argTypes: {
		variant: { control: { type: 'select' }, options: ['primary', 'secondary', 'ghost'] },
		disabled: { control: 'boolean' },
		loading: { control: 'boolean' },
		type: { control: { type: 'select' }, options: ['button', 'submit'] },
	},
	render: (args) => ({
		components: { SpButton },
		setup: () => ({ args }),
		template: '<SpButton v-bind="args">Send</SpButton>',
	}),
}
export default meta
type Story = StoryObj<typeof SpButton>

export const Primary: Story = { args: { variant: 'primary' } }
export const Secondary: Story = { args: { variant: 'secondary' } }
export const Ghost: Story = { args: { variant: 'ghost' } }

export const Disabled: Story = {
	args: { variant: 'secondary', disabled: true },
}

export const Loading: Story = {
	args: { variant: 'primary', loading: true },
}

export const AllVariants: Story = {
	render: () => ({
		components: { SpButton },
		template: `
			<div style="display: flex; gap: 12px; align-items: center;">
				<SpButton variant="primary">Primary</SpButton>
				<SpButton variant="secondary">Secondary</SpButton>
				<SpButton variant="ghost">Ghost</SpButton>
			</div>
		`,
	}),
}
