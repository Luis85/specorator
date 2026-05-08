import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AppBadge from '@/ui/components/common/AppBadge.vue'

const meta: Meta<typeof AppBadge> = {
  title: 'Common/AppBadge',
  component: AppBadge,
  args: { status: 'draft' },
  argTypes: {
    status: { control: 'select', options: ['draft', 'active', 'archived', 'abandoned'] },
  },
}
export default meta
type Story = StoryObj<typeof AppBadge>

export const Draft: Story = { args: { status: 'draft' } }
export const Active: Story = { args: { status: 'active' } }
export const Archived: Story = { args: { status: 'archived' } }
export const Abandoned: Story = { args: { status: 'abandoned' } }
