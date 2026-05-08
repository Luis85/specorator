import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within } from 'storybook/test'
import AppButton from '@/ui/components/common/AppButton.vue'

const meta: Meta<typeof AppButton> = {
  title: 'Common/AppButton',
  component: AppButton,
  args: { variant: 'secondary', size: 'md', disabled: false, loading: false },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md'] },
  },
  render: (args) => ({
    components: { AppButton },
    setup: () => ({ args }),
    template: `<AppButton v-bind="args">{{ args.label ?? 'Button' }}</AppButton>`,
  }),
}
export default meta
type Story = StoryObj<typeof AppButton>

export const Default: Story = {}

export const Primary: Story = { args: { variant: 'primary' } }

export const Loading: Story = { args: { loading: true, variant: 'primary' } }

export const ClickInteraction: Story = {
  args: { variant: 'primary' },
  render: (args) => ({
    components: { AppButton },
    setup: () => ({ args }),
    template: `<AppButton v-bind="args">Press</AppButton>`,
  }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const btn = await c.findByRole('button', { name: 'Press' })
    await expect(btn).toBeVisible()
    await userEvent.click(btn)
  },
}
