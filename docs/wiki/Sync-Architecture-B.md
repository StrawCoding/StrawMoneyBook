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

H0 只凍登入頁。H1＝帳戶列表結構、H2＝至少一筆交易 DOM／JSON。沒有真實登入證據前，禁止把 heuristic 寫成已凍合約。Phase 9 維持 **PARTIAL**。

失敗碼：`hua_nan_account_list_not_found`＝尚未通過 H1；`hua_nan_transaction_query_failed` / `hua_nan_transaction_page_timeout`＝尚未通過 H2（入口找不到、查詢頁沒 ready、或點查詢後 12 秒無 table／空資料文案）。**這些碼不是登入失敗，不得當成重新連結。** Phase A 只做去識別化 `h1_probe` / `h2_probe` + hncb observe-only intercept（含 GET 也不 replay），**不宣稱已修好查詢失敗。**

證據模板：[`docs/audits/bank-sync-20260816/hua-nan-h1h2-evidence-template.md`](../audits/bank-sync-20260816/hua-nan-h1h2-evidence-template.md)。每一項都要有真機 trace 欄位，不能只靠 JVM。

H1 帳戶列表（缺一項不得標 H1 DONE）：

- 登入後落地 URL path（可含 `TrxDispatcher` 的 `trx` / `state` / `target`，去掉 session query）
- 可讀 frame 數 vs opaque（跨 origin）數；明細是否在 iframe
- 帳戶列的 **structural** 來源：`form[name/id]`、`trx=`、table `id/class`、hidden `account` 欄；中英文文案只當備援
- 帳號識別怎麼來（欄位名，不是掃頁面任意 8–16 位數字）
- 幣別／多帳戶列如何對應 `providerAccountId`

H2 交易查詢（缺一項不得標 H2 DONE）：

- 從帳戶列進「明細」的穩定入口（function / href / `trx=`），不是只匹配「交易明細」文字
- 查詢表單：起迄日 `name/id`、送出按鈕、日期格式、最大視窗
- 結果：HTML table 的 header／`id/class`，**或** JSON／XHR 的 method + path pattern
- 空資料文案（「查無資料」是否真的出現在 `document.body`，還是只在 iframe／alert）
- 至少 **一筆** 真實交易的欄位對應：日期、金額、摘要、portal ref／序號；identity 優先 `huanan:portal-ref:v1`，禁止把餘額寫進 hash
- Network：GET vs POST 次數；**POST 永不 replay**；Phase A 連 GET 也不 replay，直到有 allowlist
- 查詢是否需要 OTP／SSL／BHO（H0 標 NOT VERIFIED）；若需要則能力改 `USER_INTERACTION_REQUIRED`，不能假裝 silent sync

## Android-only

非 Android：支援矩陣 + recovery CTA，不要靜默 redirect。除錯 web 路徑不是生產同步。

## 引用

- [Sync-Operations-Runbooks](Sync-Operations-Runbooks)
- [Android-Native-Bank-APK](Android-Native-Bank-APK)
- [`frontend/test/bank-sync-android-source.test.js`](../../frontend/test/bank-sync-android-source.test.js)
