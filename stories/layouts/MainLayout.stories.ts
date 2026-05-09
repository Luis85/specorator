import type { Meta, StoryObj } from '@storybook/vue3-vite'
import MainLayout from '@/ui/layouts/MainLayout.vue'

const meta: Meta<typeof MainLayout> = {
  title: 'Layouts/MainLayout',
  component: MainLayout,
}
export default meta
type Story = StoryObj<typeof MainLayout>

export const Default: Story = {
  render: () => ({
    components: { MainLayout },
    template: `
      <MainLayout>
        <div style="padding:1rem;">
          <p>Default body content lives in the unnamed slot.</p>
        </div>
      </MainLayout>
    `,
  }),
}

export const WithHeaderAndFooter: Story = {
  render: () => ({
    components: { MainLayout },
    template: `
      <MainLayout>
        <template #header>
          <h1 style="margin:0;font-size:1rem;">Page header</h1>
        </template>
        <div style="padding:1rem;">
          <p>Body content rendered between the header and footer slots.</p>
        </div>
        <template #footer>
          <small>Layout footer slot</small>
        </template>
      </MainLayout>
    `,
  }),
}
