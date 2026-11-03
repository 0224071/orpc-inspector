import type { OrpcCall } from 'orpc-inspector'
import { hydrateOrpcInspector } from 'orpc-inspector'
import { toRaw } from 'vue'
import { defineNuxtPlugin, useState } from '#app'
import { ORPC_INSPECTOR_SSR_STATE } from './shared'
// Start the page script (and the zodLocale translator when set) through the Vite plugin's entry, shared with plain Vite
import 'virtual:orpc-inspector/client'

export default defineNuxtPlugin({
  name: 'orpc-inspector:hydrate',
  setup() {
    const state = useState<OrpcCall[]>(ORPC_INSPECTOR_SSR_STATE, () => [])
    // useState is a reactive proxy; unwrap to the raw object so structuredClone works
    hydrateOrpcInspector(toRaw(state.value))
  },
})
