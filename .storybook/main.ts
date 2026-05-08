import type { StorybookConfig } from '@storybook/vue3-vite'
import { fileURLToPath } from 'node:url'

const config: StorybookConfig = {
  framework: '@storybook/vue3-vite',
  stories: ['../stories/**/*.stories.@(ts|mdx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  viteFinal: async (cfg) => {
    cfg.resolve = cfg.resolve ?? {}
    cfg.resolve.alias = {
      ...(cfg.resolve.alias ?? {}),
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    }
    return cfg
  },
}

export default config
