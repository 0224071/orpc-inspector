import type { OrpcCall } from '../../src/core/types'
import { describe, expect, it } from 'vitest'
import { CALL, createCallRecorder, getSide } from '../../src/core/recorder'

function createSink() {
  const commits: { call: OrpcCall, done: boolean }[] = []
  return {
    commits,
    commit: (call: OrpcCall, done: boolean) => commits.push({ call, done }),
  }
}

const base = {
  path: ['profile', 'get'],
  input: { id: 1 },
  context: {},
}

describe('createCallRecorder', () => {
  it('successful call: procedure, success, output, non-negative duration', async () => {
    const sink = createSink()
    const { record } = createCallRecorder(sink)
    const result = await record({
      ...base,
      next: async () => ({ name: 'Ann' }),
    })

    expect(result).toEqual({ name: 'Ann' })
    const final = sink.commits.at(-1)!
    expect(final.done).toBe(true)
    expect(final.call).toMatchObject({
      procedure: 'profile.get',
      state: 'success',
      output: { name: 'Ann' },
      input: { id: 1 },
    })
    expect(final.call.duration).toBeGreaterThanOrEqual(0)
  })

  it('records pending first, then updates the same id to its final state', async () => {
    const sink = createSink()
    const { record } = createCallRecorder(sink)
    let resolve!: (value: string) => void
    const pending = record({
      ...base,
      next: () => new Promise<string>((r) => {
        resolve = r
      }),
    })

    expect(sink.commits).toHaveLength(1)
    expect(sink.commits[0]).toMatchObject({
      done: false,
      call: { state: 'pending' },
    })

    resolve('ok')
    await pending
    expect(sink.commits).toHaveLength(2)
    expect(sink.commits[1]!.call.id).toBe(sink.commits[0]!.call.id)
    expect(sink.commits[1]!.call.state).toBe('success')
    // Snapshot: the pending record is not mutated by later updates
    expect(sink.commits[0]!.call.state).toBe('pending')
  })

  it('rethrows errors as-is', async () => {
    const sink = createSink()
    const { record } = createCallRecorder(sink)
    const error = new TypeError('Failed to fetch')

    await expect(record({
      ...base,
      next: () => Promise.reject(error),
    })).rejects.toBe(error)
    expect(sink.commits.at(-1)!.call).toMatchObject({
      state: 'error',
      error: { name: 'TypeError', message: 'Failed to fetch' },
    })
  })

  it('records are serializable: bigint and File', async () => {
    const sink = createSink()
    const { record } = createCallRecorder(sink)
    await record({
      ...base,
      input: {
        id: 1n,
        file: new File(['abc'], 'a.txt'),
      },
      next: async () => null,
    })

    const call = sink.commits.at(-1)!.call
    expect(call.input).toEqual({ id: '1n', file: '[File 3 bytes]' })
    expect(() => structuredClone(call)).not.toThrow()
    expect(JSON.parse(JSON.stringify(call))).toEqual(call)
  })

  it('writes transport info into the same record via the context symbol', async () => {
    const sink = createSink()
    const { record, recordTransport } = createCallRecorder(sink)
    await record({
      ...base,
      next: options => recordTransport({
        context: options!.context,
        request: {
          method: 'GET',
          url: new URL('https://api.test/profile?id=1'),
          headers: { 'x-id': '1', 'x-none': undefined },
        },
        next: async () => ({
          status: 200,
          headers: { etag: 'W/"1"' },
        }),
      }),
    })

    expect(sink.commits.at(-1)!.call).toMatchObject({
      method: 'GET',
      url: 'https://api.test/profile?id=1',
      status: 200,
      requestHeaders: { 'x-id': '1' },
      responseHeaders: { etag: 'W/"1"' },
    })
    expect(sink.commits.at(-1)!.call.requestHeaders).not.toHaveProperty('x-none')
  })

  it('passes a shallow-copied context down without mutating the user object', async () => {
    const context = { user: 'ann' }
    const { record } = createCallRecorder(createSink())
    let received: object | undefined
    await record({
      ...base,
      context,
      next: async (options) => {
        received = options!.context
      },
    })

    expect(received).not.toBe(context)
    expect(received).toMatchObject({ user: 'ann' })
    expect(CALL in received!).toBe(true)
    expect(CALL in context).toBe(false)
  })

  it('skips recording and calls next as-is when there is no sink', async () => {
    const { record } = createCallRecorder(() => undefined)
    let args: unknown[] = []
    await expect(record({
      ...base,
      next: async (...rest) => {
        args = rest
        return 'ok'
      },
    })).resolves.toBe('ok')
    expect(args).toEqual([])
  })

  it('uses side ssr in node and masks sensitive headers', async () => {
    expect(getSide()).toBe('ssr')
    const sink = createSink()
    const { record, recordTransport } = createCallRecorder(sink)
    await record({
      ...base,
      next: options => recordTransport({
        context: options!.context,
        request: {
          method: 'POST',
          url: new URL('https://api.test/rpc'),
          headers: { authorization: 'Bearer abc' },
        },
        next: async () => ({ status: 200, headers: {} }),
      }),
    })
    expect(sink.commits.at(-1)!.call).toMatchObject({
      side: 'ssr',
      requestHeaders: { authorization: '***' },
    })
  })
})
