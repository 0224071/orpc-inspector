import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The panel is prebuilt as a standalone SPA; Vue, the devframe client and the Tailwind styles are all bundled into dist/panel
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
  ],
  build: {
    outDir: fileURLToPath(new URL('../dist/panel', import.meta.url)),
    emptyOutDir: true,
  },
})
