# Link integration

English | [繁體中文](./link.zh-TW.md)

On oRPC 1.x, add `OrpcInspectorPlugin` anywhere in the link's `plugins` (for 2.0 beta, see [oRPC v2](#orpc-v2-beta)). Order does not matter: it always wraps the other plugins (`ResponseValidationPlugin`, `ClientRetryPlugin`, …). `RPCLink` and `OpenAPILink` both work.

## Use interceptors instead of the plugin

1. Create the interceptors:

   ```ts
   import { createOrpcInspectorInterceptors } from 'orpc-inspector'

   const { interceptor, clientInterceptor } = createOrpcInspectorInterceptors()
   ```

2. Put each one first in its list:

   ```ts
   const link = new RPCLink({
     url: `${location.origin}/rpc`,
     interceptors: [interceptor, /* yours */],
     clientInterceptors: [clientInterceptor, /* yours */],
   })
   ```

## oRPC v2 (beta)

oRPC 2.0 is in beta, and its link plugins work differently from 1.x. Import from `orpc-inspector/v2` instead of `orpc-inspector`. The inspector is tested with `2.0.0-beta.51`; later betas may change the plugin API again.

```ts
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { OrpcInspectorPlugin } from 'orpc-inspector/v2'

const link = new RPCLink({
  url: '/rpc',
  plugins: [
    // Put it last so it also wraps your own plugins
    new OrpcInspectorPlugin(),
  ],
})

export const client = createORPCClient(link)
```

- The plugin always wraps oRPC's built-in plugins (`ResponseValidationLinkPlugin`, `RetryLinkPlugin`, `BatchLinkPlugin`, …), wherever you put it. It cannot see your own plugins' names, so put it last to wrap them too.
- For interceptors, use `transportInterceptor` in v2's `transportInterceptors` (v1's `clientInterceptors`):

  ```ts
  import { createOrpcInspectorInterceptors } from 'orpc-inspector/v2'

  const { interceptor, transportInterceptor } = createOrpcInspectorInterceptors()
  const link = new RPCLink({
    url: '/rpc',
    interceptors: [interceptor, /* yours */],
    transportInterceptors: [transportInterceptor, /* yours */],
  })
  ```

- The recorded URL is the one oRPC v2 passes to interceptors: a path such as `/rpc/ping`, without the `origin` option.
- v2 errors carry no HTTP status, so the panel takes it from the response.
- The SSR helpers (`OrpcInspectorCollector`, `renderOrpcInspectorScript`, `setCollectorResolver`) are exported from `orpc-inspector/v2` too.
- Nuxt: `useOrpcInspectorPlugin()` returns the v2 plugin when the project's `@orpc/client` is 2.x. Nothing to change.

## Good to know

- Leave the plugin in production code: production builds resolve `orpc-inspector` to a no-op. To keep it on, see [Production builds](./production.md).
- With the interceptors, inner interceptors receive a shallow copy of `context`, not the original object.
- With `BatchLinkPlugin`, the panel shows each procedure request, not the combined batch.
- Request headers are the ones oRPC encodes. Headers the browser adds at send time, such as `cookie` and `content-type`, are not shown.
- In the browser, `set-cookie` ([forbidden response header](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_response_header_name)) and response headers not listed in [`Access-Control-Expose-Headers`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers) are not available.

See also [Troubleshooting](./troubleshooting.md).
