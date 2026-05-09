import type { Meta, StoryObj } from '@storybook/vue3-vite'
import PanelLayout from '@/ui/layouts/PanelLayout.vue'

const meta: Meta<typeof PanelLayout> = {
  title: 'Layouts/PanelLayout',
  component: PanelLayout,
  decorators: [
    (story) => ({
      components: { story },
      template: '<div style="width:320px;height:480px;border:1px solid var(--background-modifier-border);"><story /></div>',
    }),
  ],
}
export default meta
type Story = StoryObj<typeof PanelLayout>

export const Default: Story = {
  render: () => ({
    components: { PanelLayout },
    template: `
      <PanelLayout>
        <p>Panel body content. Designed for narrow widths used by Obsidian sidebar leaves.</p>
      </PanelLayout>
    `,
  }),
}

export const WithHeaderAndFooter: Story = {
  render: () => ({
    components: { PanelLayout },
    template: `
      <PanelLayout>
        <template #header>Chat session</template>
        <p>Each panel mounts <code>PanelLayout</code> directly without a router.</p>
        <p>Use the slots for compact sidebar UIs.</p>
        <template #footer>3 messages · synced</template>
      </PanelLayout>
    `,
  }),
}
