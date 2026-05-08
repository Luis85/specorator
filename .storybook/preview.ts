import type { Preview } from '@storybook/vue3-vite'
import { setup } from '@storybook/vue3-vite'
import { createPinia } from 'pinia'
import { i18n } from '../src/ui/i18n'
import './obsidian-theme.css'

setup((app) => {
  app.use(createPinia())
  app.use(i18n)
})

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Obsidian theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light', right: '☀️' },
          { value: 'dark', title: 'Dark', right: '🌙' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (story, ctx) => {
      const theme = (ctx.globals as { theme?: 'light' | 'dark' }).theme ?? 'dark'
      document.body.classList.remove('theme-light', 'theme-dark')
      document.body.classList.add(`theme-${theme}`)
      return story()
    },
  ],
  parameters: {
    backgrounds: { disable: true },
    a11y: { test: 'todo' },
  },
}

export default preview
