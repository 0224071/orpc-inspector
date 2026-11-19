import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { OrpcInspectorPlugin } from 'orpc-inspector'

const link = new RPCLink({
  url: `${location.origin}/rpc`,
  plugins: [
    new OrpcInspectorPlugin(),
  ],
})

const client = createORPCClient<{ ping: (input: { name: string }) => Promise<{ pong: boolean }> }>(link)

client.ping({ name: 'smoke' }).then((result) => {
  document.querySelector('#out')!.textContent = JSON.stringify(result)
})
