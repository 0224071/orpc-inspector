# 翻譯 zod 訊息

[English](./zod-locale.md) | 繁體中文

設定 `zodLocale`，把 zod 的預設驗證訊息顯示成你的語言。

## 設定

Vite，在 `vite.config.ts`：

```ts
orpcInspector({ zodLocale: 'zh-TW' })
```

Nuxt，在 `nuxt.config.ts`：

```ts
export default defineNuxtConfig({
  modules: ['orpc-inspector/nuxt'],
  orpcInspector: {
    zodLocale: 'zh-TW',
  },
})
```

你的 zod 4 在 `zod/v4/locales/` 裡有的語系都能用。

## 翻譯範圍

- **會翻譯**：client 端驗證（`RequestValidationPlugin`／`ResponseValidationPlugin`）與 server 端輸入驗證（400 `BAD_REQUEST`）的 zod 預設訊息，SSR 呼叫也算。
- **不翻譯**：自己寫的訊息（schema、check 或全域 `customError`）。server 訊息等於 zod 英文預設訊息或 app 的 zod 語系訊息時，才算預設訊息。
- **不受影響**：紀錄的資料，以及 app 從 zod 拿到的錯誤。面板只改顯示，原文放在訊息的 tooltip。
- server 端輸入驗證失敗列在**不符**，標記為 server 拒絕。
- `zodLocale` 和面板語言（設定 → 顯示 → 語言）各自獨立。

複製的報告可選原文或譯文，見[複製錯誤報告](./error-reports.zh-TW.md)。另見[疑難排解](./troubleshooting.zh-TW.md#zod-訊息沒翻譯)。
