<p align="center">
  <a href="https://github.com/0224071/orpc-inspector/actions/workflows/ci.yml"><img src="https://github.com/0224071/orpc-inspector/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="./LICENSE"><img src="https://badgen.net/badge/license/MIT/blue" alt="MIT license"></a>
</p>

# orpc-inspector

> [oRPC](https://orpc.dev) 呼叫的 DevTools 面板

[English](./README.md) | 繁體中文

在 DevTools 面板看到 app 發出的每一次 oRPC 呼叫（input、output、錯誤、驗證問題、headers）。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/images/panel-calls-dark.png">
  <img src="./docs/images/panel-calls-light.png" width="800" alt="oRPC 面板：呼叫清單標出成功、錯誤與驗證不符，右側是選取呼叫的 URL、input、headers 與 response body">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/images/panel-validation-dark.png">
  <img src="./docs/images/panel-validation-light.png" width="800" alt="response 不符合 zod schema 的呼叫詳情：依路徑列出八個問題，例如 email 格式錯誤、缺少 price">
</picture>

> [!NOTE]
> 開發中，尚未發布到 npm。

## 功能

- 🔍 **所有呼叫集中檢視**：input、output、錯誤、[驗證問題](#驗證問題)與 headers，含 client 與 [SSR](./docs/guide/ssr.zh-TW.md)
- 🛠️ **DevTools dock**：Vue、React 等 Vite app 用 Vite DevTools；Nuxt 用 Nuxt DevTools v4
- 🌐 **錯誤好讀**：[zod 訊息顯示成你的語言](./docs/guide/zod-locale.zh-TW.md)，[錯誤報告](./docs/guide/error-reports.zh-TW.md)可複製成 Markdown、Discord 或 LINE
- 🔒 **遮罩機敏 header**：`authorization`、`cookie` 等 header 在面板與複製的報告中隱藏，非 oRPC 後端錯誤 data 裡的回應 header 也一樣；SSR 紀錄離開 server 前就換成 `***`
- 📦 **production 零成本**：production build 拿到 no-op，除非[自行開啟](./docs/guide/production.zh-TW.md)

## Vite（Vue／React／其他框架）

需要 Vite 8.3 以上、`@vitejs/devtools` 0.8，以及 `@orpc/client`／`@orpc/contract` 1.16 以上的 1.x。

1. 安裝：

   ```sh
   pnpm add @orpc/client@^1.16.0 @orpc/contract@^1.16.0
   pnpm add -D orpc-inspector @vitejs/devtools@^0.8.0 vite@^8.3.0
   ```

2. 在 `vite.config.ts` 開啟 DevTools，並在框架 plugin 旁加上 `orpcInspector()`：

   ```ts
   import vue from '@vitejs/plugin-vue' // 或 react()…
   import { orpcInspector } from 'orpc-inspector/vite'
   import { defineConfig } from 'vite'

   export default defineConfig({
     devtools: true,
     plugins: [
       vue(),
       orpcInspector(),
     ],
   })
   ```

3. 在 oRPC link 加上 `OrpcInspectorPlugin`：

   ```ts
   import { createORPCClient } from '@orpc/client'
   import { RPCLink } from '@orpc/client/fetch'
   import { OrpcInspectorPlugin } from 'orpc-inspector'

   const link = new RPCLink({
     url: `${location.origin}/rpc`,
     plugins: [
       new OrpcInspectorPlugin(),
     ],
   })

   export const client = createORPCClient(link)
   ```

4. 執行 `vite`，從 DevTools dock 開啟 **oRPC**。徽章顯示錯誤與驗證失敗筆數。第一次開啟時，dock 會要求輸入 dev server 印出的授權碼（見 [Vite DevTools](https://devtools.vite.dev/errors/dtk0013)）。

inspector 只看 client 端。後端可以是 link 連得到的任何 server：用 oRPC [adapter](https://orpc.dev/docs/adapters/node-http) 掛的 oRPC server，或透過 [`OpenAPILink`](https://orpc.dev/docs/openapi/client/openapi-link) 連既有的 REST API。

## Nuxt

需要 Nuxt 4.6 以上、Nuxt DevTools v4，以及 `@orpc/client`／`@orpc/contract` 1.16 以上的 1.x。Nuxt DevTools v3（Nuxt 4.6 預設）沒有 dock，不支援。

1. 安裝：

   ```sh
   pnpm add @orpc/client@^1.16.0 @orpc/contract@^1.16.0
   pnpm add -D orpc-inspector @nuxt/devtools@4 @nuxt/kit@^4.6.0
   ```

2. 在 `nuxt.config.ts`：

   ```ts
   export default defineNuxtConfig({
     devtools: { enabled: true },
     modules: ['orpc-inspector/nuxt'],
   })
   ```

3. 在建立 oRPC client 的 Nuxt plugin 裡，加上自動匯入的 `useOrpcInspectorPlugin()`。link 要在 plugin 內建立，不要放在 module 頂層，SSR 呼叫才會按 request 記錄：

   ```ts
   // app/plugins/orpc.ts
   import { createORPCClient } from '@orpc/client'
   import { RPCLink } from '@orpc/client/fetch'

   export default defineNuxtPlugin(() => {
     const link = new RPCLink({
       url: `${useRequestURL().origin}/rpc`,
       plugins: [
         useOrpcInspectorPlugin(),
       ],
     })
     return {
       provide: {
         client: createORPCClient(link),
       },
     }
   })
   ```

4. 執行 `nuxt dev`，從 DevTools dock 開啟 **oRPC**。第一次開啟時，輸入 dev server 印出的授權碼（見 [Nuxt DevTools](https://nuxt.com/modules/devtools/upgrading-to-v4)）。

後端可以是任何 server：用 oRPC [Nuxt adapter](https://orpc.dev/docs/adapters/nuxt) 架的 oRPC server，或透過 [`OpenAPILink`](https://orpc.dev/docs/openapi/client/openapi-link) 連既有的 REST API。

## 驗證問題

inspector 只顯示 oRPC 回報的驗證問題，本身不做驗證。

- **client 端，任何後端都可用**：用 oRPC contract 定義 API，並在 link 加上 [`RequestValidationPlugin`](https://orpc.dev/docs/plugins/request-validation) 與 [`ResponseValidationPlugin`](https://orpc.dev/docs/plugins/response-validation)。輸入不符時標成「未送出」；回應不符 contract 時，逐一列出不符的欄位，如上方截圖。
- **oRPC server 回報**：server 以 `BAD_REQUEST` 加 `data.issues` 拒絕輸入時，標成「伺服器拒絕了輸入」，同樣列出欄位。
- server 自己的 output 驗證失敗時，只回一般的 500，沒有 issues（見[疑難排解](./docs/guide/troubleshooting.zh-TW.md)）。

例如接 REST 後端（`pnpm add @orpc/openapi-client@^1.16.0`）：

```ts
import type { ContractRouterClient } from '@orpc/contract'
import { createORPCClient } from '@orpc/client'
import { RequestValidationPlugin, ResponseValidationPlugin } from '@orpc/contract/plugins'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { OrpcInspectorPlugin } from 'orpc-inspector'
import { contract } from './contract' // 用 @orpc/contract 的 `oc` 定義

const link = new OpenAPILink(contract, {
  url: `${location.origin}/api`,
  plugins: [
    new OrpcInspectorPlugin(),
    new RequestValidationPlugin(contract),
    new ResponseValidationPlugin(contract),
  ],
})

export const client: ContractRouterClient<typeof contract> = createORPCClient(link)
```

## 面板沒出現？

見[疑難排解](./docs/guide/troubleshooting.zh-TW.md)。最常見的原因：在獨立分頁開了面板網址。請改從 DevTools dock 開啟。

## 說明文件

| 我想要… | 文件 |
|---|---|
| 用 interceptor、batch 或 `OpenAPILink` | [Link 整合](./docs/guide/link.zh-TW.md) |
| 不用 Nuxt 也記錄 SSR 呼叫 | [SSR](./docs/guide/ssr.zh-TW.md) |
| 把 zod 訊息顯示成我的語言 | [翻譯 zod 訊息](./docs/guide/zod-locale.zh-TW.md) |
| 把失敗貼到 issue 或聊天室 | [複製錯誤報告](./docs/guide/error-reports.zh-TW.md) |
| 在測試環境保留 inspector | [Production build](./docs/guide/production.zh-TW.md) |

## 參與貢獻

見 [CONTRIBUTING.md](./CONTRIBUTING.md)（英文）。規劃與變更走 [OpenSpec](https://github.com/Fission-AI/OpenSpec)：`openspec/`。

## License

[MIT](./LICENSE)
