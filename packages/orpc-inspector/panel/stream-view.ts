import type { OrpcCall } from '../src/core/types'

export type StreamEntry
  = | { kind: 'event', /** 1-based position in the whole stream */ position: number, value: unknown }
    | { kind: 'divider', /** 1-based attempt number */ attempt: number }

export interface StreamView {
  /** Events received over the whole stream */
  total: number
  /** Events kept in the record (the last ones) */
  kept: number
  entries: StreamEntry[]
}

/** 0-based position of the first kept event; older events were dropped */
function firstKept(call: OrpcCall) {
  return (call.eventCount ?? 0) - (call.events?.length ?? 0)
}

/** Attempts that reconnected the stream, with their 1-based number */
function reconnects(call: OrpcCall) {
  return (call.attempts ?? []).flatMap((attempt, i) => attempt.eventsBefore === undefined
    ? []
    : [
        { attempt: i + 1, start: attempt.eventsBefore },
      ])
}

/** Events to show for a streamed call, with a divider before each reconnect; undefined when the call is not a stream */
export function streamView(call: OrpcCall): StreamView | undefined {
  if (call.eventCount === undefined)
    return
  const events = call.events ?? []
  const first = firstKept(call)
  // A reconnect that starts among the dropped events has nothing kept to divide
  const dividers = reconnects(call).filter(r => r.start >= first)
  const entries: StreamEntry[] = []
  let next = 0
  events.forEach((value, i) => {
    const position = first + i
    while (next < dividers.length && dividers[next]!.start <= position)
      entries.push({ kind: 'divider', attempt: dividers[next++]!.attempt })
    entries.push({ kind: 'event', position: position + 1, value })
  })
  // Reconnects that delivered no events yet
  while (next < dividers.length)
    entries.push({ kind: 'divider', attempt: dividers[next++]!.attempt })
  return { total: call.eventCount, kept: events.length, entries }
}

/** Kept events grouped by the attempt that delivered them, keyed `attempt <n>`; undefined when the stream never reconnected */
export function eventsByAttempt(call: OrpcCall): Record<string, unknown[]> | undefined {
  const marked = reconnects(call)
  if (!marked.length || !call.events)
    return
  // The stream began on the last attempt before the first reconnect
  const opening = { attempt: marked[0]!.attempt - 1, start: 0 }
  const ranges = [opening, ...marked].map((r, i, all) => ({
    ...r,
    end: all[i + 1]?.start ?? call.eventCount ?? 0,
  }))
  const first = firstKept(call)
  const groups: Record<string, unknown[]> = {}
  for (const range of ranges) {
    // Skip attempts whose events were all dropped
    if (range.start < first && range.end <= first)
      continue
    const from = Math.max(range.start, first) - first
    groups[`attempt ${range.attempt}`] = call.events.slice(from, range.end - first)
  }
  return groups
}
