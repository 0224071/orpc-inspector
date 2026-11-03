# Link integration

English | [繁體中文](./link.zh-TW.md)

Add `OrpcInspectorPlugin` anywhere in the link's `plugins`. Order does not matter: it always wraps the other plugins (`ResponseValidationPlugin`, `ClientRetryPlugin`, …). `RPCLink` and `OpenAPILink` both work.

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

## Good to know

- Leave the plugin in production code: production builds resolve `orpc-inspector` to a no-op. To keep it on, see [Production builds](./production.md).
- With the interceptors, inner interceptors receive a shallow copy of `context`, not the original object.
- With `BatchLinkPlugin`, the panel shows each procedure request, not the combined batch.
- Request headers are the ones oRPC encodes. Headers the browser adds at send time, such as `cookie` and `content-type`, are not shown.
- In the browser, `set-cookie` ([forbidden response header](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_response_header_name)) and response headers not listed in [`Access-Control-Expose-Headers`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers) are not available.

See also [Troubleshooting](./troubleshooting.md).
