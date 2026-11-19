import { createORPCClient } from '@orpc/client-v2'
import { RPCLink } from '@orpc/client-v2/fetch'
import { OrpcInspectorCollector, OrpcInspectorPlugin, renderOrpcInspectorScript, setCollectorResolver } from 'orpc-inspector/v2'

let current: OrpcInspectorCollector | undefined
setCollectorResolver(() => current)

const link = new RPCLink({
  origin: 'http://local',
  url: '/rpc',
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

/** oRPC v2 variant of entry-server.ts: renders the head of one request, with that request's SSR records */
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
