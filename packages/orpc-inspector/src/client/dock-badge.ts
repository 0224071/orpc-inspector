import type { OrpcCall } from '../core/types'
import { ORPC_INSPECTOR_DOCK_ID } from '../core/types'

/** Only the parts we use; see DocksEntriesContext in @devframes/hub/client */
interface DockEntry {
  id: string
  badge?: string
  badgeVariant?: 'default' | 'info' | 'success' | 'warning' | 'danger'
}

interface HubClientContext {
  docks: {
    entries: DockEntry[]
    register: (entry: DockEntry, force?: boolean) => { update: (patch: Partial<DockEntry>) => void }
  }
}

const CLIENT_CONTEXT_KEY = '__DEVFRAME_HUB_CLIENT_CONTEXT__'
const POLL_MS = 1000

export function toBadge(list: OrpcCall[]): Pick<DockEntry, 'badge' | 'badgeVariant'> {
  const invalid = list.filter(call => call.state === 'invalid').length
  const failed = list.filter(call => call.state === 'error').length
  if (invalid + failed === 0) {
    return { badge: undefined, badgeVariant: undefined }
  }
  return {
    badge: String(invalid + failed),
    badgeVariant: 'danger',
  }
}

/**
 * Shows the error count on the dock button, visible even when the panel is closed.
 * The badge can only be updated by a client-side dock: the hub publishes the client context only after authorization, so poll until it appears,
 * then register a client dock with the same id to locally override the server-registered one.
 */
export function syncDockBadge(
  getList: () => OrpcCall[],
  subscribe: (fn: (list: OrpcCall[]) => void) => void,
) {
  let update: ((patch: Partial<DockEntry>) => void) | undefined

  const attach = () => {
    const ctx = (globalThis as { [CLIENT_CONTEXT_KEY]?: HubClientContext })[CLIENT_CONTEXT_KEY]
    const serverEntry = ctx?.docks.entries.find(entry => entry.id === ORPC_INSPECTOR_DOCK_ID)
    if (!ctx || !serverEntry) {
      return false
    }
    update = ctx.docks.register({
      ...serverEntry,
      ...toBadge(getList()),
    }, true).update
    return true
  }

  if (!attach()) {
    const timer = setInterval(() => attach() && clearInterval(timer), POLL_MS)
  }

  subscribe(list => update?.(toBadge(list)))
}
