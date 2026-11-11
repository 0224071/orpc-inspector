/** Causes the disconnected state lists, in display order */
export const DISCONNECTED_CAUSES = ['appPage', 'clientScript', 'standalone'] as const

export type DisconnectedCause = typeof DISCONNECTED_CAUSES[number]

/** devframe 1.3.3 retries the hello with backoff up to a 3s cap; after that a parent or opener that never answered likely has no page script */
export const CLIENT_SCRIPT_WAIT_MS = 3000

export interface DiagnosticInput {
  status: 'connecting' | 'connected' | 'closed'
  /** The panel has a parent frame or an opener, i.e. a window the channel can say hello to */
  embedded: boolean
  /** Milliseconds since the panel started connecting */
  elapsed: number
}

export interface Diagnostic {
  show: boolean
  marked?: DisconnectedCause
}

export function diagnose({ status, embedded, elapsed }: DiagnosticInput): Diagnostic {
  if (status === 'connected')
    return { show: false }
  if (!embedded)
    return { show: true, marked: 'standalone' }
  return elapsed >= CLIENT_SCRIPT_WAIT_MS
    ? { show: true, marked: 'clientScript' }
    : { show: true }
}

/** Same topology as devframe's default handshake targets: parent chain plus opener */
export function isEmbedded(win: Window) {
  return win.parent !== win || !!win.opener
}
