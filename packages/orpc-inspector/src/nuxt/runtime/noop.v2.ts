import type { OrpcInspectorPlugin } from 'orpc-inspector/v2'

/** Production auto-import for oRPC v2 projects: returns a do-nothing link plugin with no recording code */
export function useOrpcInspectorPlugin(): OrpcInspectorPlugin {
  return {
    name: 'orpc-inspector',
    init: options => options,
  } as OrpcInspectorPlugin
}
