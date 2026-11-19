# Link 整合

[English](./link.md) | 繁體中文

oRPC 1.x 把 `OrpcInspectorPlugin` 放進 link 的 `plugins` 任一位置（2.0 beta 見 [oRPC v2](#orpc-v2beta)）。順序不用排：它一律包在其他 plugin（`ResponseValidationPlugin`、`ClientRetryPlugin`…）外層。`RPCLink` 和 `OpenAPILink` 都能用。

## 改用 interceptor

1. 建立 interceptor：

   ```ts
   import { createOrpcInspectorInterceptors } from 'orpc-inspector'

   const { interceptor, clientInterceptor } = createOrpcInspectorInterceptors()
   ```

2. 各自放在清單最前面：

   ```ts
   const link = new RPCLink({
     url: `${location.origin}/rpc`,
     interceptors: [interceptor, /* 你的 */],
     clientInterceptors: [clientInterceptor, /* 你的 */],
   })
   ```

## oRPC v2（beta）

oRPC 2.0 還在 beta，link plugin 的運作方式和 1.x 不同。改從 `orpc-inspector/v2` 匯入，不是 `orpc-inspector`。inspector 以 `2.0.0-beta.51` 測過；之後的 beta 可能又改 plugin API。

```ts
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { OrpcInspectorPlugin } from 'orpc-inspector/v2'

const link = new RPCLink({
  url: '/rpc',
  plugins: [
    // 放最後，才會連你自己的 plugin 一起包住
    new OrpcInspectorPlugin(),
  ],
})

export const client = createORPCClient(link)
```

- 不論放在哪個位置，plugin 都會包在 oRPC 內建 plugin（`ResponseValidationLinkPlugin`、`RetryLinkPlugin`、`BatchLinkPlugin`…）外層。它看不到你自己 plugin 的名稱，所以要放最後才會一起包住。
- 改用 interceptor 時，把 `transportInterceptor` 放進 v2 的 `transportInterceptors`（v1 叫 `clientInterceptors`）：

  ```ts
  import { createOrpcInspectorInterceptors } from 'orpc-inspector/v2'

  const { interceptor, transportInterceptor } = createOrpcInspectorInterceptors()
  const link = new RPCLink({
    url: '/rpc',
    interceptors: [interceptor, /* 你的 */],
    transportInterceptors: [transportInterceptor, /* 你的 */],
  })
  ```

- 記錄的 URL 是 oRPC v2 交給 interceptor 的那個：像 `/rpc/ping` 的路徑，不含 `origin` 選項。
- v2 的錯誤本身沒有 HTTP status，面板改從回應取得。
- SSR 用的 `OrpcInspectorCollector`、`renderOrpcInspectorScript`、`setCollectorResolver` 也可以從 `orpc-inspector/v2` 匯入。
- Nuxt：專案的 `@orpc/client` 是 2.x 時，`useOrpcInspectorPlugin()` 會回傳 v2 的 plugin，不用改任何東西。

## 補充

- plugin 可以留在正式程式碼：production build 時 `orpc-inspector` 解析成 no-op。要保留功能，見 [Production build](./production.zh-TW.md)。
- 改用 interceptor 時，內層 interceptor 拿到的 `context` 是淺複製，不是原本的物件。
- 用 `BatchLinkPlugin` 時，面板顯示各個 procedure 的請求，不是合併後的 batch。
- 請求 headers 是 oRPC 編碼的那些。瀏覽器送出時才加上的 header（例如 `cookie`、`content-type`）不會顯示。
- 在瀏覽器裡，`set-cookie`（[forbidden response header](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_response_header_name)）與沒有列在 [`Access-Control-Expose-Headers`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers) 的回應 headers 拿不到。

另見[疑難排解](./troubleshooting.zh-TW.md)。
