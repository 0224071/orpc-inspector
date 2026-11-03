import type { OrpcCall } from '../../src/core/types'
import { ORPCError } from '@orpc/client'
import { afterEach, describe, expect, it } from 'vitest'
import { RECORD_MASK_KEY } from '../../src/core/record-mask'
import { createCallRecorder } from '../../src/core/recorder'

const g = globalThis as Record<symbol, unknown>

/** Client-side sink, as in the browser store */
function record(error?: unknown) {
  const commits: OrpcCall[] = []
  const { record, recordTransport } = createCallRecorder({
    side: 'client',
    commit: call => commits.push(call),
  })
  const done = record({
    path: ['profile', 'get'],
    input: {},
    context: {},
    next: options => recordTransport({
      context: options!.context,
      request: {
        method: 'POST',
        url: new URL('https://api.test/rpc'),
        headers: { authorization: 'Bearer abc', accept: 'application/json' },
      },
      next: async () => {
        if (error)
          throw error
        return {
          status: 200,
          headers: { 'set-cookie': 'sid=1' },
        }
      },
    }),
  }).catch(() => {})
  return done.then(() => commits.at(-1)!)
}

function dataError() {
  return new ORPCError('BAD_GATEWAY', {
    data: {
      headers: { cookie: 'sid=1', server: 'x' },
    },
  })
}

describe('record-time mask flag', () => {
  afterEach(() => {
    delete g[RECORD_MASK_KEY]
  })

  it('keeps client header values when the flag is not set', async () => {
    const call = await record()
    expect(call.requestHeaders).toMatchObject({ authorization: 'Bearer abc' })
    expect(call.responseHeaders).toMatchObject({ 'set-cookie': 'sid=1' })
    const failed = await record(dataError())
    expect(failed.error?.data).toMatchObject({
      headers: { cookie: 'sid=1' },
    })
  })

  it('masks client headers and headers in error data when the flag is set', async () => {
    g[RECORD_MASK_KEY] = true
    const call = await record()
    expect(call.side).toBe('client')
    expect(call.requestHeaders).toEqual({ authorization: '***', accept: 'application/json' })
    expect(call.responseHeaders).toEqual({ 'set-cookie': '***' })
    const failed = await record(dataError())
    expect(failed.error?.data).toEqual({
      headers: { cookie: '***', server: 'x' },
    })
  })
})
