import type { Schema } from '@orpc/contract'
import type { RouterClient } from '@orpc/server'
import type { OrpcCall } from '../../src/core/types'
import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { ValidationError } from '@orpc/contract'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCallRecorder } from '../../src/core/recorder'
import { getOrpcInspectorStore } from '../../src/core/store'
import { OrpcInspectorPlugin } from '../../src/index'

const issues = [
  {
    path: ['items', 0, 'name'],
    message: 'Required',
  },
]

async function recordFailure(error: unknown) {
  let last: OrpcCall | undefined
  const { record } = createCallRecorder({
    commit: (call) => {
      last = call
    },
  })
  await record({
    path: ['profile', 'get'],
    input: { id: 1 },
    context: {},
    next: () => Promise.reject(error),
  }).catch(() => {})
  return last!
}

describe('call-recording: error classification', () => {
  it('response not matching output schema: invalid/output with issues and raw data', async () => {
    const call = await recordFailure(new ValidationError({
      message: 'output',
      issues,
      data: {
        items: [{}],
      },
    }))
    expect(call).toMatchObject({
      state: 'invalid',
      issuesOf: 'output',
      output: {
        items: [{}],
      },
      issues: [
        {
          path: ['items', 0, 'name'],
          message: 'Required',
        },
      ],
    })
  })

  it('input not matching schema: invalid/input with issues and no output', async () => {
    const call = await recordFailure(new ORPCError('BAD_REQUEST', {
      message: 'Input validation failed',
      cause: new ValidationError({ message: 'input', issues, data: {} }),
    }))
    expect(call).toMatchObject({
      state: 'invalid',
      issuesOf: 'input',
      issues: [
        {
          path: ['items', 0, 'name'],
          message: 'Required',
        },
      ],
    })
    expect(call.output).toBeUndefined()
  })

  it('backend 404: error with code, status and data', async () => {
    const call = await recordFailure(new ORPCError('NOT_FOUND', {
      status: 404,
      data: { id: 1 },
    }))
    expect(call).toMatchObject({
      state: 'error',
      error: {
        name: 'ORPCError',
        code: 'NOT_FOUND',
        status: 404,
        data: { id: 1 },
      },
    })
  })
})

describe('call-recording: server input validation over HTTP', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
    getOrpcInspectorStore().clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Hand-written Standard Schema returning zod-shaped issues, so tests need not install zod
  const profileInput: Schema<{ name: string, count: bigint }, { name: string, count: bigint }> = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => {
        const { name, count } = value as { name: string, count: bigint }
        const issues = [
          ...(name.length < 2
            ? [
                {
                  origin: 'string',
                  code: 'too_small',
                  minimum: 2,
                  inclusive: true,
                  path: ['name'],
                  message: 'Too small: expected string to have >=2 characters',
                },
              ]
            : []),
          ...(count < 10n
            ? [
                {
                  origin: 'bigint',
                  code: 'too_small',
                  minimum: 10n,
                  inclusive: true,
                  path: [
                    { key: 'count' },
                  ],
                  message: 'Too small: expected bigint to be >=10',
                },
              ]
            : []),
        ]
        return issues.length
          ? { issues }
          : { value: value as { name: string, count: bigint } }
      },
    },
  }

  it('records the server 400 as server input issues with their parameters', async () => {
    const router = {
      profile: {
        update: os.input(profileInput).handler(({ input }) => input),
      },
    }
    const handler = new RPCHandler(router)
    const link = new RPCLink({
      url: 'http://local/rpc',
      fetch: async request => (await handler.handle(request, { prefix: '/rpc' })).response ?? new Response(null, { status: 404 }),
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    const client: RouterClient<typeof router> = createORPCClient(link)
    await expect(client.profile.update({ name: 'A', count: 1n })).rejects.toThrow('Input validation failed')

    const [call] = getOrpcInspectorStore().list
    expect(call).toMatchObject({
      procedure: 'profile.update',
      state: 'invalid',
      issuesOf: 'input',
      issuesSource: 'server',
      status: 400,
      input: { name: 'A', count: '1n' },
      error: { name: 'ORPCError', code: 'BAD_REQUEST', status: 400 },
    })
    expect(call!.issues).toEqual([
      {
        path: ['name'],
        message: 'Too small: expected string to have >=2 characters',
        code: 'too_small',
        origin: 'string',
        minimum: 2,
        inclusive: true,
      },
      {
        path: ['count'],
        message: 'Too small: expected bigint to be >=10',
        code: 'too_small',
        origin: 'bigint',
        minimum: '10n',
        inclusive: true,
      },
    ])
  })
})

/** A value that neither JSON.stringify nor String() can handle */
function unserializable() {
  const value = Object.create(null) as Record<string, unknown>
  value.self = value
  return value
}

describe('call-recording: values that cannot be serialized', () => {
  function recordWith(input: unknown, output: unknown) {
    let last: OrpcCall | undefined
    const { record } = createCallRecorder({
      commit: (call) => {
        last = call
      },
    })
    const result = record({
      path: ['profile', 'get'],
      input,
      context: {},
      next: () => Promise.resolve(output),
    })
    return {
      result,
      last: () => last!,
    }
  }

  it('still runs the call when the input cannot be serialized', async () => {
    const { result, last } = recordWith(unserializable(), { ok: true })
    await expect(result).resolves.toEqual({ ok: true })
    expect(last()).toMatchObject({ state: 'success', input: '[unserializable value]' })
  })

  it('keeps a successful call successful when the output cannot be serialized', async () => {
    const output = unserializable()
    const { result, last } = recordWith({ id: 1 }, output)
    await expect(result).resolves.toBe(output)
    expect(last()).toMatchObject({ state: 'success', output: '[unserializable value]' })
  })
})
