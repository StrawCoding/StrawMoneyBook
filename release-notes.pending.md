# Pending Release Notes

---

## v1.5.8
- 同一張請款單可分次入帳，每次依本次金額 FIFO 回寫項目與來源，不必一次收完。

## v1.5.7
- 記帳計算機倒退鍵不再套用頁面返回 chevron，格子比例與數字鍵一致。

## v1.5.6
- 新增記帳頁（快速新增／AI／問答）顯示與首頁相同的品牌頂欄（logo + StrawMoneyBook）；BottomNav 仍隱藏，避免擋住計算機。

## v1.5.5
- 首頁問候與帳本切換收成一組；預算簡表拿掉金洗背景，改用一般卡片底，圓環與數字不變。

## v1.5.3
- 首頁期間改成頁面 chrome（大標＋箭頭＋pill），預算簡表上移到收支卡上面；FAB 仍記住上次記帳模式，快速新增改常駐鍵盤（再記／完成在鍵盤列）。

## v1.5.2
- 預算顯示與設定拆開：`/budget` 用月曆看每日預算支出與分類總表（含 Icon），設定改到 `/budget/settings`。發薪週期月曆會淡化本期以外的日子。

## v1.5.1
- 對齊已移除的第一銀行合約自檢：runner／測試不再 import 缺失腳本，排程合約檢查只跑載具 portal。
- CI：frontend Node 與 Android SDK 分開；Setup Android SDK 不再安裝已廢棄 `tools`；銀行 Playwright 會安裝 Chromium；發薪週期 source contract 改查 `BudgetDailyStatsTable`。
- Capacitor Android／core／cli 升到 8.5.3（GHSA-rvm3-566m-v7fv）；Vue 升到 3.5.44（GHSA-g2v6-rqmx-r4w6）；nodemailer 升到 10.x；`tar` override 到 7.5.22。
- 遠端銀行 scrape smoke 改預期 501 `provider_not_supported`。
- 還原 `release-notes.pending.md` 歷史；`notes:clear` 只清 pending、不得砍 archive。

## v1.5.0
- 記帳成功（AI 自動儲存／手動快速新增／問答記帳）一律返回首頁並還原離開前捲動，不再導向交易編輯頁，也不再可能停在功能頁。
- 傳統／現代雙介面；現代改 Straw Habitat 生活色域。
- 預算支援發薪週期切換、共同池滾動日均與本期逐日統計。
- 華南銀行同步與電子發票載具同步改 Android 原生模組化路徑。
- Drive／JSON 還原閘門強化，避免不可匯入備份清空本機資料。
- 分析分類明細改 SQL 彙總；Error Log 必帶錯誤碼。

## v1.4.23
- AI／手動記帳共用寫入：未輸入金額前端攔截、信用卡／關帳／應計錯誤改可讀文案；AI 成功後保留交易 ID 導向編輯頁，不再清掉後誤以為沒存入；記帳頁載入帳戶／分類、儲存列避開系統導覽列。**Play 須更新 AAB/APK**。

## v1.4.22
- 快速記帳：未輸入金額（仍為 0 且無附加項目）時前端即提示，避免 Play 版按儲存只出「新增失敗」；金額計算機在 0 元時視覺提示；信用卡／關帳帳單等後端錯誤改為可讀 i18n；問答記帳共用 `bookkeeping-submit-error`。
- 預算頁：本期逐日預算／已花／差額與累計表（`BudgetDailyStatsTable`，含滾動共同池日均）。
- 華南銀行同步：InqMain 帳號 href 探測、交易表依表頭解析民國日期與支出／存入欄。**Play 安裝版須更新 AAB/APK 才含記帳與華南原生修復**。

## v1.4.21
- Drive 還原：匯入 gate 補齊 migration 046 銀行同步欄位；預覽失敗時顯示具體 gate 原因（非僅通用文案）。**Play 安裝版須更新 AAB 才含修復**（Web 版隨 `/app/` 部署）。

## v1.4.20
- Drive／JSON 匯入 gate：`budget_containers.surplus_mode` 納入備份 schema 合約，含 v1.4.19+ 共同池滾動日均備份可還原，不再誤判「不存在的欄位」而中止。

## v1.4.19
- 共同預算池滾動日均：月池／日池今日可花 = 剩餘 ÷ 剩餘天數；超支縮減後續日均、有剩加回池。池設定可選「滾動回池」或「轉存錢罐」（互斥）。
- 華南銀行同步 H2 凍合約：明細入口改 `InqMain`／「明細」、表單用 `#acct1`+`inqtype`+民國年 select、`doSubmit()`；超過 3 個月自動切窗；跨 frame 解析交易表並略過表單控制表。
- Error Log 必帶 error code：本機 buffer／上傳 payload 經 `resolveErrorLogCode`（顯式碼 → taxonomy → 來源 fallback）保證非空；Debug 頁一律顯示錯誤碼；後端 `/api/client-logs` 缺碼預設 `unknown_error`。

## v1.4.15
- 載具同步模組化重建（smb307）：Android 權威路徑恢復 WebView 原生 Java；`CarrierSyncOrchestrator` / `CarrierProviderRegistry` / `NatGovEInvoiceProvider`（`providers/natgov` 分包）；Activity/Plugin 經 orchestrator 分派；captcha OCR 共用 `CaptchaSolver.validateCaptchaCandidate` + 半自動 UI；Web 保留 scrape fallback。
- 載具同步 Playwright 正式流程（smb307 驗收補齊）：憑證→sync→captcha 半自動→待審核→import ledger（對齊 smb306 銀行 sync 核准標準）；Web preview 經 orchestrator test fixtures 走真實 service+DB 路徑；import 修正 `origin_type=import` 以通過 transactions CHECK。

## v1.4.14
- 銀行同步驗收補齊（smb306）：Playwright 改走真實 UI（建立連線表單→帳戶對應→手動同步→待匯入勾選匯入→交易搜尋 ledger）；`BankAutomationRuntime` 於 connect 先 `markSuccess` 再 snapshot、sync 進入 `SYNCING_TRANSACTIONS`、captcha/abort 同一狀態機；移除 DebugTrace 第一銀行殘留診斷文案。
- 銀行同步 Playwright 預覽治本：預設埠改 4226、佔用即失敗，避免掛到殘留／外國 `vite preview` 造成「hua nan provider required」假陰性。

## v1.4.9
- Playwright ui-layout：session 被 reaper 關閉時以 `lastOpenedUrl` reopen 重試，不再於 reopen 中途跑 onboarding（避免 welcome 假失敗）。

## v1.4.12（pending — smb306）
- 銀行同步模組化恢復（僅華南）：`BankAutomationRuntime` Phase 狀態機、`providers/huanan` 分包、H1 結構錨點、PARTIAL watermark 治本、Captcha JVM 真 OCR、Playwright 正式 connect→map→sync→import（含 ledger）、文件／i18n 移除第一銀行產品面。

## v1.4.7
- 分析分類明細「全部」改 SQL 依分類／附加項目載入列資料與類型合計，不再 `listAllTransactionsChunked` 後在主執行緒篩選。
- 啟動鏈 FontAwesome 改獨立 `fa-icon-registry` 動態註冊，`main.js` 不再靜態 import 全量 icon。
- 恢復模組化銀行同步（僅華南、不含第一銀行）：provider-agnostic `CaptchaSolver` / `BankSyncContract`、功能頁進階入口、Playwright 與 Node 測試。

## v1.4.6
- 現代 Habitat 視覺重做：拿掉金漆滿版按鈕、泥色卡片與底欄光暈；改色島層次、柔和選取態與功能牆磁磚。傳統 Apple HIG 不變。

## v1.4.5
- 恢復傳統／現代雙介面風格：傳統維持現行 Apple HIG 清單分組；現代改為 Straw Habitat 生活色域（圓滑色島、分區色彩、A/B/C/D 主題全留）。5 tab、FAB、首頁區塊不刪。

## v1.4.4
- 修復會員登入「已過期／需重新登入」：refresh 已 rotate 但客戶端逾時時，60 秒內重放舊 token 改走 family head 再續發，不再誤判 reuse；grace 外真 reuse 會先 commit family revoke 再丟錯（避免 SQLite throw 回滾）。前端忽略過期的 refresh 回應。

## v1.4.2
- 全螢幕記帳頁（快速新增／AI／問答）與其他 hideAppChrome 頁恢復與一般頁等價的頂部 status-bar／safe-area 預留；BottomNav 與品牌頂欄仍隱藏。

## v1.4.1
- 全產品優化方案與官方 Wiki（https://strawcoding.github.io/StrawMoneyBookWiki/ Operations）；分析頁改 SQL 彙總避免「全部」全量載入；預算頁本體可切換曆月／發薪週期；長表單隱藏 BottomNav；載具 API 設定不再因 PROD／native 假陽性；銀行同步 Playwright 納入 CI；交易列表啟用 content-visibility 虛擬化。
