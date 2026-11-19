export default defineNuxtConfig({
  // disableAuthorization skips the one-time code so the smoke test can open the dock
  devtools: { enabled: true, disableAuthorization: true },
  modules: ['orpc-inspector/nuxt'],
  telemetry: false,
})
