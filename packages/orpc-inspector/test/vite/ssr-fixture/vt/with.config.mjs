// Vitest run by dev-ssr.test.ts, with the plugin from the installed copy
import { orpcInspector } from 'orpc-inspector/vite'

export default {
  plugins: [
    orpcInspector(),
  ],
  test: {
    include: ['vt/*.vt.ts'],
  },
}
