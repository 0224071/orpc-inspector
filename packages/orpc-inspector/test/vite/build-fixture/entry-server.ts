import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { OrpcInspectorCollector, OrpcInspectorPlugin, renderOrpcInspectorScript, setCollectorResolver } from 'orpc-inspector'

let current: OrpcInspectorCollector | undefined
setCollectorResolver(() => current)

const link = new RPCLink({
  url: 'http://local/rpc',
  headers: { authorization: 'Bearer secret' },
  fetch: async () => new Response(JSON.stringify({
    json: { ok: true },
  }), {
    headers: { 'content-type': 'application/json' },
  }),
  plugins: [
    new OrpcInspectorPlugin(),
  ],
})
const client = createORPCClient<{ ping: (input: { n: number }) => Promise<{ ok: boolean }> }>(link)

/** Renders the head of one request, with that request's SSR records */
export async function render(): Promise<string> {
  current = new OrpcInspectorCollector()
  try {
    await client.ping({ n: 1 })
    return renderOrpcInspectorScript(current)
  }
  finally {
    current = undefined
  }
}
