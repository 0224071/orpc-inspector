import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

export default defineNuxtPlugin(() => {
  const link = new RPCLink({
    url: `${useRequestURL().origin}/rpc`,
    plugins: [
      useOrpcInspectorPlugin(),
    ],
  })
  return {
    provide: {
      client: createORPCClient<{ ping: (input: { name: string }) => Promise<{ pong: boolean }> }>(link),
    },
  }
})
