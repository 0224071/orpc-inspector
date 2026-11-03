import { AsyncLocalStorage } from 'node:async_hooks'
import { NetworkReadyState } from 'msw/experimental'
import { OrpcInspectorCollector, renderOrpcInspectorScript, setCollectorResolver } from 'orpc-inspector'
import { network } from 'virtual:msw'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { handlers } from './mocks/handlers'
import { SSR_RESULT_GLOBAL, SSR_RESULT_KEY } from './ssr-state'

/**
 * On node, MSW patches globalThis.fetch; the link grabs fetch when it is created,
 * so client and App must be loaded after MSW is enabled
 */
async function setup() {
  // Editing this file re-runs the module, but the virtual:msw network stays the same
  if (network.readyState !== NetworkReadyState.ENABLED) {
    network.configure({ handlers, onUnhandledFrame: 'bypass' })
    await network.enable()
  }
  const [{ client }, { default: App }, { runScenario }] = await Promise.all([
    import('./api/client'),
    import('./App.vue'),
    import('./scenarios'),
  ])
  return { client, App, runScenario }
}

let ready: ReturnType<typeof setup> | undefined

// One collector per request; the singleton client finds the current request's collector via the resolver
const requestCollector = new AsyncLocalStorage<OrpcInspectorCollector>()
setCollectorResolver(() => requestCollector.getStore())

export async function render() {
  const { client, App, runScenario } = await (ready ??= setup())
  const collector = new OrpcInspectorCollector()
  return requestCollector.run(collector, async () => {
    const ssrResult = await runScenario(() => client.get())
    const app = createSSRApp(App)
    app.provide(SSR_RESULT_KEY, ssrResult)
    const appHtml = await renderToString(app)
    const resultJson = JSON.stringify(ssrResult).replace(/</g, '\u003C')
    return {
      appHtml,
      head: `${renderOrpcInspectorScript(collector)}<script>window.${SSR_RESULT_GLOBAL}=${resultJson}</script>`,
    }
  })
}
