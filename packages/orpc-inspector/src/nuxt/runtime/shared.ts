import type { NuxtApp } from '#app'
import { OrpcInspectorCollector } from 'orpc-inspector'

/** Call records from SSR are carried to the client via the payload (useState) */
export const ORPC_INSPECTOR_SSR_STATE = 'orpc-inspector:ssr'

const COLLECTOR = Symbol.for('orpc-inspector:nuxt-collector')

/** Collector for the current SSR request; one nuxtApp per request, created lazily on first use */
export function getRequestCollector(nuxtApp: NuxtApp): OrpcInspectorCollector {
  const app = nuxtApp as NuxtApp & { [COLLECTOR]?: OrpcInspectorCollector }
  app[COLLECTOR] ??= new OrpcInspectorCollector()
  return app[COLLECTOR]
}
