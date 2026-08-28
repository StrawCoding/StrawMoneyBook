# Pending Release Notes

- 載具同步模組化重建（smb307）：Android 權威路徑恢復 WebView 原生 Java；`CarrierSyncOrchestrator` / `CarrierProviderRegistry` / `NatGovEInvoiceProvider`（`providers/natgov` 分包）；Activity/Plugin 經 orchestrator 分派；captcha OCR 共用 `CaptchaSolver.validateCaptchaCandidate` + 半自動 UI；Web 保留 scrape fallback。

---

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
- 恢復模組化載具同步（Android WebView 原生 Java，`nat_gov_einvoice_tw`）：`CarrierAutomationPlugin` / `CarrierSyncOrchestrator`、共用 `CaptchaSolver.validateCaptchaCandidate`、Web 保留 Playwright scrape fallback。

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
