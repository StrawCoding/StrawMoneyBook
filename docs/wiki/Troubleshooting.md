# Troubleshooting

## 症狀 → 原因 → 驗證 → 處理

### A) CI 擋在 `release:sync-check`

- 症狀：`frontend/package.json` version 與最新 `v*` tag 不一致
- 原因：人工改版本或沒走 `gpr`
- 驗證：`cd frontend && npm run release:sync-check`
- 處理：回到 [Closeout-And-Versioning](Closeout-And-Versioning) 用 `npm run gpr`

### B) 測試通過但 UI 不對

- 優先 `npm run playwright:ui-layout --prefix frontend`（必須進 BottomNav shell）
- 再跑功能 suite：`playwright:carrier-sync` / `budget-pay-cycle`

### C) Playwright 找不到 browsers

```bash
cd backend && npm run playwright:install-browsers
```

對齊 CI 的 `PLAYWRIGHT_BROWSERS_PATH`。

### D) Android SQLite / better-sqlite3 ABI

不要在 host install native。`backend && npm run deploy:copy` 後 **`docker restart StrawMB`**。[Backend-Deployment-And-Health](Backend-Deployment-And-Health)

### E) 銀行同步

產品面已移除。舊 bookmark `/settings/bank-sync` 會導向功能頁。

### F) 載具「已設定」但一查就 401／503

`isEInvoiceApiConfigured()` 必須有 API base **且** client key，不能只因 PROD／native 就回 true。Health 200 ≠ 財政部登入成功。

### G) 共同帳本 CORS／cookie 冷啟動

Cookie 只負責 restore；`canUseApi` 需要 access token。對照 [`docs/google-backend-auth.md`](../google-backend-auth.md)。

### H) Play 看不到更新

AAB 上傳成功只代表檔案到 Google。確認 `play-testing-channel.json` 軌道、測試者 opt-in、以及 `https://www.strawmb.com/app-update.json` 的 `latestVersion`。[Wear-Companion](Wear-Companion)

### I) 華南 `hua_nan_account_list_not_found`

- 症狀：登入成功但沒有可同步帳戶
- 原因：H1 尚未用真實登入凍 DOM；現行啟發式掃 8–16 位數字
- 驗證：debug trace 的 `h1_probe`（frame path、form name/id、table header、digitBlobCount）；帳號只應出現末四碼
- 處理：收集 redacted 真機 trace 後才凍 H1。不是憑證錯誤，不要「重新連結」空轉。[Sync-Architecture-B](Sync-Architecture-B)

### J) 華南 `hua_nan_transaction_query_failed` / `hua_nan_transaction_page_timeout`

- 症狀：帳戶已在、同步拉明細失敗
- 原因：入口／表單 ready／送出後結果逾時。表單合約已凍（`InqMain`、「明細」、`#acct1`、`inqtype`+民國年 select、`doSubmit`）。`reason`：`inquiry_not_found`｜`page_not_ready`｜`query_timeout`｜`missing_h2_anchors`
- 驗證：重建並安裝含 `h2_probe` 的 APK；看 `inquiryMatch`（`inq_main_href`／`mingxi_text`）、`hasH2FormAnchors`、intercept skip reason
- 處理：歸 `portal_changed`／retry，**不要** reconnect；結果列仍 partial 時補真機 table header 證據。GET allowlist 仍未開（observe-only）

## 引用

- [`./.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`backend/scripts/deploy-production-install.mjs`](../../backend/scripts/deploy-production-install.mjs)
