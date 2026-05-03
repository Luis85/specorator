import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'path'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
      exclude: [
        'src/infrastructure/obsidian/**',
        '**/__fixtures__/**',
        'src/infrastructure/mock/fixtures.ts',
      ],
    },
  },
  resolve: {
    alias: { '@': resolve(projectRoot, 'src') },
  },
})
