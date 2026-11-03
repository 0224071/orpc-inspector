import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// node: core, v1 adapter, collector, serialization; happy-dom: store, page script and panel components (in test/dom)
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/dom/**'],
        },
      },
      {
        plugins: [
          vue(),
        ],
        test: {
          name: 'happy-dom',
          environment: 'happy-dom',
          include: ['test/dom/**/*.test.ts'],
        },
      },
    ],
  },
})
