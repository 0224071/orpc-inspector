# 複製錯誤報告

[English](./error-reports.md) | 繁體中文

把失敗的呼叫複製成訊息，貼到 issue 或聊天室。

## 複製

| 要複製 | 點 |
|---|---|
| 目前篩選清單中所有錯誤與驗證失敗 | 工具列的「複製錯誤報告」 |
| 單筆呼叫 | 呼叫詳情標題列的「複製報告」 |

按鈕旁的箭頭可切換格式：**Markdown**、**Discord** 或 **LINE**。主按鈕沿用上次的選擇。

## 調整報告內容

1. 從箭頭選單開「報告設定…」，或「設定 → 報告範本」，切到「進階」。
2. 在「區塊」中，「問題欄位／錯誤訊息」決定是否納入 issues（路徑、code、訊息、實際值）。
3. 在「問題訊息 → 訊息」選「只用原文」、「譯文」或「譯文，後附原文」。譯文需要 [`zodLocale`](./zod-locale.zh-TW.md)，沒有譯文的 issue 仍用原文。
4. 在「遮罩」設定 key 樣式（正規表示式，不分大小寫）。

單筆報告：呼叫詳情的 Input、Response 與 header 區塊可切換是否納入，選取另一筆呼叫時會重設。

## 會遮罩什麼

- input、output 與 headers 中符合遮罩樣式的 key，值會換成 `***`。其他 key 的值照原樣複製。
- 預設樣式涵蓋 `password`、`passwd`、`secret`、`token`、`cookie`、`credential`、`api_key`／`api-key`／`apikey`、`authorization`、`proxy-authorization` 與 session id。
- 樣式留空即不遮罩。面板用同一個樣式隱藏 headers。
- 非 oRPC 後端的錯誤 data 裡帶的回應 headers 也會遮罩。
- SSR 紀錄在 server 端就把機敏 header 換成 `***`，之後才送到頁面（[SSR](./ssr.zh-TW.md)）。
