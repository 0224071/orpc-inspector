export default defineNuxtConfig({
  modules: ['orpc-inspector/nuxt'],
  // `nuxt build --envName inspector` keeps the inspector in the build (see docs/dev.md)
  $env: {
    inspector: {
      orpcInspector: { production: true, zodLocale: 'zh-TW' },
    },
  },
  compatibilityDate: '2026-10-01',
})
