import type { ClientContext } from '@orpc/client'
import { OrpcInspectorPlugin } from 'orpc-inspector'
import { useNuxtApp } from '#app'
import { getRequestCollector } from './shared'

/**
 * For the oRPC link's `plugins`. On the server it binds to the current request's collector and records reach the client via the payload;
 * on the client it writes to the page store. Must be called inside a Nuxt plugin / setup.
 */
export function useOrpcInspectorPlugin<T extends ClientContext = ClientContext>(): OrpcInspectorPlugin<T> {
  if (import.meta.server) {
    return new OrpcInspectorPlugin<T>({
      collector: getRequestCollector(useNuxtApp()),
    })
  }
  return new OrpcInspectorPlugin<T>()
}
