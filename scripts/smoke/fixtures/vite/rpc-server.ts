import type { Plugin } from 'vite'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/node'

const handler = new RPCHandler({
  ping: os.handler(async ({ input }) => ({ pong: true, input })),
})

/** Serves the oRPC router at /rpc on the dev server */
export function rpcServer(): Plugin {
  return {
    name: 'smoke-rpc-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const { matched } = await handler.handle(req, res, { prefix: '/rpc', context: {} })
        if (!matched)
          next()
      })
    },
  }
}
