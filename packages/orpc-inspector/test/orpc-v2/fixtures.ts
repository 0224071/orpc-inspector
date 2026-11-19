import type { ClientContext } from '@orpc/client-v2'
import type { StandardLinkOptions } from '@orpc/client-v2/standard'
import type { ContractRouterClient, Schema } from '@orpc/contract-v2'
import { createORPCClient, ORPCError } from '@orpc/client-v2'
import { RPCLink } from '@orpc/client-v2/fetch'
import { eventIterator, oc } from '@orpc/contract-v2'
import { RequestValidationLinkPlugin, ResponseValidationLinkPlugin } from '@orpc/contract-v2/plugins'
import { OpenAPIHandler, OpenAPILink } from '@orpc/openapi-v2/fetch'
import { implement } from '@orpc/server-v2'
import { RPCHandler } from '@orpc/server-v2/fetch'
import '@orpc/openapi-v2/extensions/route'

type Primitive = 'number' | 'string' | 'boolean'
type FromPrimitive<T extends Primitive> = T extends 'number' ? number : T extends 'string' ? string : boolean

const is: Record<Primitive, (value: unknown) => boolean> = {
  number: value => typeof value === 'number',
  string: value => typeof value === 'string',
  boolean: value => typeof value === 'boolean',
}

/** Hand-written Standard Schema so tests need not install zod */
function primitive<T extends Primitive>(type: T): Schema<FromPrimitive<T>, FromPrimitive<T>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: value => is[type](value)
        ? { value: value as FromPrimitive<T> }
        : {
            issues: [
              { message: `Expected ${type}` },
            ],
          },
    },
  }
}

type Shape<T extends Record<string, Primitive>> = { [K in keyof T]: FromPrimitive<T[K]> }

function shape<T extends Record<string, Primitive>>(fields: T): Schema<Shape<T>, Shape<T>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => {
        const record = (value ?? {}) as Record<string, unknown>
        const issues = Object.entries(fields)
          .filter(([key, type]) => !is[type](record[key]))
          .map(([key, type]) => ({
            path: [key],
            message: `Expected ${type}`,
          }))
        return issues.length
          ? { issues }
          : { value: value as Shape<T> }
      },
    },
  }
}

export const contract = {
  ping: oc.route({ method: 'POST', path: '/ping' }).input(shape({ n: 'number' })).output(shape({ n: 'number' })),
  find: oc.route({ method: 'GET', path: '/find' }).input(shape({ q: 'string' })).output(shape({ q: 'string' })),
  bad: oc.route({ method: 'GET', path: '/bad' }).output(shape({ ok: 'boolean' })),
  fail: oc.route({ method: 'GET', path: '/fail' }),
  flaky: oc.route({ method: 'GET', path: '/flaky' }),
  stream: oc.route({ method: 'POST', path: '/stream' }).input(shape({ count: 'number' })).output(eventIterator(primitive('number'))),
  slow: oc.route({ method: 'POST', path: '/slow' }).input(shape({ ms: 'number', tag: 'string' })),
  streamFail: oc.route({ method: 'POST', path: '/stream-fail' }).input(shape({ count: 'number' })).output(eventIterator(primitive('number'))),
  drip: oc.route({ method: 'POST', path: '/drip' }).input(shape({ count: 'number', ms: 'number' })).output(eventIterator(primitive('number'))),
}

export type TestClient = ContractRouterClient<typeof contract>

/** One server per test so flaky counters don't interfere */
export function createServer() {
  // Server-side bad declares no output schema so the client's response validation plugin is exercised
  const os = implement({
    ...contract,
    bad: oc.route({ method: 'GET', path: '/bad' }),
  })
  let flakyCount = 0
  const router = os.router({
    ping: os.ping.handler(({ input }) => input),
    find: os.find.handler(({ input }) => input),
    bad: os.bad.handler(() => ({ ok: 'not-boolean' })),
    fail: os.fail.handler(() => {
      throw new ORPCError('FORBIDDEN', { message: 'nope' })
    }),
    flaky: os.flaky.handler(() => {
      flakyCount += 1
      if (flakyCount < 3)
        throw new ORPCError('INTERNAL_SERVER_ERROR')
      return 'ok'
    }),
    stream: os.stream.handler(async function* ({ input }) {
      for (let i = 1; i <= input.count; i++)
        yield i
    }),
    slow: os.slow.handler(async ({ input }) => {
      await new Promise(resolve => setTimeout(resolve, input.ms))
      return input.tag
    }),
    streamFail: os.streamFail.handler(async function* ({ input }) {
      for (let i = 0; i < input.count; i++)
        yield i
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'stream broke' })
    }),
    drip: os.drip.handler(async function* ({ input }) {
      for (let i = 1; i <= input.count; i++) {
        await new Promise(resolve => setTimeout(resolve, input.ms))
        yield i
      }
    }),
  })

  const rpcHandler = new RPCHandler(router)
  const openapiHandler = new OpenAPIHandler(router)
  const notFound = () => new Response(null, { status: 404 })

  return {
    rpcFetch: async (request: Request) => (await rpcHandler.handle(request, { prefix: '/rpc', context: {} })).response ?? notFound(),
    openapiFetch: async (request: Request) => (await openapiHandler.handle(request, { prefix: '/api', context: {} })).response ?? notFound(),
  }
}

export type LinkKind = 'rpc' | 'openapi'

export type ClientSetup = StandardLinkOptions<ClientContext> & {
  headers?: Record<string, string>
  method?: 'GET' | 'POST'
}

export function validationPlugins() {
  return [
    new RequestValidationLinkPlugin(contract),
    new ResponseValidationLinkPlugin(contract),
  ]
}

function toFetch(handle: (request: Request) => Promise<Response>) {
  return (url: string, init: RequestInit) => handle(new Request(url, init))
}

export function createClient(kind: LinkKind, server: ReturnType<typeof createServer>, setup: ClientSetup = {}): TestClient {
  const link = kind === 'rpc'
    ? new RPCLink({
        origin: 'http://local',
        url: '/rpc',
        fetch: toFetch(server.rpcFetch),
        ...setup,
      })
    : new OpenAPILink(contract, {
        origin: 'http://local',
        url: '/api',
        fetch: toFetch(server.openapiFetch),
        ...setup,
      })
  return createORPCClient(link)
}
