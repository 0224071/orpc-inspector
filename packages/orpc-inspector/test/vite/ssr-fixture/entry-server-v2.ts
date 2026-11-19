// oRPC v2 variant of entry-server.ts
import { AsyncLocalStorage } from 'node:async_hooks'
import { createORPCClient } from '@orpc/client-v2'
import { RPCLink } from '@orpc/client-v2/fetch'
import { OrpcInspectorCollector, OrpcInspectorPlugin, renderOrpcInspectorScript, setCollectorResolver } from 'orpc-inspector/v2'

const requestCollector = new AsyncLocalStorage<OrpcInspectorCollector>()
setCollectorResolver(() => requestCollector.getStore())

const link = new RPCLink({
  origin: 'http://local',
  url: '/rpc',
  headers: { authorization: 'Bearer fixture-secret' },
  fetch: async () => {
    // Let concurrent renders overlap
    await new Promise(resolve => setTimeout(resolve, 20))
    return new Response(JSON.stringify({
      json: { ok: true },
    }), {
      headers: { 'content-type': 'application/json' },
    })
  },
  plugins: [
    new OrpcInspectorPlugin(),
  ],
})
const client = createORPCClient<{ ping: (input: { marker: string }) => Promise<{ ok: boolean }> }>(link)

/** Renders the head of one request, with that request's SSR records */
export async function render(marker: string): Promise<string> {
  const collector = new OrpcInspectorCollector()
  await requestCollector.run(collector, () => client.ping({ marker }))
  return renderOrpcInspectorScript(collector)
}
