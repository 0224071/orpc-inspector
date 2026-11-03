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

### Server 入口從哪裡載入

Vite 設定裡有 `orpcInspector()` 時，經 Vite 載入的 SSR 入口（在 Vite dev server 上用 `vite.ssrLoadModule()`，如第 1 步）不用額外設定就會拿到 recorder：不必設 `ssr.resolve.externalConditions`，也不必加 Node 參數。插件會在 dev server 上把 `orpc-inspector` 留在 Vite 的 SSR 模組圖裡，不改其他套件的解析方式。

如果在 `ssr.external` 列出 `orpc-inspector`，或設了 `ssr.external: true`，插件會讓它維持 external，由 Node 自己的條件決定拿到什麼。

用一般 `node` 直接 import `orpc-inspector`、不經 Vite 模組圖的 server，仍會拿到 no-op。插件看不到這個 import，所以這種 server 要加 development 條件執行：

```sh
node --conditions=development server.js
```

另見[疑難排解](./troubleshooting.zh-TW.md#少了呼叫)。以上都用於開發環境；要在 build 保留 SSR 紀錄，見 [Production build](./production.zh-TW.md#vite)。
