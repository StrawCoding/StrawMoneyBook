# Sync-Operations-Runbooks

同步類主入口：功能頁（`/features`）**進階功能**（共同帳本、帳本同步、銀行同步、載具同步）。設定頁不是主清單入口，深度連結仍可用。

架構剩餘與真機閘：[Sync-Architecture-B](Sync-Architecture-B)。APK：[Android-Native-Bank-APK](Android-Native-Bank-APK)。

## Shared Ledger / Google Drive

- 權威：[`docs/google-backend-auth.md`](../google-backend-auth.md)
- Drive 使用者帳本備份 **不能** 取代後端 `collab-store.sqlite`（見 [Backups-And-Restore](Backups-And-Restore)）
- 空遠端擋 hard replace：`empty_remote_blocked`；CAS `version_conflict` 禁止靜默 `force:true`

## Bank Sync（smb306 模組化恢復 — 僅華南）

```bash
npm run playwright:bank-sync --prefix frontend
npm run simulate:bank-sync --prefix frontend   # mock API，非真實銀行
cd frontend/android && ./gradlew :app:testDebugUnitTest --tests "com.strawcoding.strawmoneybook.core.CaptchaSolverFixtureTest"
```

生產路徑只有 Android native WebView（`BankAutomationPlugin`）。**Active provider：`hua_nan_bank_tw`  only**；第一銀行已移除。

### 流程

1. 功能頁 → `/settings/bank-sync`（可用性診斷 + 支援矩陣）
2. 建立連線 wizard：選華南 → 登入（OCR captcha → 失敗則 `hua_nan_captcha_manual_required` / SEMI_MANUAL → `submitCaptcha`）
3. 帳戶對應 → 手動 sync
4. 待匯入審核 → 確認匯入 ledger

### Captcha / 中止

- OCR：`CaptchaSolver.recognizeFromDataUrl` + `validateCaptchaCandidate`（JVM fixture 必須真 OCR，禁硬編碼 fallback PASS）
- 半自動：`BankAutomation.submitCaptcha` / `BankAutomation.abortBank`（Activity `ACTION_SUBMIT_CAPTCHA` / `abortRunningSession`）
- 錯誤碼：`hua_nan_captcha_manual_required`、`bank_automation_aborted`、`USER_INTERACTION_REQUIRED`（debug trace `phase`）

### H2 / PARTIAL

- 未找到日期欄／查詢按鈕或未解析交易時：**不得**標帳戶 `ok` + `coveredThrough`；改 `accountResults[].status=partial` + `hua_nan_transaction_query_partial`
- 原生頂層 `coveredThrough`／`sync_time` 僅在 `sync_status=ok` 時寫入；`partial_success` 省略頂層 watermark
- JS `syncBankConnectionNow`：只對 `status=ok` 帳戶寫 `lastSuccessSyncAt`；`partial` 寫 `partial_success` 且**不**推進帳戶／連線 watermark（即使 top-level 誤帶日期也忽略）
- 聚合：`sync_status=partial_success`；checkpoint 只推進 `ok` 帳戶

### 雙 flag

`VITE_BANK_SYNC_FEATURE_ENABLED` 與 `VITE_BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS`。

先看可用性診斷的**錯誤碼**，再處理 UI。auth 失敗整次中止；非 auth 可 `partial_success`（帳號級 watermark）。

## Carrier Sync

```bash
npm run playwright:carrier-sync --prefix frontend
```

`isEInvoiceApiConfigured()`：要有 API base 與 client key。Health 200 ≠ portal 登入成功。Captcha 取消必須關 session（`abortCarrier`）。

## 引用

- [`frontend/scripts/playwright-bank-sync-settings.mjs`](../../frontend/scripts/playwright-bank-sync-settings.mjs)
- [`frontend/scripts/playwright-carrier-sync-settings.mjs`](../../frontend/scripts/playwright-carrier-sync-settings.mjs)
- [Environment-Variables](Environment-Variables)
