import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AppToast from '@/ui/components/common/AppToast.vue'
import { useNotificationStore } from '@/ui/stores/notificationStore'

const meta: Meta<typeof AppToast> = {
  title: 'Common/AppToast',
  component: AppToast,
}
export default meta
type Story = StoryObj<typeof AppToast>

export const SingleNotice: Story = {
  render: () => ({
    components: { AppToast },
    setup() {
      const store = useNotificationStore()
      store.clearAll()
      store.addNotice('Feature created successfully', 0)
      return {}
    },
    template: `<AppToast />`,
  }),
}

export const MultipleNotices: Story = {
  render: () => ({
    components: { AppToast },
    setup() {
      const store = useNotificationStore()
      store.clearAll()
      store.addNotice('Workflow advanced to research', 0)
      store.addNotice('Saved settings', 0)
      store.addNotice('Failed to load feature', 0)
      return {}
    },
    template: `<AppToast />`,
  }),
}
