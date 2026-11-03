import type { ContractRouterClient } from '@orpc/contract'
import { createORPCClient } from '@orpc/client'
import { RequestValidationPlugin, ResponseValidationPlugin } from '@orpc/contract/plugins'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createOrpcInspectorInterceptors, OrpcInspectorPlugin } from 'orpc-inspector'
import { ordersContract, profileContract } from './contract'

/** No location on the server; MSW handlers ignore the origin */
const origin = typeof window === 'undefined'
  ? 'http://localhost'
  : window.location.origin

/** Sensitive header, to verify SSR records are redacted before being written into HTML */
const headers = { authorization: 'Bearer playground-secret-token' }

/** Typical usage: OrpcInspectorPlugin */
export const client: ContractRouterClient<typeof profileContract> = createORPCClient(
  new OpenAPILink(profileContract, {
    url: origin,
    headers,
    plugins: [
      new OrpcInspectorPlugin(),
      new RequestValidationPlugin(profileContract),
      new ResponseValidationPlugin(profileContract),
    ],
  }),
)

const inspector = createOrpcInspectorInterceptors()

/** Without the plugin: put the interceptors first */
export const ordersClient: ContractRouterClient<typeof ordersContract> = createORPCClient(
  new OpenAPILink(ordersContract, {
    url: origin,
    interceptors: [inspector.interceptor],
    clientInterceptors: [inspector.clientInterceptor],
    plugins: [
      new RequestValidationPlugin(ordersContract),
      new ResponseValidationPlugin(ordersContract),
    ],
  }),
)
