# 疑難排解

[English](./troubleshooting.md) | 繁體中文

## 面板打不開

| 症狀 | 原因 | 修法 |
|---|---|---|
| dock 裡沒有 oRPC 項目，dev server 記一筆警告 | 沒有 Vite DevTools，或 Nuxt DevTools 是 v3／被關掉 | Vite：裝 `@vitejs/devtools` 並設 `devtools: true`。Nuxt：裝 `@nuxt/devtools@4` 並設 `devtools: { enabled: true }` |
| 面板網址（`<base>__orpc-inspector/`）停在未連線畫面 | 這個網址是 dock 載入的頁面，單獨開分頁不會動 | 從 DevTools dock 開啟面板 |
| 警告說 Vite DevTools 載入失敗 | Vite DevTools 載入時出錯，錯誤印在警告上方 | 先修那個錯誤；確認 `@vitejs/devtools` 是 `^0.8.0` |
| dev server 的 log 裡沒有 `[orpc-inspector]` 開頭的行 | plugin 或 module 沒有註冊 | Vite：把 `orpcInspector()` 加進 `plugins`。Nuxt：把 `'orpc-inspector/nuxt'` 加進 `modules` |
| 裝 Nuxt DevTools 時 pnpm 卡住 | 用 pnpm `overrides` 換版本 | 拿掉 override，在專案直接裝 `@nuxt/devtools@4` |

## 少了呼叫

| 症狀 | 原因 | 修法 |
|---|---|---|
| 完全沒有呼叫 | link 上沒有 `OrpcInspectorPlugin` | 加進 link 的 `plugins`（[Vite](../../README.zh-TW.md#vitevuereact其他框架)、[Nuxt](../../README.zh-TW.md#nuxt)） |
| 手刻 SSR server 沒有 SSR 呼叫 | server 用一般 `node` 在 Vite 外 import `orpc-inspector`，拿到 no-op；或 `ssr.external` 讓它維持 external | 讓 SSR 入口經 Vite 載入且設定裡有 `orpcInspector()`，或改用 `node --conditions=development`（[SSR](./ssr.zh-TW.md#server-入口從哪裡載入)） |
| Nuxt 沒有 SSR 呼叫 | link 只建一次、跨 request 共用 | 在 Nuxt plugin 或 `setup` 內建立 link，每個 request 一個 |
| 看不到 batch 請求 | 用了 `BatchLinkPlugin` | 正常：面板顯示各個 procedure 的請求，不是合併後的 batch |

## Nuxt dev 首次載入會重新整理

| 症狀 | 原因 | 修法 |
|---|---|---|
| `nuxt dev` 首次載入時頁面重新整理一次 | `@orpc/client`、`@orpc/client/fetch` 或 `@orpc/contract` 列在 `vite.optimizeDeps.exclude`。module 會把這三個加進 `optimizeDeps.include`，但跳過你排除的 id | 從 `optimizeDeps.exclude` 移除 |

## zod 訊息沒翻譯

| 症狀 | 原因 | 修法 |
|---|---|---|
| dev server 對 `zodLocale` 發出警告 | 沒裝 zod 4，或語系名稱不存在 | 裝 zod 4；用 `zod/v4/locales/` 裡有的名稱 |
| 部分訊息仍是英文 | 自訂訊息、zod 3 schema、非 zod 的 schema，或經序列化改變的值（Date、bigint） | 正常：只翻譯 zod 4 的預設訊息 |
| server 500 驗證錯誤沒有 issues | output 驗證失敗本來就不帶 issues | 正常：維持一般錯誤 |

## Production build

| 症狀 | 原因 | 修法 |
|---|---|---|
| 有警告，build 裡沒有 inspector | build 裡沒有 Vite DevTools | 加上 `devtools: { build: { withApp: true, injection: true } }` |
| 有警告，頁面上沒有 dock | 沒開 `build.injection` | 打開它，或自己載入 `<base>__devtools/embedded.js` |
| `vite build` 不會結束 | Vite 的 `devtools` 選項會在 build 後啟動 DevTools server | 改用 `@vitejs/devtools` 的 `DevTools()` plugin（見 [Production build](./production.zh-TW.md#vite)） |
| Nuxt：有警告，build 是 no-op | 解析不到 `@vitejs/devtools` | `pnpm add -D @vitejs/devtools@^0.8.0` |
| Nuxt：dock 的 logo 破圖 | `app.baseURL` 不是 `/`，Vite DevTools 從 `/` 載入 logo | 已知限制，dock 照常可用 |
