# Link 整合

[English](./link.md) | 繁體中文

把 `OrpcInspectorPlugin` 放進 link 的 `plugins` 任一位置。順序不用排：它一律包在其他 plugin（`ResponseValidationPlugin`、`ClientRetryPlugin`…）外層。`RPCLink` 和 `OpenAPILink` 都能用。

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

內層 interceptor 拿到的 `context` 是淺複製，不是原本的物件。

## 補充

- plugin 可以留在正式程式碼：production build 時 `orpc-inspector` 解析成 no-op。要保留功能，見 [Production build](./production.zh-TW.md)。
- 用 `BatchLinkPlugin` 時，面板顯示各個 procedure 的請求，不是合併後的 batch。
- 請求 headers 是 oRPC 編碼的那些。瀏覽器送出時才加上的 header（例如 `cookie`、`content-type`）不會顯示。
- 在瀏覽器裡，`set-cookie`（[forbidden response header](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_response_header_name)）與沒有列在 [`Access-Control-Expose-Headers`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers) 的回應 headers 拿不到。

另見[疑難排解](./troubleshooting.zh-TW.md)。
