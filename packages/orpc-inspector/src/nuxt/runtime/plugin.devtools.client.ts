import { defineNuxtPlugin, useRuntimeConfig } from '#app'

/**
 * Production builds only: loads the Vite DevTools dock. `build.injection` adds this script through transformIndexHtml,
 * which Nuxt pages do not go through; the module serves the hub at <baseURL><buildAssetsDir>__devtools/
 */
export default defineNuxtPlugin({
  name: 'orpc-inspector:devtools',
  setup() {
    const { baseURL, buildAssetsDir } = useRuntimeConfig().app
    const path = `/${baseURL}/${buildAssetsDir}/__devtools/embedded.js`.replace(/\/{2,}/g, '/')
    const script = document.createElement('script')
    script.type = 'module'
    script.src = path
    document.body.appendChild(script)
  },
})
