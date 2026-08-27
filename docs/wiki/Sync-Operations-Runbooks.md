# Sync-Operations-Runbooks

同步類主入口：功能頁（`/features`）**進階功能**（共同帳本、帳本同步、銀行同步、載具同步）。設定頁不是主清單入口，深度連結仍可用。

架構剩餘與真機閘：[Sync-Architecture-B](Sync-Architecture-B)。APK：[Android-Native-Bank-APK](Android-Native-Bank-APK)。

## Shared Ledger / Google Drive

- 權威：[`docs/google-backend-auth.md`](../google-backend-auth.md)
- Drive 使用者帳本備份 **不能** 取代後端 `collab-store.sqlite`（見 [Backups-And-Restore](Backups-And-Restore)）
- 空遠端擋 hard replace：`empty_remote_blocked`；CAS `version_conflict` 禁止靜默 `force:true`

## Bank Sync

```bash
npm run playwright:bank-sync --prefix frontend
npm run simulate:bank-sync --prefix frontend   # mock，非真實銀行
```

生產路徑只有 Android native。雙 flag：`VITE_BANK_SYNC_FEATURE_ENABLED` 與 `VITE_BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS`。

先看可用性診斷的**錯誤碼**，再處理 UI。auth 失敗整次中止；非 auth 可 `partial_success`（帳號級 watermark）。

## Carrier Sync

```bash
npm run playwright:carrier-sync --prefix frontend
```

`isEInvoiceApiConfigured()`：要有 API base 與 client key。Health 200 ≠ portal 登入成功。Captcha 取消必須關 session。

## 引用

- [`frontend/scripts/playwright-bank-sync-settings.mjs`](../../frontend/scripts/playwright-bank-sync-settings.mjs)
- [`frontend/scripts/playwright-carrier-sync-settings.mjs`](../../frontend/scripts/playwright-carrier-sync-settings.mjs)
- [Environment-Variables](Environment-Variables)
