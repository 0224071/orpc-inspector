import type { PreserveLog } from '../../src/client/preserve-log'
import type { OrpcCall } from '../../src/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseLog,
  PRESERVE_LOG_ENABLED_KEY,
  PRESERVE_LOG_RECORDS_KEY,
  RECORD_LIMIT,
  serializeLog,
  startPreserveLog,
  TOTAL_LIMIT,
} from '../../src/client/preserve-log'
import { getOrpcInspectorStore } from '../../src/core/store'

const STORE_KEY = Symbol.for('orpc-inspector:store')
const g = globalThis as Record<PropertyKey, unknown>

function makeCall(id: string, patch: Partial<OrpcCall> = {}): OrpcCall {
  return {
    id,
    procedure: 'auth.login',
    side: 'client',
    state: 'success',
    startedAt: 0,
    ...patch,
  }
}

let current: PreserveLog | undefined

/** A new document in the same tab: memory is gone, sessionStorage stays */
function newDocument() {
  current?.dispose()
  delete g[STORE_KEY]
  const store = getOrpcInspectorStore()
  return {
    store,
    start: () => (current = startPreserveLog(store)),
  }
}

/** happy-dom's sessionStorage is a proxy its methods can't be spied on through, so each test gets a plain one */
class MemoryStorage implements Storage {
  [name: string]: any
  #items = new Map<string, string>()
  get length() {
    return this.#items.size
  }

  clear() {
    this.#items.clear()
  }

  getItem(key: string) {
    return this.#items.get(key) ?? null
  }

  key(index: number) {
    return [
      ...this.#items.keys(),
    ][index] ?? null
  }

  removeItem(key: string) {
    this.#items.delete(key)
  }

  setItem(key: string, value: string) {
    this.#items.set(key, String(value))
  }
}

let storage: MemoryStorage
const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')

const saved = () => parseLog(sessionStorage.getItem(PRESERVE_LOG_RECORDS_KEY))
const ids = (list: OrpcCall[]) => list.map(call => call.id)

function savedWith(list: OrpcCall[], dropped = 0) {
  sessionStorage.setItem(PRESERVE_LOG_ENABLED_KEY, '1')
  sessionStorage.setItem(PRESERVE_LOG_RECORDS_KEY, serializeLog(list, { carried: dropped }).json)
}

/** Fails writes of the records key whose value matches */
function refuseWrites(match: (value: string) => boolean) {
  const real = storage.setItem.bind(storage)
  vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
    if (key === PRESERVE_LOG_RECORDS_KEY && match(value))
      throw new DOMException('full', 'QuotaExceededError')
    real(key, value)
  })
}

/** happy-dom's PageTransitionEvent has no `persisted` */
function pageshow(persisted: boolean) {
  const event = new Event('pageshow')
  Object.defineProperty(event, 'persisted', { value: persisted })
  dispatchEvent(event)
}

beforeEach(() => {
  storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get: () => storage,
  })
  vi.useFakeTimers()
})

afterEach(() => {
  current?.dispose()
  current = undefined
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (original)
    Object.defineProperty(globalThis, 'sessionStorage', original)
  else
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage
})

describe('saved form', () => {
  it('masks top-level, per-attempt and error-data headers and keeps bodies', () => {
    const call = makeCall('a', {
      state: 'error',
      requestHeaders: { 'authorization': 'Bearer abc', 'x-trace': '1' },
      responseHeaders: {
        'set-cookie': ['s=1'],
      },
      attempts: [
        {
          method: 'POST',
          url: '/rpc',
          requestHeaders: { authorization: 'Bearer abc' },
          status: 502,
        },
        {
          method: 'POST',
          url: '/rpc',
          requestHeaders: { authorization: 'Bearer abc' },
          status: 401,
        },
      ],
      output: { accessToken: 'xyz' },
      error: {
        name: 'ORPCError',
        message: 'x',
        data: {
          headers: { cookie: 'c=1' },
          body: 'token=1',
        },
      },
    })
    const { json } = serializeLog([call], { carried: 0 })
    expect(json).not.toContain('Bearer abc')
    const [restored] = JSON.parse(json).list as OrpcCall[]
    expect(restored!.requestHeaders).toEqual({ 'authorization': '***', 'x-trace': '1' })
    expect(restored!.responseHeaders).toEqual({ 'set-cookie': '***' })
    expect(restored!.attempts!.map(a => a.requestHeaders?.authorization)).toEqual(['***', '***'])
    expect(restored!.error!.data).toEqual({
      headers: { cookie: '***' },
      body: 'token=1',
    })
    expect(restored!.output).toEqual({ accessToken: 'xyz' })
    // The record in memory keeps its values
    expect(call.requestHeaders!.authorization).toBe('Bearer abc')
  })

  it('saves a record over the per-record limit as a summary that keeps the event count', () => {
    const big = 'x'.repeat(1_000_000)
    const call = makeCall('a', {
      state: 'streaming',
      input: { q: 1 },
      output: big,
      events: Array.from({ length: 100 }, (_, i) => i),
      eventCount: 400,
      status: 200,
      responseHeaders: { 'content-type': 'text/event-stream' },
    })
    const log = serializeLog([call], { carried: 0 })
    const [summary] = JSON.parse(log.json).list as OrpcCall[]
    expect(log.summarized).toBe(1)
    expect(summary).toMatchObject({
      id: 'a',
      procedure: 'auth.login',
      state: 'streaming',
      status: 200,
      eventCount: 400,
    })
    expect(summary!.responseHeaders).toEqual({ 'content-type': 'text/event-stream' })
    expect(summary).not.toHaveProperty('output')
    expect(summary).not.toHaveProperty('events')
    expect(summary!.notPreserved!.fields).toEqual(['input', 'output', 'events'])
    expect(summary!.notPreserved!.size).toBeGreaterThan(RECORD_LIMIT)
  })

  it('keeps a summary\'s error without its data', () => {
    const call = makeCall('a', {
      state: 'error',
      error: {
        name: 'E',
        message: 'm',
        data: 'x'.repeat(RECORD_LIMIT),
      },
    })
    const [summary] = JSON.parse(serializeLog([call], { carried: 0 }).json).list as OrpcCall[]
    expect(summary!.error).toEqual({ name: 'E', message: 'm' })
    expect(summary!.notPreserved!.fields).toEqual(['error.data'])
  })

  it('saves the newest records within the total limit and counts the rest', () => {
    // 25 records of ~48 K characters each, 1.2 M in total
    const list = Array.from({ length: 25 }, (_, i) => makeCall(`c${i}`, {
      output: 'x'.repeat(48_000),
    }))
    const log = serializeLog(list, { carried: 3 })
    const parsed = JSON.parse(log.json)
    expect(log.json.length).toBeLessThanOrEqual(TOTAL_LIMIT)
    expect(parsed.list[0].id).toBe('c0')
    // Records that don't fit in full are tried as summaries before the rest is left out
    expect(log.summarized).toBeGreaterThan(0)
    expect(parsed.list.length + log.dropped).toBe(25)
    expect(parsed.dropped).toBe(3 + log.dropped)
  })

  it('keeps record fields unknown to this version', () => {
    const call = {
      ...makeCall('a'),
      page: '/orders',
    } as OrpcCall
    expect(JSON.parse(serializeLog([call], { carried: 0 }).json).list[0].page).toBe('/orders')
  })

  it('serializes an unchanged record once', () => {
    const cache = new WeakMap()
    const call = makeCall('a')
    const spy = vi.spyOn(JSON, 'stringify')
    serializeLog([call], { carried: 0, cache })
    const first = spy.mock.calls.length
    serializeLog([call], { carried: 0, cache })
    expect(spy.mock.calls.length).toBe(first)
  })
})

describe('setting', () => {
  it('starts off and writes nothing', () => {
    const { store, start } = newDocument()
    const preserve = start()
    store.upsert(makeCall('a'))
    vi.runAllTimers()
    dispatchEvent(new Event('pagehide'))
    expect(preserve.state.enabled).toBe(false)
    expect(sessionStorage.length).toBe(0)
  })

  it('saves the current records when turned on and restores them after a reload', () => {
    let doc = newDocument()
    doc.start()
    for (const id of ['a', 'b', 'c'])
      doc.store.upsert(makeCall(id))
    current!.setEnabled(true)

    doc = newDocument()
    const preserve = doc.start()
    expect(preserve.state.enabled).toBe(true)
    expect(ids(doc.store.list)).toEqual(['c', 'b', 'a'])
    expect(doc.store.list.every(call => call.fromPreviousPage)).toBe(true)
  })

  it('deletes the saved copy when turned off; records in memory stay', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    for (const id of ['1', '2', '3', '4', '5'])
      doc.store.upsert(makeCall(id))
    vi.runAllTimers()
    current!.setEnabled(false)
    expect(sessionStorage.length).toBe(0)
    expect(doc.store.list).toHaveLength(5)

    doc = newDocument()
    doc.start()
    expect(doc.store.list).toEqual([])
  })
})

describe('saving', () => {
  it('restores a call made right before a navigation', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    doc.store.upsert(makeCall('login'))
    dispatchEvent(new Event('pagehide'))

    doc = newDocument()
    doc.start()
    expect(ids(doc.store.list)).toEqual(['login'])
  })

  it('writes at most three times while a stream delivers 500 events in two seconds', () => {
    const { store, start } = newDocument()
    start().setEnabled(true)
    const setItem = vi.spyOn(storage, 'setItem')
    for (let i = 0; i < 500; i++) {
      store.upsert(makeCall('s', { state: 'streaming', eventCount: i }))
      vi.advanceTimersByTime(4)
    }
    expect(setItem.mock.calls.filter(([key]) => key === PRESERVE_LOG_RECORDS_KEY).length).toBeLessThanOrEqual(3)
    vi.runAllTimers()
    expect(saved()!.list[0]!.eventCount).toBe(499)
  })

  it('never writes inside the store listener call', () => {
    const { store, start } = newDocument()
    start().setEnabled(true)
    const setItem = vi.spyOn(storage, 'setItem')
    store.upsert(makeCall('a'))
    expect(setItem).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(setItem).toHaveBeenCalled()
  })
})

describe('failed writes', () => {
  it('removes the earlier copy when the write is refused, and reports it', () => {
    let doc = newDocument()
    const preserve = doc.start()
    preserve.setEnabled(true)
    doc.store.upsert(makeCall('old'))
    vi.runAllTimers()
    expect(ids(saved()!.list)).toEqual(['old'])

    refuseWrites(value => value.includes('"new"'))
    doc.store.upsert(makeCall('new'))
    vi.runAllTimers()
    expect(preserve.state).toMatchObject({ failed: true, dropped: 2 })
    vi.restoreAllMocks()

    doc = newDocument()
    const next = doc.start()
    expect(doc.store.list).toEqual([])
    expect(next.state.dropped).toBe(2)
  })

  it('retries with summaries only before giving up', () => {
    const { store, start } = newDocument()
    const preserve = start()
    preserve.setEnabled(true)
    refuseWrites(value => value.includes('"output":'))
    store.upsert(makeCall('a', {
      output: { ok: true },
    }))
    vi.runAllTimers()
    expect(preserve.state).toMatchObject({ failed: false, summarized: 1 })
    expect(saved()!.list[0]!.notPreserved!.fields).toEqual(['output'])
  })

  it('keeps calls working when every storage access throws', () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(storage, method).mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError')
      })
    }
    const { store, start } = newDocument()
    const preserve = start()
    expect(preserve.state.available).toBe(false)
    preserve.setEnabled(true)
    expect(() => {
      store.upsert(makeCall('a'))
      vi.runAllTimers()
      dispatchEvent(new Event('pagehide'))
    }).not.toThrow()
    expect(ids(store.list)).toEqual(['a'])
  })

  it('reports a blocked sessionStorage as unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')!
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    try {
      const { store, start } = newDocument()
      const preserve = start()
      store.upsert(makeCall('a'))
      expect(preserve.state).toMatchObject({ available: false, enabled: false })
      expect(ids(store.list)).toEqual(['a'])
    }
    finally {
      Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    }
  })
})

describe('restore', () => {
  it('puts restored records after the page\'s SSR records and keeps only them marked', () => {
    savedWith([
      makeCall('b'),
      makeCall('a'),
    ])
    const { store, start } = newDocument()
    store.upsert(makeCall('s1', { side: 'ssr' }))
    store.upsert(makeCall('s2', { side: 'ssr' }))
    start()
    store.upsert(makeCall('c'))
    expect(ids(store.list)).toEqual(['c', 's2', 's1', 'b', 'a'])
    expect(store.list.filter(call => call.fromPreviousPage).map(call => call.id)).toEqual(['b', 'a'])
  })

  it('keeps the record already in the store for the same id', () => {
    savedWith([
      makeCall('same', { state: 'error' }),
    ])
    const { store, start } = newDocument()
    store.upsert(makeCall('same'))
    start()
    expect(store.list).toHaveLength(1)
    expect(store.list[0]).toMatchObject({ state: 'success' })
    expect(store.list[0]!.fromPreviousPage).toBeUndefined()
  })

  it('keeps the mark across two navigations', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    doc.store.upsert(makeCall('fromA'))
    dispatchEvent(new Event('pagehide'))
    doc = newDocument()
    doc.start()
    doc.store.upsert(makeCall('fromB'))
    dispatchEvent(new Event('pagehide'))
    doc = newDocument()
    doc.start()
    expect(ids(doc.store.list)).toEqual(['fromB', 'fromA'])
    expect(doc.store.list.every(call => call.fromPreviousPage)).toBe(true)
  })

  it('fills up to 300 with the newest saved records', () => {
    savedWith(Array.from({ length: 300 }, (_, i) => makeCall(`old${i}`)))
    const { store, start } = newDocument()
    for (let i = 0; i < 10; i++)
      store.upsert(makeCall(`new${i}`))
    start()
    expect(store.list).toHaveLength(300)
    expect(store.list[10]!.id).toBe('old0')
    expect(store.list.at(-1)!.id).toBe('old289')
  })

  it('discards an older format and replaces it with a valid copy', () => {
    sessionStorage.setItem(PRESERVE_LOG_ENABLED_KEY, '1')
    sessionStorage.setItem(PRESERVE_LOG_RECORDS_KEY, JSON.stringify({
      v: 0,
      list: [
        makeCall('a'),
      ],
    }))
    const { store, start } = newDocument()
    start()
    expect(store.list).toEqual([])
    expect(saved()).toMatchObject({ v: 1, list: [] })
  })

  it('discards a corrupted value without throwing', () => {
    sessionStorage.setItem(PRESERVE_LOG_ENABLED_KEY, '1')
    sessionStorage.setItem(PRESERVE_LOG_RECORDS_KEY, '{not json')
    const { store, start } = newDocument()
    expect(() => start()).not.toThrow()
    expect(store.list).toEqual([])
  })

  it('turns a pending call into unknown without duration', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    doc.store.upsert(makeCall('slow', {
      state: 'pending',
      duration: 5,
      input: { id: 1 },
    }))
    dispatchEvent(new Event('pagehide'))
    doc = newDocument()
    doc.start()
    expect(doc.store.list[0]).toMatchObject({
      state: 'unknown',
      input: { id: 1 },
      fromPreviousPage: true,
    })
    expect(doc.store.list[0]).not.toHaveProperty('duration')
  })

  it('keeps the events of a stream cut by a navigation', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    doc.store.upsert(makeCall('stream', {
      state: 'streaming',
      events: [1, 2, 3],
      eventCount: 3,
    }))
    dispatchEvent(new Event('pagehide'))
    doc = newDocument()
    doc.start()
    expect(doc.store.list[0]).toMatchObject({
      state: 'unknown',
      events: [1, 2, 3],
      eventCount: 3,
    })
  })

  it('carries the left-out count over to the next page', () => {
    savedWith([
      makeCall('a'),
    ], 4)
    const { start } = newDocument()
    expect(start().state.dropped).toBe(4)
    expect(saved()!.dropped).toBe(4)
  })
})

describe('clear', () => {
  it('restores nothing after clear then reload', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    for (const id of ['1', '2', '3', '4', '5'])
      doc.store.upsert(makeCall(id))
    vi.runAllTimers()
    doc.store.clear()
    current!.cleared()
    doc = newDocument()
    doc.start()
    expect(doc.store.list).toEqual([])
  })

  it('restores only calls made after the clear', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    doc.store.upsert(makeCall('before'))
    vi.runAllTimers()
    doc.store.clear()
    current!.cleared()
    doc.store.upsert(makeCall('after'))
    dispatchEvent(new Event('pagehide'))
    doc = newDocument()
    doc.start()
    expect(ids(doc.store.list)).toEqual(['after'])
  })

  it('resets the counts', () => {
    savedWith([
      makeCall('a'),
    ], 4)
    const { store, start } = newDocument()
    const preserve = start()
    store.clear()
    preserve.cleared()
    expect(preserve.state.dropped).toBe(0)
    expect(saved()!.dropped).toBe(0)
  })
})

describe('back/forward cache', () => {
  it('restores nothing on a return, so each record appears once', () => {
    const { store, start } = newDocument()
    start().setEnabled(true)
    store.upsert(makeCall('a'))
    dispatchEvent(new Event('pagehide'))
    pageshow(true)
    expect(ids(store.list)).toEqual(['a'])
  })

  it('clears the page when the log was cleared on a later page', () => {
    const { store, start } = newDocument()
    const pageA = start()
    pageA.setEnabled(true)
    store.upsert(makeCall('a'))
    dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(10)
    // Page B clears through storage
    sessionStorage.setItem(PRESERVE_LOG_RECORDS_KEY, serializeLog([], {
      carried: 0,
      clearedAt: Date.now(),
    }).json)
    pageshow(true)
    expect(store.list).toEqual([])
    vi.runAllTimers()
    expect(saved()!.list).toEqual([])
  })

  it('stops saving when turned off on a later page', () => {
    const { store, start } = newDocument()
    const pageA = start()
    pageA.setEnabled(true)
    dispatchEvent(new Event('pagehide'))
    sessionStorage.clear()
    pageshow(true)
    store.upsert(makeCall('a'))
    vi.runAllTimers()
    dispatchEvent(new Event('pagehide'))
    expect(pageA.state.enabled).toBe(false)
    expect(sessionStorage.length).toBe(0)
  })
})

describe('one saver per document', () => {
  it('returns the same instance and restores once when started again', () => {
    sessionStorage.setItem(PRESERVE_LOG_ENABLED_KEY, '1')
    sessionStorage.setItem(PRESERVE_LOG_RECORDS_KEY, serializeLog([
      makeCall('a'),
    ], { carried: 0 }).json)
    const { store, start } = newDocument()
    const first = start()
    expect(startPreserveLog(store)).toBe(first)
    expect(ids(store.list)).toEqual(['a'])
    const setItem = vi.spyOn(storage, 'setItem')
    store.upsert(makeCall('b'))
    vi.runAllTimers()
    expect(setItem.mock.calls.filter(([key]) => key === PRESERVE_LOG_RECORDS_KEY)).toHaveLength(1)
    expect(ids(saved()!.list)).toEqual(['b', 'a'])
  })
})

describe('calls cut short by leaving the page', () => {
  const failed = {
    state: 'error',
    error: { name: 'TypeError', message: 'Failed to fetch' },
    duration: 514,
  } as const

  it('saves a call that failed with no response right before pagehide as unfinished', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    doc.store.upsert(makeCall('slow', {
      state: 'pending',
      input: { id: 1 },
    }))
    vi.runAllTimers()
    vi.advanceTimersByTime(3000)
    doc.store.upsert(makeCall('slow', {
      ...failed,
      input: { id: 1 },
    }))
    vi.advanceTimersByTime(5)
    dispatchEvent(new Event('pagehide'))

    doc = newDocument()
    doc.start()
    expect(doc.store.list[0]).toMatchObject({
      id: 'slow',
      state: 'unknown',
      input: { id: 1 },
    })
    expect(doc.store.list[0]!.error).toBeUndefined()
  })

  it('keeps the error when the call failed well before the page was left', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    doc.store.upsert(makeCall('slow', { state: 'pending' }))
    doc.store.upsert(makeCall('slow', failed))
    vi.advanceTimersByTime(2000)
    dispatchEvent(new Event('pagehide'))

    doc = newDocument()
    doc.start()
    expect(doc.store.list[0]).toMatchObject({ state: 'error' })
  })

  it('keeps an error with a response', () => {
    let doc = newDocument()
    doc.start().setEnabled(true)
    doc.store.upsert(makeCall('login', { state: 'pending' }))
    doc.store.upsert(makeCall('login', {
      state: 'error',
      status: 401,
      error: { name: 'ORPCError', message: 'x', status: 401 },
    }))
    dispatchEvent(new Event('pagehide'))

    doc = newDocument()
    doc.start()
    expect(doc.store.list[0]).toMatchObject({ state: 'error', status: 401 })
  })

  it('leaves the record in memory as it is', () => {
    const { store, start } = newDocument()
    start().setEnabled(true)
    store.upsert(makeCall('slow', { state: 'pending' }))
    store.upsert(makeCall('slow', failed))
    dispatchEvent(new Event('pagehide'))
    expect(store.list[0]).toMatchObject({ state: 'error' })
  })
})
