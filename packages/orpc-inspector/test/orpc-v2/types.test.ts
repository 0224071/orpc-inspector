import type { StandardLinkInterceptor, StandardLinkPlugin, StandardLinkTransportInterceptor } from '@orpc/client-v2/standard'
import { RPCLink } from '@orpc/client-v2/fetch'
import { describe, expect, it } from 'vitest'
import * as dev from '../../src/v2'
import * as prod from '../../src/v2.prod'

// The v2 entry declares its own shapes instead of importing oRPC's; vue-tsc checks them against the real v2 types here
interface AppContext {
  token?: string
}

describe('v2 entry types', () => {
  it.each([
    ['dev', dev],
    ['prod', prod],
  ] as const)('%s: plugin and interceptors fit v2 link options', (_, entry) => {
    const plugin: StandardLinkPlugin<AppContext> = new entry.OrpcInspectorPlugin()
    const { interceptor, transportInterceptor } = entry.createOrpcInspectorInterceptors()
    const call: StandardLinkInterceptor<AppContext> = interceptor
    const transport: StandardLinkTransportInterceptor<AppContext> = transportInterceptor

    const link = new RPCLink<AppContext>({
      url: '/rpc',
      plugins: [plugin],
      interceptors: [call],
      transportInterceptors: [transport],
    })
    expect(link).toBeInstanceOf(RPCLink)
  })
})
