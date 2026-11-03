import type { ClientContext } from '@orpc/client'
import type { OrpcInspectorPlugin } from 'orpc-inspector'

/** Production auto-import: returns a do-nothing link plugin with no recording code */
export function useOrpcInspectorPlugin<T extends ClientContext = ClientContext>(): OrpcInspectorPlugin<T> {
  return {
    init() {},
  } as unknown as OrpcInspectorPlugin<T>
}
