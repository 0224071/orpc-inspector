import { OrpcInspectorPlugin } from 'orpc-inspector/v2'
import { useNuxtApp } from '#app'
import { getRequestCollector } from './shared'

/**
 * oRPC v2 version of `useOrpcInspectorPlugin()`, picked by the module when the project's `@orpc/client` is major 2.
 * For the link's `plugins`; on the server it binds to the current request's collector. Must be called inside a Nuxt plugin / setup.
 */
export function useOrpcInspectorPlugin(): OrpcInspectorPlugin {
  if (import.meta.server) {
    return new OrpcInspectorPlugin({
      collector: getRequestCollector(useNuxtApp()),
    })
  }
  return new OrpcInspectorPlugin()
}
