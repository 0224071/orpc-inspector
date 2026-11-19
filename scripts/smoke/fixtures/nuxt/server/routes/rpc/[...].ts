import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/node'

const handler = new RPCHandler({
  ping: os.handler(async ({ input }) => ({ pong: true, input })),
})

export default defineEventHandler(async (event) => {
  const { matched } = await handler.handle(event.node.req, event.node.res, { prefix: '/rpc', context: {} })
  if (!matched)
    throw createError({ statusCode: 404 })
})
