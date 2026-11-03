import { network } from 'virtual:msw'
import { createApp, createSSRApp } from 'vue'
import App from './App.vue'
import { handlers } from './mocks/handlers'
import { SSR_RESULT_KEY } from './ssr-state'

async function start() {
  network.configure({ handlers, onUnhandledFrame: 'bypass' })
  await network.enable()

  // An SSR result means the HTML was server-rendered, so hydrate
  const ssrResult = window.__PLAYGROUND_SSR__
  const app = ssrResult
    ? createSSRApp(App)
    : createApp(App)
  app.provide(SSR_RESULT_KEY, ssrResult ?? null)
  app.mount('#app')
}

void start()
