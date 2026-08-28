# Troubleshooting

## 症狀 → 原因 → 驗證 → 處理

### A) CI 擋在 `release:sync-check`

- 症狀：`frontend/package.json` version 與最新 `v*` tag 不一致
- 原因：人工改版本或沒走 `gpr`
- 驗證：`cd frontend && npm run release:sync-check`
- 處理：回到 [Closeout-And-Versioning](Closeout-And-Versioning) 用 `npm run gpr`

### B) 測試通過但 UI 不對

- 優先 `npm run playwright:ui-layout --prefix frontend`（必須進 BottomNav shell）
- 再跑功能 suite：`playwright:bank-sync` / `carrier-sync` / `budget-pay-cycle`

### C) Playwright 找不到 browsers

```bash
cd backend && npm run playwright:install-browsers
```

對齊 CI 的 `PLAYWRIGHT_BROWSERS_PATH`。

### D) Android SQLite / better-sqlite3 ABI

不要在 host install native。`backend && npm run deploy:copy` 後 **`docker restart StrawMB`**。[Backend-Deployment-And-Health](Backend-Deployment-And-Health)

### E) 手機銀行同步仍是舊行為

Web／CI 綠 ≠ 原生已修。確認 APK versionName 後重裝。[Android-Native-Bank-APK](Android-Native-Bank-APK)

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
- 原因：H2 未凍。啟發式點「交易明細」或等 `table`／「查無資料」沒命中。`reason` 為 `inquiry_not_found`（入口）、`page_not_ready`（點進去頁沒 ready）、`query_timeout`（點查詢後沒結果）
- 驗證：重建並安裝含 `h2_probe` 的 APK；看 `h2_probe` 的 inquiry match、date field name/id、wait predicates，以及 intercept 的 GET/POST 計數與 `post_without_body` / `observe_only_no_replay` skip reason
- 處理：Phase A 只取證，不宣稱已修好。有完整 H2 清單證據後才允許 GET allowlist intercept。歸 `portal_changed`／retry，**不要** reconnect

## 引用

- [`./.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`backend/scripts/deploy-production-install.mjs`](../../backend/scripts/deploy-production-install.mjs)
