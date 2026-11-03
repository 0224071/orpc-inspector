<p align="center">
  <a href="https://github.com/0224071/orpc-inspector/actions/workflows/ci.yml"><img src="https://github.com/0224071/orpc-inspector/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="./LICENSE"><img src="https://badgen.net/badge/license/MIT/blue" alt="MIT license"></a>
</p>

# orpc-inspector

> [oRPC](https://orpc.dev) 呼叫的 DevTools 面板

[English](./README.md) | 繁體中文

在 DevTools 面板看到 app 發出的每一次 oRPC 呼叫（input、output、錯誤、驗證問題、headers）。

<img src="./docs/images/demo-zh-TW.gif" width="800" alt="示範：按一下就把出錯的呼叫複製成報告，貼到 GitHub、Discord 或 LINE">

## 快速開始

| | Vite app | Nuxt app |
|---|---|---|
| 框架 | Vite 8.3 以上 | Nuxt 4.6 以上 |
| DevTools | `@vitejs/devtools` 0.8 | Nuxt DevTools v4（v3 沒有 dock） |
| oRPC | `@orpc/client` 與 `@orpc/contract` 1.16 以上（1.x） | 同左 |

inspector 只看 client 端。後端可以是 oRPC server，或透過 [`OpenAPILink`](https://orpc.dev/docs/openapi/client/openapi-link) 連的任何 REST API。

### Vite（Vue／React／其他框架）

1. 安裝：

   ```sh
   pnpm add @orpc/client@^1.16.0 @orpc/contract@^1.16.0
   pnpm add -D orpc-inspector @vitejs/devtools@^0.8.0 vite@^8.3.0
   ```

2. 在 `vite.config.ts` 開啟 DevTools，並加上 `orpcInspector()`：

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

執行 `vite`，從 DevTools dock 開啟 **oRPC**。第一次開啟時，輸入 dev server 印出的授權碼（[原因](https://devtools.vite.dev/errors/dtk0013)）。

### Nuxt

1. 安裝：

   ```sh
   pnpm add @orpc/client@^1.16.0 @orpc/contract@^1.16.0
   pnpm add -D orpc-inspector @nuxt/devtools@4 @nuxt/kit@^4.6.0
   ```

2. 在 `nuxt.config.ts` 加上 module：

   ```ts
   export default defineNuxtConfig({
     devtools: { enabled: true },
     modules: ['orpc-inspector/nuxt'],
   })
   ```

3. 在 link 加上自動匯入的 `useOrpcInspectorPlugin()`。link 要在 Nuxt plugin 內建立，SSR 呼叫才會按 request 記錄：

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

執行 `nuxt dev`，從 DevTools dock 開啟 **oRPC**。第一次開啟時，輸入 dev server 印出的授權碼（[原因](https://nuxt.com/modules/devtools/upgrading-to-v4)）。

## 功能

- 🔍 **所有呼叫集中檢視**：input、output、錯誤、[驗證問題](./docs/guide/validation.zh-TW.md)與 headers，含 client 與 [SSR](./docs/guide/ssr.zh-TW.md)
- 🛠️ **在 DevTools dock 裡**：Vue、React 等 Vite app 用 Vite DevTools；Nuxt 用 Nuxt DevTools v4
- 🌐 **錯誤好讀**：[zod 訊息顯示成你的語言](./docs/guide/zod-locale.zh-TW.md)，[錯誤報告](./docs/guide/error-reports.zh-TW.md)可複製成 Markdown、Discord 或 LINE
- 🔒 **遮罩機敏 header**：`authorization`、`cookie` 等 header 在面板與複製的報告中隱藏
- 📦 **production 零成本**：production build 拿到 no-op，除非[自行開啟](./docs/guide/production.zh-TW.md)

## 面板沒出現？

請從 DevTools dock 開啟面板，不要在新分頁開面板網址。其他原因見[疑難排解](./docs/guide/troubleshooting.zh-TW.md)。

## 說明文件

| 我想要… | 文件 |
|---|---|
| 了解各部分怎麼串起來 | [運作方式](./docs/guide/how-it-works.zh-TW.md) |
| 看哪些欄位驗證失敗 | [驗證問題](./docs/guide/validation.zh-TW.md) |
| 用 interceptor、batch 或 `OpenAPILink` | [Link 整合](./docs/guide/link.zh-TW.md) |
| 不用 Nuxt 也記錄 SSR 呼叫 | [SSR](./docs/guide/ssr.zh-TW.md) |
| 把 zod 訊息顯示成我的語言 | [翻譯 zod 訊息](./docs/guide/zod-locale.zh-TW.md) |
| 把失敗貼到 issue 或聊天室 | [複製錯誤報告](./docs/guide/error-reports.zh-TW.md) |
| 在測試環境保留 inspector | [Production build](./docs/guide/production.zh-TW.md) |
| 面板打不開或少了呼叫 | [疑難排解](./docs/guide/troubleshooting.zh-TW.md) |

## 參與貢獻

見 [CONTRIBUTING.md](./CONTRIBUTING.md)（英文）。規劃與變更走 [OpenSpec](https://github.com/Fission-AI/OpenSpec)：`openspec/`。

## License

[MIT](./LICENSE)
