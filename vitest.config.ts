import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { fileURLToPath } from 'node:url'
import { resolve } from 'path'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const alias = { '@': resolve(projectRoot, 'src') }

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/domain/**',
        'src/application/**',
        'src/infrastructure/**',
        'src/modules/**',
        'src/core/**',
      ],
      exclude: [
        'src/infrastructure/obsidian/**',
        '**/__fixtures__/**',
        'src/infrastructure/mock/fixtures.ts',
        'src/modules/**/*.vue',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
    projects: [
      {
        plugins: [vue()],
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        plugins: [vue(), storybookTest({ configDir: '.storybook' })],
        resolve: { alias },
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
