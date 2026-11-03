import type { OrpcCall } from 'orpc-inspector'
import { defineNuxtPlugin, useState } from '#app'
import { getRequestCollector, ORPC_INSPECTOR_SSR_STATE } from './shared'

/** After render, writes this request's records into the payload; the client plugin then merges them into the store */
export default defineNuxtPlugin({
  name: 'orpc-inspector:ssr',
  setup(nuxtApp) {
    const collector = getRequestCollector(nuxtApp)
    const state = useState<OrpcCall[]>(ORPC_INSPECTOR_SSR_STATE, () => [])
    nuxtApp.hooks.hook('app:rendered', () => {
      state.value = collector.serialize()
    })
  },
})
