# Sync-Operations-Runbooks

同步類主入口：功能頁（`/features`）**進階功能**（共同帳本、帳本同步、銀行同步、載具同步）。設定頁不是主清單入口，深度連結仍可用。

架構剩餘與真機閘：[Sync-Architecture-B](Sync-Architecture-B)。APK：[Android-Native-Bank-APK](Android-Native-Bank-APK)。

## Shared Ledger / Google Drive

- 權威：[`docs/google-backend-auth.md`](../google-backend-auth.md)
- Drive 使用者帳本備份 **不能** 取代後端 `collab-store.sqlite`（見 [Backups-And-Restore](Backups-And-Restore)）
- 空遠端擋 hard replace：`empty_remote_blocked`；CAS `version_conflict` 禁止靜默 `force:true`

## Bank Sync

產品面已移除。舊 bookmark `/settings/bank-sync*` 導向 `/features`。歷史 APK 紀錄見 [Android-Native-Bank-APK](Android-Native-Bank-APK)。

## Carrier Sync

```bash
npm run playwright:carrier-sync --prefix frontend
```

`isEInvoiceApiConfigured()`：要有 API base 與 client key。Health 200 ≠ portal 登入成功。Captcha 取消必須關 session。

## 引用

- [`frontend/scripts/playwright-carrier-sync-settings.mjs`](../../frontend/scripts/playwright-carrier-sync-settings.mjs)
- [Environment-Variables](Environment-Variables)
