import type { ClientContext } from '@orpc/client'
import type { StandardLinkPlugin } from '@orpc/client/standard'
import type { ContractRouterClient, Schema } from '@orpc/contract'
import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { eventIterator, oc } from '@orpc/contract'
import { RequestValidationPlugin, ResponseValidationPlugin } from '@orpc/contract/plugins'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { implement } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { BatchHandlerPlugin } from '@orpc/server/plugins'

type Primitive = 'number' | 'string' | 'boolean'
type FromPrimitive<T extends Primitive> = T extends 'number' ? number : T extends 'string' ? string : boolean

const is: Record<Primitive, (value: unknown) => boolean> = {
  number: value => typeof value === 'number',
  string: value => typeof value === 'string',
  boolean: value => typeof value === 'boolean',
}

/** Hand-written Standard Schema so tests need not install zod */
function primitive<T extends Primitive>(type: T): NonNullable<Schema<FromPrimitive<T>, FromPrimitive<T>>> {
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

function shape<T extends Record<string, Primitive>>(fields: T): NonNullable<Schema<{ [K in keyof T]: FromPrimitive<T[K]> }, { [K in keyof T]: FromPrimitive<T[K]> }>> {
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
          : { value: value as { [K in keyof T]: FromPrimitive<T[K]> } }
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
  slow: oc.route({ method: 'POST', path: '/slow' }).input(shape({ ms: 'number', tag: 'string' })),
  stream: oc.route({ method: 'POST', path: '/stream' }).input(shape({ count: 'number' })).output(eventIterator(primitive('number'))),
}

export type TestClient = ContractRouterClient<typeof contract>

/** One server per test so flaky counters don't interfere */
export function createServer() {
  // Server-side bad declares no output schema so the client's ResponseValidationPlugin is exercised
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
      throw new ORPCError('NOT_FOUND', { message: 'nope' })
    }),
    flaky: os.flaky.handler(() => {
      flakyCount += 1
      if (flakyCount < 3)
        throw new ORPCError('INTERNAL_SERVER_ERROR')
      return 'ok'
    }),
    slow: os.slow.handler(async ({ input }) => {
      await new Promise(resolve => setTimeout(resolve, input.ms))
      return input.tag
    }),
    stream: os.stream.handler(async function* ({ input }) {
      for (let i = 1; i <= input.count; i++)
        yield i
    }),
  })

  const rpcHandler = new RPCHandler(router, {
    plugins: [
      new BatchHandlerPlugin(),
    ],
  })
  const openapiHandler = new OpenAPIHandler(router)
  const notFound = () => new Response(null, { status: 404 })

  return {
    rpcFetch: async (request: Request) => (await rpcHandler.handle(request, { prefix: '/rpc' })).response ?? notFound(),
    openapiFetch: async (request: Request) => (await openapiHandler.handle(request, { prefix: '/api' })).response ?? notFound(),
  }
}

export type LinkKind = 'rpc' | 'openapi'

export interface ClientSetup {
  plugins?: StandardLinkPlugin<ClientContext>[]
  interceptors?: RPCLinkOptions['interceptors']
  clientInterceptors?: RPCLinkOptions['clientInterceptors']
  headers?: Record<string, string>
}

type RPCLinkOptions = NonNullable<ConstructorParameters<typeof RPCLink<ClientContext>>[0]>

export function validationPlugins() {
  return [
    new RequestValidationPlugin(contract),
    new ResponseValidationPlugin(contract),
  ]
}

export function createClient(kind: LinkKind, server: ReturnType<typeof createServer>, setup: ClientSetup = {}): TestClient {
  const options = {
    plugins: setup.plugins,
    interceptors: setup.interceptors,
    clientInterceptors: setup.clientInterceptors,
    headers: setup.headers,
  }
  const link = kind === 'rpc'
    ? new RPCLink({ url: 'http://local/rpc', fetch: server.rpcFetch, ...options })
    : new OpenAPILink(contract, { url: 'http://local/api', fetch: server.openapiFetch, ...options })
  return createORPCClient(link)
}
