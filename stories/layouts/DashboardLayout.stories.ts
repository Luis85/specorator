import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DashboardLayout from '@/ui/layouts/DashboardLayout.vue'

const meta: Meta<typeof DashboardLayout> = {
  title: 'Layouts/DashboardLayout',
  component: DashboardLayout,
}
export default meta
type Story = StoryObj<typeof DashboardLayout>

const cardStyle =
  'background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:1rem;'

export const Default: Story = {
  render: () => ({
    components: { DashboardLayout },
    template: `
      <DashboardLayout>
        <div style="${cardStyle}"><h3 style="margin:0 0 0.5rem;">Active features</h3><p style="margin:0;font-size:1.5rem;">12</p></div>
        <div style="${cardStyle}"><h3 style="margin:0 0 0.5rem;">In review</h3><p style="margin:0;font-size:1.5rem;">3</p></div>
        <div style="${cardStyle}"><h3 style="margin:0 0 0.5rem;">Archived</h3><p style="margin:0;font-size:1.5rem;">47</p></div>
        <div style="${cardStyle}"><h3 style="margin:0 0 0.5rem;">Decisions</h3><p style="margin:0;font-size:1.5rem;">9</p></div>
      </DashboardLayout>
    `,
  }),
}

export const WithHeaderAndFooter: Story = {
  render: () => ({
    components: { DashboardLayout },
    template: `
      <DashboardLayout>
        <template #header>
          <h1 style="margin:0;font-size:1.125rem;">Workflow overview</h1>
        </template>
        <div style="${cardStyle}"><h3 style="margin:0 0 0.5rem;">KPI 1</h3><p style="margin:0;font-size:1.5rem;">42</p></div>
        <div style="${cardStyle}"><h3 style="margin:0 0 0.5rem;">KPI 2</h3><p style="margin:0;font-size:1.5rem;">17</p></div>
        <template #footer>
          <small>Updated just now</small>
        </template>
      </DashboardLayout>
    `,
  }),
}
