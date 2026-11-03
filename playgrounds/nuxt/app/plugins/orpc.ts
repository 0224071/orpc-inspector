import type { ContractRouterClient } from '@orpc/contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { RequestValidationPlugin, ResponseValidationPlugin } from '@orpc/contract/plugins'
import { contract } from '#shared/contract'

export default defineNuxtPlugin(() => {
  const url = `${useRequestURL().origin}/rpc`
  const link = new RPCLink({
    url,
    // Sensitive header, to verify SSR records are redacted before reaching the client via payload
    headers: { authorization: 'Bearer nuxt-playground-secret' },
    plugins: [
      useOrpcInspectorPlugin(),
    ],
  })
  const client: ContractRouterClient<typeof contract> = createORPCClient(link)
  // Validates against the contract on the client, so the panel records zod issues (and their zodLocale translations)
  const validatingLink = new RPCLink({
    url,
    plugins: [
      useOrpcInspectorPlugin(),
      new RequestValidationPlugin(contract),
      new ResponseValidationPlugin(contract),
    ],
  })
  const validatingClient: ContractRouterClient<typeof contract> = createORPCClient(validatingLink)
  return {
    provide: {
      client,
      validatingClient,
    },
  }
})
