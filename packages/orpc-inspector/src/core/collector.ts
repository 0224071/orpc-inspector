import type { CallSink } from './recorder'
import type { OrpcCall } from './types'

/** One per server-side request: collects only completed calls; records are masked when written */
export class OrpcInspectorCollector implements CallSink {
  readonly side = 'ssr'
  private readonly calls: OrpcCall[] = []

  commit(call: OrpcCall, done: boolean): void {
    if (done)
      this.calls.push(call)
  }

  /** JSON-safe records, sorted by start time */
  serialize(): OrpcCall[] {
    return this.calls.slice().sort((a, b) => a.startedAt - b.startedAt)
  }
}
