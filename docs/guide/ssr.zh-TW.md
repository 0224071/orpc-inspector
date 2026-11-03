# SSR

[English](./ssr.md) | 繁體中文

server 端渲染時的呼叫會出現在面板，side 顯示 `ssr`。只帶出已完成的呼叫。

SSR 紀錄會寫進頁面 HTML。機敏 header 會換成 `***`，但 input、output 與 URL 不遮罩。

## Nuxt

不用設定。在 Nuxt plugin 或 `setup` 內建立 link（如 [README](../../README.zh-TW.md#nuxt)），每個 request 各自一個 link。

## Vite（非 Nuxt）

1. 在 `entry-server.ts` 每個 request 建一個 collector，讓 client 找得到它：

   ```ts
   import { AsyncLocalStorage } from 'node:async_hooks'
   import { OrpcInspectorCollector, renderOrpcInspectorScript, setCollectorResolver } from 'orpc-inspector'

   const requestCollector = new AsyncLocalStorage<OrpcInspectorCollector>()
   setCollectorResolver(() => requestCollector.getStore())

   export async function render(url: string) {
     const collector = new OrpcInspectorCollector()
     // renderApp：你原本的 SSR 渲染，例如 renderToString(app)
     const appHtml = await requestCollector.run(collector, () => renderApp(url))
     return {
       appHtml,
       head: renderOrpcInspectorScript(collector),
     }
   }
   ```

2. 把 `head` 放進 `<head>`，要在 page script 之前。
3. client 端照常在 link 加 `new OrpcInspectorPlugin()`。`orpc-inspector/vite` 注入的 page script 會併入 SSR 紀錄，不用呼叫 `hydrateOrpcInspector()`。

不想用 resolver，可以直接傳 collector：`new OrpcInspectorPlugin({ collector })`。

## 補充

- SSR 入口經 Vite 載入（`vite.ssrLoadModule()`，如第 1 步）就能記錄，不用額外設定。
- 如果 `orpc-inspector` 列在 `ssr.external`，或 `ssr.external` 設成 `true`，就由 Node 自己的條件決定拿到什麼。
- 用一般 `node` 直接 import `orpc-inspector`、不經 Vite 的 server 會拿到 no-op。改用 `node --conditions=development server.js` 執行。

另見[疑難排解](./troubleshooting.zh-TW.md#少了呼叫)。以上都用於開發環境；要在 build 保留 SSR 紀錄，見 [Production build](./production.zh-TW.md#vite)。
