import type { OrpcCall, OrpcCallAttempt } from '../../src/core/types'
import { describe, expect, it } from 'vitest'
import { eventsByAttempt, streamView } from '../../panel/stream-view'

function stream(events: unknown[], eventCount: number, attempts: Partial<OrpcCallAttempt>[] = [{}]): OrpcCall {
  return {
    id: '1',
    procedure: 'feed',
    side: 'client',
    state: 'success',
    startedAt: 0,
    events,
    eventCount,
    attempts: attempts.map(attempt => ({
      method: 'POST',
      url: 'http://local/rpc/feed',
      status: 200,
      ...attempt,
    })),
  }
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('streamView', () => {
  it('is undefined for a call without a stream', () => {
    expect(streamView({
      ...stream([], 0),
      eventCount: undefined,
      events: undefined,
    })).toBeUndefined()
  })

  it('labels every event of a full stream from 1', () => {
    expect(streamView(stream(['a', 'b'], 2))).toEqual({
      total: 2,
      kept: 2,
      entries: [
        { kind: 'event', position: 1, value: 'a' },
        { kind: 'event', position: 2, value: 'b' },
      ],
    })
  })

  it('labels kept events by their position in the whole stream', () => {
    const view = streamView(stream(range(51, 150), 150))!
    expect(view).toMatchObject({ total: 150, kept: 100 })
    expect(view.entries[0]).toEqual({ kind: 'event', position: 51, value: 51 })
    expect(view.entries.at(-1)).toEqual({ kind: 'event', position: 150, value: 150 })
  })

  it('puts a divider before the first event of a reconnect', () => {
    const view = streamView(stream([0, 1, 0, 1, 0, 1], 6, [
      {},
      { eventsBefore: 2 },
      { eventsBefore: 4 },
    ]))!
    expect(view.entries.map(entry => entry.kind === 'event'
      ? entry.position
      : `#${entry.attempt}`))
      .toEqual([1, 2, '#2', 3, 4, '#3', 5, 6])
  })

  it('shows a reconnect that has delivered nothing yet at the end', () => {
    const view = streamView(stream([0, 1], 2, [
      {},
      { eventsBefore: 2 },
    ]))!
    expect(view.entries.at(-1)).toEqual({ kind: 'divider', attempt: 2 })
  })

  it('hides a divider that points into the dropped events', () => {
    const view = streamView(stream(range(51, 150), 150, [
      {},
      { eventsBefore: 30 },
      { eventsBefore: 120 },
    ]))!
    const dividers = view.entries.filter(entry => entry.kind === 'divider')
    expect(dividers).toEqual([
      { kind: 'divider', attempt: 3 },
    ])
    const index = view.entries.indexOf(dividers[0]!)
    expect(view.entries[index + 1]).toMatchObject({ position: 121 })
  })

  it('shows no dividers for records without reconnect marks', () => {
    const view = streamView(stream([1, 2, 3], 3, [
      { status: 503 },
      {},
    ]))!
    expect(view.entries.every(entry => entry.kind === 'event')).toBe(true)
  })
})

describe('eventsByAttempt', () => {
  it('is undefined when the stream never reconnected', () => {
    expect(eventsByAttempt(stream([1, 2], 2, [
      { status: 503 },
      {},
    ]))).toBeUndefined()
  })

  it('groups events by the attempt that delivered them', () => {
    // Attempt 1 failed before the stream began; attempt 2 opened it
    const call = stream([0, 1, 0, 1, 0], 5, [
      { status: 503 },
      {},
      { eventsBefore: 2 },
      { eventsBefore: 4 },
    ])
    expect(eventsByAttempt(call)).toEqual({
      'attempt 2': [0, 1],
      'attempt 3': [0, 1],
      'attempt 4': [0],
    })
  })

  it('leaves out attempts whose events were all dropped', () => {
    const call = stream(range(51, 150), 150, [
      {},
      { eventsBefore: 30 },
      { eventsBefore: 120 },
    ])
    expect(eventsByAttempt(call)).toEqual({
      'attempt 2': range(51, 120),
      'attempt 3': range(121, 150),
    })
  })
})
