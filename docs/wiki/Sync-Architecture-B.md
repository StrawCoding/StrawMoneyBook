# 銀行同步 Architecture B

規格：`docs/audits/bank-sync-20260816/`（v1.1 + v1.1.1）。**合約已進碼**；下列是剩餘閘門，不要把 2026-08-16 的「Phase 1 not started」快照當現況。

## 階段狀態

| Phase | 狀態 |
|---|---|
| 0A 雙 key 測試 | DONE |
| 0B dual-key + lookback 3 日 | DONE（程式） |
| 0C 第一銀行增量真機 | **PARTIAL：需重建 APK 真機證明 overlap-only** |
| 1–5 凍結／華南 H0／registry／orchestrator／checkpoint | DONE |
| 6 拆 FirstBank 巨石 | INCREMENTAL |
| 7 遠端 provider tombstone | DONE |
| 8 錯誤／UX Playwright | 設定頁 suite 有；**已納入 CI** |
| 9 華南 H1/H2 | **PARTIAL：post-login 仍 heuristic** |
| 10 刪 dual-write alias | PARTIAL |

合約：watermark = `coveredThrough`（不是 finish wall-clock）；`providerTransactionId` 方案版本化；dual-key 優先 `lastSyncAt` > `last_sync_at`。

## 真機閘（不得用 JVM 代替）

### 第一銀行 0C

見 [Android-Native-Bank-APK](Android-Native-Bank-APK)。證據：第二次同步 query 窗、versionName、裝置。

### 華南 H1/H2

H0 只凍登入頁。H1＝帳戶列表結構、H2＝至少一筆交易 DOM／JSON。沒有真實登入證據前，禁止把 heuristic 寫成已凍合約。失敗碼 `hua_nan_account_list_not_found` 代表尚未通過 H1。

## Android-only

非 Android：支援矩陣 + recovery CTA，不要靜默 redirect。除錯 web 路徑不是生產同步。

## 引用

- [Sync-Operations-Runbooks](Sync-Operations-Runbooks)
- [Android-Native-Bank-APK](Android-Native-Bank-APK)
- [`frontend/test/bank-sync-android-source.test.js`](../../frontend/test/bank-sync-android-source.test.js)
