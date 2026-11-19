# 運作方式

[English](./how-it-works.md) | 繁體中文

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/panel-calls-dark.png">
  <img src="../images/panel-calls-light.png" width="800" alt="oRPC 面板：呼叫清單標出成功、錯誤與驗證不符，右側是選取呼叫的 URL、input、headers 與 response body">
</picture>

```mermaid
flowchart LR
  subgraph Server
    SSR["SSR 渲染 + collector"]
  end
  subgraph 瀏覽器
    Link["oRPC link + OrpcInspectorPlugin"] --> Records["頁面裡的呼叫紀錄"]
    Records --> Panel["DevTools dock 裡的 oRPC 面板"]
  end
  SSR -- "寫進頁面 HTML" --> Records
```

1. oRPC link 上的 `OrpcInspectorPlugin` 把每次呼叫（input、output、錯誤、headers）記在頁面裡。
2. SSR 時，collector 記下每個 request 的呼叫，寫進頁面 HTML；頁面載入時併入紀錄。
3. DevTools dock 裡的 oRPC 面板直接從頁面讀取紀錄。
4. production build 拿到 no-op，除非[自行開啟](./production.zh-TW.md)。

inspector 只看 link 的 client 端，所以後端可以是 link 連得到的任何 server。

## 重試、串流與取消的呼叫

- `ClientRetryPlugin` 重試的呼叫只有一筆紀錄。嘗試超過一次時，詳情會列出每一次：method、狀態碼（request 失敗時顯示「無回應」）與 URL。摘要顯示最後一次。
- 回傳 event iterator 的呼叫，在「事件」區列出事件，每個事件標出它在整條串流中的位置。每筆紀錄保留最後 100 個事件與總數。
- 串流重新連線時（例如透過 `ClientRetryPlugin`），會有一條分隔線標出新的嘗試從哪個事件開始。
- 呼叫端提早停止讀取串流，或中止呼叫的 `AbortSignal`（例如查詢函式庫取消查詢）時，呼叫會記成「已取消」。已取消的呼叫不算錯誤，也不會放進錯誤報告。取消前收到的事件會保留。
- `Map` 記成 `[key, value]` 陣列，`Set` 記成值的陣列。

## 用語

| 用語 | 意思 |
|---|---|
| Dock | 頁面裡的 DevTools 工具列：Vite DevTools 或 Nuxt DevTools v4。**oRPC** 是其中一個項目 |
| 面板 | oRPC 的檢視畫面。只能在 dock 裡用，不能在獨立分頁開 |
| 授權碼 | dev server 印出的碼。第一次開 dock 時會要求輸入 |
| Side | 呼叫在哪裡執行：`client` 或 `ssr` |
| Collector | 記錄一個 server request 裡的 SSR 呼叫（[SSR](./ssr.zh-TW.md)） |
| No-op | production build 拿到的版本：API 相同，但什麼都不做 |
| Hub | production build 裡的 Vite DevTools 檔案（`__devtools/`） |
