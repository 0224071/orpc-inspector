import type { OrpcCall } from '../../src/core/types'
import { describe, expect, it, vi } from 'vitest'
import { createCallRecorder } from '../../src/core/recorder'

function setup() {
  const commits: { call: OrpcCall, done: boolean }[] = []
  const { record } = createCallRecorder({
    commit: (call, done) => commits.push({ call, done }),
  })
  return {
    commits,
    record,
    last: () => commits.at(-1)!,
  }
}

/** Upstream iterator with observable return()/throw() */
function createSource(values: number[], fail?: Error) {
  let index = 0
  const source = {
    next: vi.fn(async (): Promise<IteratorResult<number>> => {
      if (index < values.length)
        return { done: false, value: values[index++]! }
      if (fail)
        throw fail
      return { done: true, value: undefined }
    }),
    return: vi.fn(async (value?: unknown) => ({ done: true as const, value })),
    throw: vi.fn(async (error?: unknown): Promise<IteratorResult<number>> => {
      throw error
    }),
    [Symbol.asyncIterator]() {
      return source
    },
  }
  return source
}

const base = {
  path: ['feed'],
  input: undefined,
  context: {},
}

describe('event iterator wrapping', () => {
  it('records streaming (not done) on return, then updates per event', async () => {
    const { record, commits, last } = setup()
    const iterator = await record({
      ...base,
      next: async () => createSource([1, 2]),
    })

    expect(last()).toMatchObject({
      done: false,
      call: { state: 'streaming', events: [], eventCount: 0 },
    })
    await iterator.next()
    expect(last()).toMatchObject({
      done: false,
      call: {
        state: 'streaming',
        events: [1],
        eventCount: 1,
      },
    })
    await iterator.next()
    await iterator.next()
    expect(last()).toMatchObject({
      done: true,
      call: {
        state: 'success',
        events: [1, 2],
        eventCount: 2,
      },
    })
    expect(last().call.duration).toBeGreaterThanOrEqual(0)
    // Snapshots do not share arrays with later updates
    expect(commits[2]!.call.events).toEqual([1])
  })

  it('early return(): cancelled and forwarded upstream', async () => {
    const { record, last } = setup()
    const source = createSource([1, 2, 3])
    const iterator = await record({
      ...base,
      next: async () => source,
    })
    await iterator.next()
    await expect(iterator.return!('bye')).resolves.toEqual({ done: true, value: 'bye' })

    expect(source.return).toHaveBeenCalledWith('bye')
    expect(last()).toMatchObject({
      done: true,
      call: {
        state: 'cancelled',
        events: [1],
      },
    })
  })

  it('forwards throw() upstream and rethrows the error as-is', async () => {
    const { record, last } = setup()
    const source = createSource([1])
    const iterator = await record({
      ...base,
      next: async () => source,
    })
    const error = new Error('stop')

    await expect(iterator.throw!(error)).rejects.toBe(error)
    expect(source.throw).toHaveBeenCalledWith(error)
    expect(last()).toMatchObject({
      done: true,
      call: {
        state: 'error',
        error: { message: 'stop' },
      },
    })
  })

  it('upstream failure: error, rethrown as-is', async () => {
    const { record, last } = setup()
    const error = new Error('broken')
    const iterator = await record({
      ...base,
      next: async () => createSource([1], error),
    })
    await iterator.next()

    await expect(iterator.next()).rejects.toBe(error)
    expect(last()).toMatchObject({
      done: true,
      call: {
        state: 'error',
        events: [1],
      },
    })
  })

  it('return() after completion does not change state', async () => {
    const { record, commits, last } = setup()
    const iterator = await record({
      ...base,
      next: async () => createSource([]),
    })
    await iterator.next()
    const count = commits.length
    await iterator.return!()

    expect(commits).toHaveLength(count)
    expect(last().call.state).toBe('success')
  })

  it('does not treat readableStream as an event iterator', async () => {
    const { record, last } = setup()
    const stream = new ReadableStream()
    await expect(record({
      ...base,
      next: async () => stream,
    })).resolves.toBe(stream)
    expect(last().call.state).toBe('success')
  })
})

describe('attempts', () => {
  it('records one attempt per transport; top level uses the last, and a failed attempt keeps no stale status', async () => {
    const { commits, last } = setup()
    const { record, recordTransport } = createCallRecorder({
      commit: (call, done) => commits.push({ call, done }),
    })
    const request = (n: number) => ({
      method: 'POST',
      url: new URL(`http://local/rpc/ping?try=${n}`),
      headers: {},
    })

    await record({
      ...base,
      next: async (options) => {
        const context = options!.context
        await recordTransport({
          context,
          request: request(1),
          next: async () => ({ status: 500, headers: {} }),
        })
        await recordTransport({
          context,
          request: request(2),
          next: () => Promise.reject(new TypeError('Failed to fetch')),
        }).catch(() => {})
        return 'ok'
      },
    })

    const { call } = last()
    expect(call.attempts).toEqual([
      {
        method: 'POST',
        url: 'http://local/rpc/ping?try=1',
        requestHeaders: {},
        status: 500,
        responseHeaders: {},
      },
      { method: 'POST', url: 'http://local/rpc/ping?try=2', requestHeaders: {} },
    ])
    expect(call.url).toBe('http://local/rpc/ping?try=2')
    expect(call.status).toBeUndefined()
    // Attempts in the pending snapshot are not mutated by later attempts
    expect(commits[0]!.call.attempts).toEqual([])
  })
})
