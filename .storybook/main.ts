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
    // Pre-bundle the surviving story's runtime deps so the browser-mode test
    // does not trigger an on-the-fly dep-optimize + reload mid-run. With only
    // one story after the P0 reboot, a late optimize collides with the single
    // test and throws "Vitest failed to find the current suite" (R-PSR-4).
    cfg.optimizeDeps = cfg.optimizeDeps ?? {}
    cfg.optimizeDeps.include = [
      ...(cfg.optimizeDeps.include ?? []),
      'vue',
      'vue-i18n',
      'pinia',
      'vue-router',
    ]
    return cfg
  },
}

export default config
