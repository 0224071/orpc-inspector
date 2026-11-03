# Production build

[English](./production.md) | 繁體中文

設 `production: true`，在預覽或測試環境的 build 保留 inspector。預設關閉：production build 拿到 no-op。這個選項在 build 時決定，沒有執行期開關。

> [!WARNING]
> 能載入頁面的人都能打開面板，看到所有記錄下來的呼叫：input、output、錯誤、URL 與 headers。SSR 紀錄會寫進頁面 HTML。只用在不公開或測試用的部署。承載 dock 的 Vite DevTools hub 也會公開它自己的 build 資料。

## Vite

1. 在 build 開啟 Vite DevTools 與這個選項：

   ```ts
   import vue from '@vitejs/plugin-vue'
   import { orpcInspector } from 'orpc-inspector/vite'
   import { defineConfig } from 'vite'

   export default defineConfig({
     devtools: {
       build: { withApp: true, injection: true },
     },
     plugins: [
       vue(),
       orpcInspector({ production: true }),
     ],
   })
   ```

2. 執行 `vite build`，部署整個 `outDir`。裡面有面板（`__orpc-inspector/`）與 DevTools hub（`__devtools/`）。

- 用 Vite 的 `devtools` 選項時 `vite build` 不會結束。要讓它結束，拿掉 `devtools`、改用 plugin：`plugins: [DevTools({ build: { withApp: true, injection: true } }), orpcInspector({ production: true })]`（`DevTools` 來自 `@vitejs/devtools`）。
- SSR：client 與 server build 的設定都要有這個選項。`renderOrpcInspectorScript()` 就能照 [SSR](./ssr.zh-TW.md#vite非-nuxt) 使用。

## Nuxt

1. 安裝 Vite DevTools：

   ```sh
   pnpm add -D @vitejs/devtools@^0.8.0
   ```

2. 開啟選項：

   ```ts
   export default defineNuxtConfig({
     modules: ['orpc-inspector/nuxt'],
     orpcInspector: {
       production: true,
     },
   })
   ```

3. 執行 `nuxt build`。Nitro 會在 `<app.baseURL>__orpc-inspector/` 提供面板，在 `<app.baseURL><buildAssetsDir>__devtools/` 提供 hub。

要用同一份設定分別 build 有／沒有 inspector 的版本，用環境區分：`$env: { staging: { orpcInspector: { production: true } } }`，再跑 `nuxt build --envName staging`。

## 開啟後會記錄什麼

- client 與 SSR 呼叫，跟 dev 一樣。`zodLocale` 照常生效。
- 機敏 header（`authorization`、`cookie` 等，含錯誤資料裡的）在記錄時就換成 `***`，client 呼叫也是。原值不保留，面板無法還原。dev 時 client 的 header 只在面板隱藏，可以點開。
- input、output 與錯誤內容**不**遮罩。

另見[疑難排解](./troubleshooting.zh-TW.md#production-build)。
