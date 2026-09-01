# 銀行同步 Architecture B

規格：`docs/audits/bank-sync-20260816/`（v1.1 + v1.1.1）。**合約已進碼**；下列是剩餘閘門，不要把 2026-08-16 的「Phase 1 not started」快照當現況。

## 階段狀態

| Phase | 狀態 |
|---|---|
| 0A 雙 key 測試 | DONE |
| 0B dual-key + lookback 3 日 | DONE（程式） |
| 1–5 凍結／華南 H0／registry／orchestrator／checkpoint | DONE |
| 6 provider-agnostic Runtime + `providers/huanan` 分包 | DONE（smb306：`BankAutomationRuntime` Phase 狀態機；禁第一銀行實作） |
| 7 遠端 provider tombstone | DONE |
| 8 錯誤／UX Playwright | 設定頁 suite 有；**已納入 CI**（正式 connect→map→sync→import service 路徑） |
| 9 華南 H1/H2 | **H2 表單合約已凍（2026-09-01）：`InqMain`／「明細」、`#acct1`、`inqtype`+民國年 `S_`/`E_` select、`doSubmit()`；結果表欄位仍以真機 ≥1 筆 trace 補強，解析失敗仍誠實 partial** |
| 10 刪 dual-write alias | PARTIAL |

合約：watermark = `coveredThrough`（不是 finish wall-clock）；`providerTransactionId` 方案版本化；dual-key 優先 `lastSyncAt` > `last_sync_at`。

**第一銀行**：已自產品面／provider registry／原生實作移除。不得註冊 `first_bank_tw`，不得還原 `FirstBankAutomation`。歷史稽核文件可保留「已移除」聲明，但本規格不再維護第一銀行 0C／巨石拆分章節。

## 真機閘（不得用 JVM 代替）

### 華南 H1/H2

H0 只凍登入頁。H1＝帳戶列表結構。H2 查詢**表單**已依 2026-09-01 真實 DOM 凍結：

- 入口：`a[href*="trx=com.lb.wibc.trx.InqMain"]`（`acct=` 對帳號）或文字精確「明細」；必要時先「帳務查詢」`InqAcctParent`
- 表單：`#acct1`、`inqtype`（1=今日／3=自訂）、`S_Year`/`S_Month`/`S_Date`、`E_*`（年 option value＝民國碼 `year-1911` 四位，如 2026→`0115`）、`ApplyType=0`、`doSubmit()`／`a[href*="doSubmit"]`
- 單次自訂區間 ≤3 個月；超過則切窗合併
- 結果：跨 frame 掃交易 table（略過表單控制表）；無列且非「查無資料」→ `hua_nan_transaction_query_partial`
- Network：仍 observe-only，**不** replay POST／GET

失敗碼：`hua_nan_account_list_not_found`＝尚未通過 H1；`hua_nan_transaction_query_failed` / `hua_nan_transaction_page_timeout`＝入口／ready／查詢逾時。**這些碼不是登入失敗，不得當成重新連結。**

證據模板：[`docs/audits/bank-sync-20260816/hua-nan-h1h2-evidence-template.md`](../audits/bank-sync-20260816/hua-nan-h1h2-evidence-template.md)。結果表 header／欄位對應仍建議補真機 ≥1 筆 trace。

H1 帳戶列表（缺一項不得標 H1 DONE）：

- 登入後落地 URL path（可含 `TrxDispatcher` 的 `trx` / `state` / `target`，去掉 session query）
- 可讀 frame 數 vs opaque（跨 origin）數；明細是否在 iframe
- 帳戶列的 **structural** 來源：`form[name/id]`、`trx=`、table `id/class`、hidden `account` 欄；中英文文案只當備援
- 帳號識別怎麼來（欄位名，不是掃頁面任意 8–16 位數字）
- 幣別／多帳戶列如何對應 `providerAccountId`

H2 交易查詢（表單已凍；結果列映射持續補強）：

- 穩定入口：`InqMain` + `acct=`（非只匹配「交易明細」長文案）
- 查詢表單：`inqtype` + 民國年 select、`doSubmit`、最大視窗 3 個月
- 結果：HTML table 跨 frame；空資料「查無資料」
- 至少 **一筆** 真實交易欄位對應：日期、金額、摘要、portal ref；identity 優先 `huanan:portal-ref:v1`，禁止餘額進 hash
- Network：POST 永不 replay；GET 仍 observe-only 直到 allowlist
- OTP／SSL／BHO 若需要 → `USER_INTERACTION_REQUIRED`

## Android-only

非 Android：支援矩陣 + recovery CTA，不要靜默 redirect。除錯 web 路徑不是生產同步。

## 模組邊界（smb306）

- `core/BankAutomationRuntime`：Phase 狀態機（WebView／Vault／trace 共用句柄）
- `core/BankProvider` + `BankProviderRegistry`：初始僅 `hua_nan_bank_tw`
- `core/CaptchaSolver` + `BankAutomationSyncContract` / `BankSyncContract`
- `providers/huanan/*`：華南專屬自動化（禁止根 package 巨石）

## 引用

- [Sync-Operations-Runbooks](Sync-Operations-Runbooks)
- [Android-Native-Bank-APK](Android-Native-Bank-APK)
- [`frontend/test/bank-sync-android-source.test.js`](../../frontend/test/bank-sync-android-source.test.js)
