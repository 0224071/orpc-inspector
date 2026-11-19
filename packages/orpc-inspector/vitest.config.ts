import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// node: core, v1 adapter, collector, serialization; orpc-v2: v2 adapter with @orpc/* resolved to the v2 aliases;
// happy-dom: store, page script and panel components (in test/dom)
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/dom/**', 'test/orpc-v2/**'],
        },
      },
      {
        resolve: {
          // Bare @orpc/* imports in src (e.g. the core's error classes) get the same v2 install the tests use
          alias: [
            { find: /^@orpc\/(client|contract|server|openapi)(\/.*)?$/, replacement: '@orpc/$1-v2$2' },
          ],
        },
        test: {
          name: 'orpc-v2',
          environment: 'node',
          include: ['test/orpc-v2/**/*.test.ts'],
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
