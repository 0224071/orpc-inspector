import { DevTools } from '@vitejs/devtools'
import vue from '@vitejs/plugin-vue'
import { msw } from 'msw/vite'
import { orpcInspector } from 'orpc-inspector/vite'
import { defineConfig } from 'vite'

// `--mode inspector` builds with the inspector included (see docs/dev.md)
export default defineConfig(({ mode }) => {
  const production = mode === 'inspector'
  return {
    // The `devtools` option keeps Vite DevTools running after `vite build`; the plugin form lets the build exit
    devtools: !production,
    // Avoid discovering msw/browser on first load, which triggers re-optimization and a full reload
    optimizeDeps: {
      include: ['msw/browser'],
    },
    plugins: [
      vue(),
      msw(),
      production && DevTools({
        build: { withApp: true, injection: true },
      }),
      orpcInspector({
        production,
        zodLocale: production ? 'zh-TW' : undefined,
      }),
    ],
  }
})
