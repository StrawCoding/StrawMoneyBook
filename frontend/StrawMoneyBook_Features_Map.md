# StrawMoneyBook 功能與檔案對應

此文件整理目前 StrawMoneyBook 的主要功能、頁面、元件與資料層對應關係，方便開發與維護。
詳細產品說明請搭配 `../StrawMoneyBook_App_Features_Detailed.md` 閱讀；該檔已統整為唯一版本。

## 1. 功能總覽

- 多帳本管理（切換帳本、排序、帳本設定、活動帳本上下文刷新）
- 首頁總覽（帳本切換、收支卡、預算簡表、交易流、浮動快速新增）
- 記帳三模式（AI 記帳、手動快速新增、問答記帳）
- 交易查詢（搜尋頁、日曆頁、交易明細頁、交易編輯頁）
- 退款流程（交易明細可建立退款、選擇退款帳戶、退款與原交易自動排除預算 / 收支統計）
- 預算管理（月預算、分類預算、日均規則、已用/剩餘/保留金額、預算剩餘自動存入存錢罐）
- 分析與報表（收入/支出圖表、分類/帳戶明細、CSV 匯出、列印 / PDF 版面）
- 資產管理（帳戶餘額、帳戶群組、總資產 / 可支配 / 負債、群組內金額摘要）
- 借貸管理（借出 / 借入、還款、作廢、往來對象明細）
- 借貸建立後可於借貸明細變更「建立入帳帳戶」，會直接修正該筆初始借入 / 借出交易的帳戶歸屬
- 報銷與請款管理（可報銷交易、代收抵扣、請款單建立 / 完成 / 匯出；完成請款單會讓匯入報銷項目回到已報銷狀態，不再留在未報銷；還原後重新完成不會因舊入帳交易冪等鍵撞唯一鍵）
- 存錢罐、訂閱追蹤與自動存提
- 訂閱追蹤的扣款日以當天開始為扣款時間點；進入扣款日後仍可標示本期已到期，但「下次扣款」會直接推進到下一個週期，且排程日期以 App 預設時區正規化，避免 UTC / CI 環境把台北時間午夜誤判成前一天；App 開啟 / 回前景 / 帳本切換與儲存訂閱後會對今日到期項目建立冪等支出交易
- AI 自動記帳（文字解析、語音輸入、會員次數限制）
- AI 自動記帳支援金額加減公式且不會誤改交易日期，也不會把算式符號殘留進備註（例如 `120+20`、`120-20`）
- AI 語音再解析若沒有辨識出新的備註內容，會保留目前表單中的既有備註
- 帳號系統（Email / Google 登入、個人資料、忘記密碼、臨時密碼、登出）
- 共同帳本（建立共同帳本、共享連結、Email 邀請、接受邀請、同步）
- Google Drive 帳本同步（逐帳本啟用、跨裝置 pull / push）
- 自動備份（Google Drive / WebDAV；背景自動偵測 / 自動備份完成後，設定頁會即時同步最近一次 auto-check 狀態與時間）
- 記帳提醒與成就表（每日固定提醒、通知權限 / 精準提醒狀態、連續記帳天數、最長連續與累計記帳日）
- 會員邀請碼（邀請者 +7 天、被邀請者 +3 天，需先登入且不可重複邀請）
- 設定功能（資料管理、自動備份、帳本同步、匯率、自動識別、安全鎖、語言、會員、帳號、共同帳本）
- 關於與聯絡入口（官網、Facebook、Instagram、Threads、Email、隱私權政策）
- 官方網站 SEO / 品牌搜尋關鍵字（`../StrawMoneyBookWeb/index.html`：`StrawMoneyBook`、`稻草AI記帳`、`稻草記帳`、`AI記帳`、`對話記帳`、`自動記帳` 等）
- 官方網站 UI / UX 目前已收斂為共用 design tokens + 雙主題 header / page shell；首頁改為 icon / symbol 導向的掃讀式結構，首屏先聚焦單一句產品定位，再依序呈現 3 個重點、4 個主要場景與下載 / 預先體驗 CTA；手機導覽改為折疊選單，桌機保留精簡錨點導覽
- 官網次頁目前與首頁維持一致視覺語言：`/preview` 先說明預先體驗價值再提供外開表單與內嵌 iframe；共同帳本邀請頁保留 deep link / Play Store fallback 邏輯但改用統一介面；服務條款與隱私權政策改用同一套 legal document shell
- 銀行同步（頁面與流程存在，受 feature flag、API 設定與會員資格控制）
- 電子發票載具（公開但標示為實驗性；Android 優先的端內登入流程，App 會在原生 WebView 內載入登入頁與圖形驗證碼，再由使用者手動輸入驗證碼完成登入、查詢與同步，並把憑證 / storage state 加密保存在本機；Web 僅提供診斷與說明，不再承諾可新增、重新驗證或同步載具；若站點流程阻擋自動化，狀態會明確標示為 `automation_blocked` 或 `reauth_required`，不會偽裝成成功）
- Android 原生能力（首頁小工具、安全鎖、Google Identity、語音輸入、銀行自動化、電子發票載具自動化；CI 發版流程已確保 `frontend/android/gradlew` 具備可執行權限，避免 `bundleRelease` 在 checkout 後直接失敗）

## 2. 路由與頁面對應

路由定義檔：`src/ui/router/index.js`
以下表格列出主要路由與重要 redirect / 進階頁（非完整清單）。

| 路由 | 頁面檔案 | 主要用途 |
|---|---|---|
| `/open/shared-ledger` | redirect -> `/settings/shared-ledgers` | App URL 開啟共同帳本連結 |
| `/shared-ledger/join` | redirect -> `/settings/shared-ledgers` | 共同帳本加入連結兼容入口 |
| `/` | `src/ui/views/home.vue` | 首頁總覽、範圍篩選、快速新增 |
| `/budget` | `src/ui/views/budgeting.vue` | 月預算、分類預算與預算存款管理 |
| `/analysis` | `src/ui/views/analysis.vue` | 收支圖表分析（全部/年/月） |
| `/analysis/category` | `src/ui/views/AnalysisCategoryDetailPage.vue` | 分類分析明細 |
| `/analysis/print` | `src/ui/views/AnalysisPrintPage.vue` | 交易報表頁（CSV 匯出 + 列印 / PDF 版面） |
| `/transactions/search` | `src/ui/views/TransactionSearchPage.vue` | 交易搜尋（支援批量選取與批量編輯分類 / 備註 / 可報銷 / 預算 / 收支分析） |
| `/transactions/quick-add` | `src/ui/views/BookkeepingPage.vue` | 手動快速新增模式（內嵌 `QuickAddPage.vue`） |
| `/transactions/qna` | `src/ui/views/BookkeepingPage.vue` | 問答記帳模式（內嵌 `QnaBookkeepingPage.vue`） |
| `/transactions/calendar` | `src/ui/views/CalendarPage.vue` | 交易日曆 |
| `/transactions/:id` | `src/ui/views/TransactionAboutPage.vue` | 交易明細（含退款/關聯） |
| `/transactions/:id/edit` | `src/ui/views/TransactionEditPage.vue` | 交易編輯 |
| `/features` | `src/ui/views/FeatureListPage.vue` | 功能列表入口頁 |
| `/welcome/intro` | `src/ui/views/PostSetupIntroPage.vue` | 初始設定後導覽頁 |
| `/ai-auto-bookkeeping` | `src/ui/views/BookkeepingPage.vue` | AI 記帳模式（內嵌 `AiAutoBookkeepingPage.vue`） |
| `/assets` | `src/ui/views/assets.vue` | 資產總覽 |
| `/icons/pick` | `src/ui/views/IconPickerPage.vue` | 帳戶/分類 icon 選擇 |
| `/assets/accounts` | `src/ui/views/accounts/AssetAccountManagementPage.vue` | 資產帳戶管理 |
| `/assets/account-groups/:id` | `src/ui/views/accounts/AssetAccountGroupDetailPage.vue` | 帳戶群組管理 |
| `/accounts/:id` | `src/ui/views/accounts/AccountDetailPage.vue` | 帳戶明細 |
| `/loans` | `src/ui/views/loans/LoanListPage.vue` | 借貸清單 |
| `/loans/counterparty` | `src/ui/views/loans/LoanCounterpartyDetailPage.vue` | 依往來對象檢視借貸明細 |
| `/loans/:id` | `src/ui/views/loans/LoanDetailPage.vue` | 借貸明細 |
| `/reimbursements` | `src/ui/views/reimbursements/ReimbursementListPage.vue` | 報銷清單 |
| `/reimbursements/advances` | `src/ui/views/reimbursements/ReimbursementAdvanceManagementPage.vue` | 代收 / 預支款管理 |
| `/reimbursements/advance-usages` | `src/ui/views/reimbursements/ReimbursementAdvanceUsageManagementPage.vue` | 代收 / 預支抵扣紀錄 |
| `/reimbursements/:id/edit` | `src/ui/views/reimbursements/ReimbursementEditPage.vue` | 報銷明細編輯/入帳 |
| `/reimbursements/:id/offsets` | `src/ui/views/reimbursements/ReimbursementOffsetAboutPage.vue` | 報銷抵扣說明 / 明細 |
| `/claim-sheets` | `src/ui/views/claims/ClaimSheetListPage.vue` | 請款單清單與匯出 |
| `/claim-sheets/:id` | `src/ui/views/claims/ClaimSheetDetailPage.vue` | 請款單明細 |
| `/claim-sheets/:id/edit` | `src/ui/views/claims/ClaimSheetEditPage.vue` | 請款單編輯 |
| `/savings-jars` | `src/ui/views/savings-jars/SavingsJarListPage.vue` | 存錢罐管理 |
| `/subscriptions` | `src/ui/views/subscriptions/SubscriptionListPage.vue` | 訂閱追蹤 |
| `/settings` | `src/ui/views/settings.vue` | 設定首頁 |
| `/settings/account` | `src/ui/views/settings/SettingsAccountPage.vue` | 帳號登入 / 註冊、個人資料、推薦碼、忘記密碼、Google 綁定、登出 |
| `/settings/data-management` | `src/ui/views/settings/SettingsDataManagementPage.vue` | 匯入/匯出/重設 |
| `/settings/auto-backup` | `src/ui/views/settings/SettingsAutoBackupPage.vue` | Google / WebDAV 自動備份 |
| `/settings/google-drive-ledger-sync` | `src/ui/views/settings/SettingsGoogleDriveLedgerSyncPage.vue` | Google Drive 帳本同步 |
| `/settings/exchange-rate` | `src/ui/views/settings/SettingsExchangeRatePage.vue` | 匯率同步 |
| `/settings/bookkeeping-reminder` | `src/ui/views/settings/SettingsBookkeepingReminderPage.vue` | 每日記帳提醒與連續記帳成就表 |
| `/settings/bank-sync` | `src/ui/views/settings/SettingsBankSyncPage.vue` | 銀行同步管理 |
| `/settings/bank-sync/new` | `src/ui/views/settings/SettingsBankSyncCreatePage.vue` | 新增銀行連線 |
| `/settings/bank-sync/:id` | `src/ui/views/settings/SettingsBankSyncConnectionPage.vue` | 單一銀行連線設定 / 狀態 |
| `/settings/invoice-carrier` | `src/ui/views/settings/SettingsInvoiceCarrierPage.vue` | 電子發票載具管理（公開入口，實驗性） |
| `/settings/invoice-carrier/new` | `src/ui/views/settings/SettingsInvoiceCarrierCreatePage.vue` | 新增 / 重新驗證電子發票載具（Android 端內自動化；Web 顯示診斷） |
| `/settings/invoice-carrier/:id` | `src/ui/views/settings/SettingsInvoiceCarrierConnectionPage.vue` | 單一載具詳情 / 同步 / 發票匯入 / 重新驗證提示（非 Android 僅顯示診斷） |
| `/settings/ledgers` | `src/ui/views/settings/SettingsLedgerPage.vue` | 帳本管理 |
| `/settings/shared-ledgers` | `src/ui/views/settings/SettingsSharedLedgerPage.vue` | 共同帳本、Email 邀請、接受邀請與同步 |
| `/settings/ledgers/:id` | `src/ui/views/settings/SettingsLedgerDetailPage.vue` | 帳本明細編輯/刪除 |
| `/settings/categories` | `src/ui/views/settings/SettingsCategoryPage.vue` | 分類管理 |
| `/settings/categories/:id` | `src/ui/views/settings/SettingsCategoryDetailPage.vue` | 分類明細編輯/刪除 |
| `/settings/category-groups/:id` | `src/ui/views/settings/SettingsCategoryGroupDetailPage.vue` | 分類群組排序/刪除 |
| `/settings/auto-fill-rules` | `src/ui/views/settings/SettingsAutoFillRulesPage.vue` | 自動識別規則 |
| `/settings/auto-fill-rules/new` | `src/ui/views/settings/SettingsAutoFillRuleEditPage.vue` | 建立自動識別規則 |
| `/settings/auto-fill-rules/:id` | `src/ui/views/settings/SettingsAutoFillRuleEditPage.vue` | 編輯自動識別規則 |
| `/settings/addon-templates` | `src/ui/views/settings/SettingsAddonTemplatePage.vue` | 附加項目模板 |
| `/settings/personalization` | `src/ui/views/settings/SettingsPersonalizationPage.vue` | 主題與個人化 |
| `/settings/language` | `src/ui/views/settings/SettingsLanguagePage.vue` | 語言設定 |
| `/settings/security` | `src/ui/views/settings/SettingsSecurityPage.vue` | 安全鎖 |
| `/settings/membership-benefits` | `src/ui/views/settings/SettingsMembershipBenefitsPage.vue` | 會員權益 |
| `/settings/admin` | `src/ui/views/settings/SettingsAdminPage.vue` | 管理員儀表板 |
| `/settings/admin/users/:id` | `src/ui/views/settings/SettingsAdminMemberPage.vue` | 管理員會員 / 使用者詳細頁 |
| `/settings/about` | `src/ui/views/settings/SettingsAboutPage.vue` | 關於我們、聯絡資訊與社群入口 |
| `/settings/version-info` | `src/ui/views/settings/SettingsVersionInfoPage.vue` | 版本資訊 |
| `/settings/developer-debug` | `src/ui/views/settings/SettingsDeveloperDebugPage.vue` | 開發除錯資訊頁 |

## 2.1 主要導覽流程

### 底部導覽（`src/ui/components/layout/BottomNav.vue`）

- 首頁：`/`
- 分析：`/analysis`
- 資產：`/assets`
- 設定：`/settings`

### 首頁內導覽（`src/ui/views/home.vue`）

- 快速新增：導向「上次使用的記帳模式」；首次預設 `/transactions/quick-add`
- 功能列表：`/features`
- 交易搜尋：`/transactions/search`
- 分析頁：`/analysis`

### 設定內導覽（`src/ui/views/settings.vue`）

- 帳號卡片：`/settings/account`（顯示頭貼、名稱、帳號；未登入時導向登入 / 註冊）
- 帳本管理：`/settings/ledgers`
- 共同帳本：`/settings/shared-ledgers`
- 分類管理：`/settings/categories`
- 附加項目：`/settings/addon-templates`
- 自動識別：`/settings/auto-fill-rules`
- 匯率同步：`/settings/exchange-rate`
- 資料管理：`/settings/data-management`
- 自動備份：`/settings/auto-backup`
- 帳本同步：`/settings/google-drive-ledger-sync`
- 語言：`/settings/language`
- 個人化：`/settings/personalization`
- 安全鎖：`/settings/security`
- 記帳提醒：`/settings/bookkeeping-reminder`
- 會員權益：`/settings/membership-benefits`
- 管理員平台：`/settings/admin`（僅管理員顯示）
- 關於我們：`/settings/about`
- 關於我們頁內含官網、Facebook、Instagram、Threads、Email、隱私權政策入口
- 版本資訊：`/settings/version-info`
- 銀行同步：`/settings/bank-sync`（入口改由 `isBankSyncFeatureEnabled()` 控制；目前預設恢復為 mock/sandbox 流程）
- 電子發票載具：`/settings/invoice-carrier`（公開入口，標示實驗性；新增載具會導向 `/settings/invoice-carrier/new`；Android App 透過 `InvoiceCarrierAutomation` 原生 WebView plugin 載入圖形驗證碼圖片並由使用者手動輸入後完成登入 / 同步，且 native BrowserSession 會將 WebView client、頁面載入、腳本執行與 cookie 操作統一切回 main thread；Web 僅保留設定入口、診斷與說明，不再走 `/api/invoice` 的正式產品流程）
- 開發除錯：`/settings/developer-debug`（目前不在設定入口清單）

### 功能列表導覽（`src/ui/views/FeatureListPage.vue`）

- 帳本同步：`/settings/google-drive-ledger-sync`
- 電子發票載具（實驗性）：`/settings/invoice-carrier`
- 借貸：`/loans`
- 報銷：`/reimbursements`
- 請款單：`/claim-sheets`
- 存錢罐：`/savings-jars`
- 訂閱：`/subscriptions`
- 交易搜尋：`/transactions/search`

### 資產與分類導覽

- 資產頁管理入口：`/assets` -> `/assets/accounts`
- 帳戶群組明細：`/assets/accounts` -> `/assets/account-groups/:id`
- 帳戶明細：`/assets` 或 `/assets/accounts` -> `/accounts/:id`
- 分類/帳戶 icon 選擇：`/settings/categories` 或 `/assets/accounts` -> `/icons/pick`

## 3. 首頁功能對應

頁面檔案：`src/ui/views/home.vue`

| 功能 | 主要檔案 |
|---|---|
| 帳本切換 | `src/ui/components/common/LedgerSwitcher.vue` |
| 範圍選擇（全部/年/月/日） | `src/ui/components/common/HomeRangePicker.vue` |
| 當期收支卡 | `src/ui/components/home/HomeAssetSummaryCard.vue` |
| 預算簡表（月均/日均 + 左右滑動切換） | `src/ui/components/home/HomeBudgetSummaryCard.vue` |
| 交易清單 | `src/ui/components/home/HomeTransactionFeed.vue` |
| 編輯交易 | `src/ui/components/home/HomeTransactionEditSheet.vue` |
| 快速新增入口 | `src/ui/views/BookkeepingPage.vue` + `src/ui/services/bookkeeping-mode.service.js` |
| 手動快速新增 | `src/ui/views/QuickAddPage.vue` |
| 問答記帳 | `src/ui/views/QnaBookkeepingPage.vue` |
| AI 記帳 | `src/ui/views/AiAutoBookkeepingPage.vue` |
| 快速新增附加資訊（備註/報銷/附加項目） | `src/ui/views/QuickAddPage.vue` |
| 日期時間選擇 | `src/ui/components/common/DateTimePickerField.vue` |
| 純時間選擇 | `src/ui/components/common/TimePickerField.vue` |
| 共用輸入型 sheet 殼層 | `src/ui/components/common/InputBottomSheet.vue` |
| 交易搜尋頁（支援批量編輯分類、備註、可報銷、是否納入預算 / 收支分析） | `src/ui/views/TransactionSearchPage.vue` |
| 交易日曆頁 | `src/ui/views/CalendarPage.vue` |
| 功能列表頁 | `src/ui/views/FeatureListPage.vue` |
| 交易明細退款流程（選擇退款帳戶、避免重複退款） | `src/ui/views/TransactionAboutPage.vue` + `src/core/services/transaction.service.js` |
| 交易搜尋頁狀態協調（filter、批量選取、sheet、摘要） | `src/ui/composables/useTransactionSearchPage.js` |

## 4. 分析頁功能對應

頁面檔案：`src/ui/views/analysis.vue`

| 功能 | 主要邏輯來源 |
|---|---|
| mode 切換（全部/年/月） | `analysis.vue` 內部 state + `src/core/services/transaction-query.service.js` |
| 收入圓餅圖 | `analysis.vue` + `src/core/utils/analysis-breakdown.js`（分類彙總 + 色盤） |
| 支出圓餅圖 | `analysis.vue` + `src/core/utils/analysis-breakdown.js`（分類彙總 + 色盤） |
| 帳戶分析（總額/收入/支出） | `analysis.vue` + `src/core/utils/analysis-breakdown.js`（帳戶彙總 + 色盤） |
| 分類明細頁 | `analysis.vue` -> `/analysis/category` + `AnalysisCategoryDetailPage.vue` + `src/core/services/transaction-query.service.js` |
| 右上角列印按鈕 | `analysis.vue` -> `/analysis/print` |
| AI 分析頁 | 已移除（不再提供 `/analysis/ai` 路由） |
| 交易 CSV 匯出 | `src/ui/views/AnalysisPrintPage.vue` + `src/core/services/export.service.js` |
| 列印 / PDF 版面 | `src/ui/views/AnalysisPrintPage.vue`（`print-only` 報表區塊） |
| 匯出範圍 | `AnalysisPrintPage.vue`（全部/年/月/日/自訂） |

## 5. 導覽與全域 UI

| 功能 | 檔案 |
|---|---|
| App Shell / Router View | `src/ui/App.vue` + `src/ui/composables/useAppShellRuntime.js` |
| Welcome / allowWithoutSetup 入口控制 | `src/ui/App.vue` + `src/ui/views/WelcomePage.vue` |
| 首次設定完成導覽 | `src/ui/views/PostSetupIntroPage.vue` + `src/ui/services/post-setup-intro.service.js` |
| 初始 setup 判斷 | `src/ui/services/setup-flow.service.js` |
| 啟動鏈（Pinia/store 初始化、core bootstrap、首次 setup 導向） | `src/main.js` + `src/ui/services/app-bootstrap.service.js` + `src/core/services/bootstrap.service.js` |
| 啟動時背景 Google 靜默登入、同步/備份排程、Android back、網址恢復 | `src/ui/services/app-runtime.service.js` + `src/services/google/auth.js` |
| 安全鎖遮罩與前景驗證 | `src/ui/composables/useAppShellRuntime.js` + `src/ui/services/security-lock.service.js` |
| Deep link / App URL 導向 | `src/ui/services/app-url-route.js` |
| 路由捲動復原 | `src/ui/services/route-scroll.service.js` |
| 底部導覽列 | `src/ui/components/layout/BottomNav.vue` |
| App 內返回與 fallback 邏輯 | `src/ui/services/navigation-back.service.js` |
| 同頁 query 狀態切換的穩定 route transition key（如借貸清單 / 往來對象明細切換進行中與已結束時不重跑整頁切換動畫） | `src/ui/router/index.js` + `src/ui/composables/useAppShellRuntime.js` |
| Toast 訊息 | `src/ui/components/common/ToastHost.vue` |
| 輸入型彈層一致性（dialog / select / 帳本切換 / 區間切換 / 日期與時間選擇器共用 shared bottom-sheet primitives，含 Android 底部 safe area，sheet 背景延伸到底部並對齊 `BottomNav` 基準） | `src/ui/components/common/InputBottomSheet.vue` + `src/ui/components/common/AppDialog.vue` + `src/ui/components/common/CustomSelect.vue` + `src/ui/components/common/LedgerSwitcher.vue` + `src/ui/components/common/HomeRangePicker.vue` + `src/ui/components/common/DateTimePickerField.vue` + `src/ui/components/common/TimePickerField.vue` |
| 全域錯誤上報 | `src/ui/services/error-log.service.js` |
| 全域樣式與動畫 | `src/ui/assets/css/global.css` |
| 入口、plugin 註冊與 runtime 掛載 | `src/main.js` |

## 6. Store（UI 狀態層）對應

目錄：`src/ui/stores/`

| Store | 主要職責 |
|---|---|
| `ledger.store.js` | 活動帳本、帳本切換、帳本 CRUD；跨 store reset / reload / integrity repair 已轉移到 `src/ui/services/ledger-runtime.service.js` |
| `account.store.js` | 帳戶清單與餘額 |
| `category.store.js` | 分類清單、群組、二級分類資料 |
| `transaction.store.js` | 交易載入、新增、更新、刪除、首頁篩選與關聯刷新 |
| `budget.store.js` | 月預算、預算項目、保留金額、整月預算存款設定與補跑偏好 |
| `loan.store.js` | 借貸清單、還款、作廢、明細 |
| `reimbursement.store.js` | 報銷列表與報銷狀態處理；已完成請款單匯入項目會透過 `reimbursed_minor` 分入已報銷 |
| `addon-template.store.js` | 附加項目模板讀取與快取 |
| `ui.store.js` | 全域 UI 狀態（Toast 等） |

## 7. Service（業務邏輯層）對應

核心目錄：`src/core/services/`

| Service | 功能 |
|---|---|
| `bootstrap.service.js` | 啟動時資料庫初始化、schema recover 與 DB bootstrap；不再直接碰 UI stores |
| `transaction.service.js` | 收入/支出/轉帳/退款建立、退款帳戶驗證、編輯驗證、刪除關聯交易（報銷/退款） |
| `transaction-query.service.js` | 統一 `all / year / month / day / account / detail-related` 交易查詢策略，供分析、搜尋、日曆、交易明細、交易編輯與帳戶明細共用 |
| `budget.service.js` | 預算快照、預算存款設定驗證、複製上月預算 |
| `budget-reserve.service.js` | 依帳本月份 / 時區 / 日均規則即時計算保留金額 |
| `budget-save.service.js` | 預算剩餘額自動結算、補跑、delta/manual 補差 |
| `loan.service.js` | 借貸建立、還款、作廢 |
| `reimbursement.service.js` | 報銷流程、報銷入帳、請款單完成 / 還原後的匯入報銷狀態同步、隱藏分類處理 |
| `savings-jar.service.js` | 存錢罐存提與目標管理 |
| `src/ui/services/bookkeeping-reminder.service.js` | 記帳提醒設定、通知排程（含 `repeats: true` 確保每日重複觸發）、連續記帳成就統計、原生通知同步逾時保護、全帳本同步去重、同步序列化避免實機儲存卡死、Android Local Notifications plugin proxy 相容性處理、exact alarm 檢查與系統設定導引 |
| `savings-jar-auto-save.service.js` | 存錢罐自動存入 / 定期儲蓄流程 |
| `subscription-tracker.service.js` | 訂閱追蹤與期別處理；扣款日一開始即視為本期到期並推進下一期，日期 helper 以純日期與 App 預設時區處理避免環境時區漂移 |
| `subscription-charge.service.js` | 訂閱今日到期扣款 runner；在 App 啟動 / 回前景 / 帳本切換與訂閱儲存後，以 `subscription:<id>:<dueDate>` 冪等鍵建立支出交易，避免重複扣款或補扣非今日項目 |
| `ai-bookkeeping.service.js` | AI 記帳語意解析與建議 |
| `ai-bookkeeping-tiny-ner.service.js` | AI 記帳輕量關鍵詞/實體抽取 |
| `ai-bookkeeping-category-match.js` / `ai-bookkeeping-account-match.js` | AI 記帳分類 / 帳戶比對輔助 |
| `membership.service.js` | 會員等級、限制、Google Play 狀態同步、snapshot 與邀請碼會員加成判定；不再直接處理 router 導頁 |
| `google-play-billing.service.js` | Google Play 方案查詢、購買、恢復、兌換 |
| `import.service.js` | 匯入 |
| `export.service.js` | 匯出（CSV / Spreadsheet XML / 檔案落地 / 報表資料） |
| `repair.service.js` | 資料一致性檢查與修復 |
| `seed.service.js` | 種子資料 |

核心工具目錄：`src/core/utils/`

| Utility | 功能 |
|---|---|
| `analysis-breakdown.js` | 分析頁分類/帳戶彙總、圓餅圖/長條圖資料與日別 breakdown 計算 |

UI 服務目錄：`src/ui/services/`

| Service | 功能 |
|---|---|
| `app-bootstrap.service.js` | UI 啟動鏈協調：建立 Pinia store、接 core bootstrap 結果、處理 setup 前後 app boot 流程 |
| `app-runtime.service.js` | App runtime side effects：背景排程、同步/備份啟動、Android back、網址恢復、前景事件協調；啟動 / 回前景 / 帳本切換時補跑存錢罐自動存入、訂閱今日扣款與預算存款 |
| `ledger-runtime.service.js` | 帳本切換後的 cross-store reset / reload / integrity repair 與帳本生命周期協調 |
| `membership-navigation.service.js` | 會員限制導頁與 membership benefits navigation，將 router side effect 留在 UI 層 |
| `shared-ledger.service.js` | 共同帳本前端流程：建立、下載、上傳、自動同步、本機帳本綁定 |
| `google-backup.service.js` | Google Drive AppData 備份連線、自動備份、還原、重新授權後自動清理 stale auto-check diagnostics；Google 授權失效時自動偵測並寫入 `error/reauth_required` 狀態使 UI 顯示重新授權警示；設定頁立即備份會先確認設定保存成功才執行 |
| `webdav-backup.service.js` | WebDAV 備份連線、自動備份、還原；設定頁立即備份會先確認設定保存成功才執行 |
| `app-runtime.service.js` + `SettingsAutoBackupPage.vue` | 背景自動備份 / 自動偵測完成後會送出 `app:auto-backup-state-updated`，讓設定頁即時重讀 Google / WebDAV provider 狀態；重讀時會保留尚未儲存的 WebDAV 密碼輸入，避免背景 refresh 把使用者輸入清空 |
| `google-drive-ledger-sync.service.js` | Google Drive 帳本同步（逐帳本 enable / sync now） |
| `addon-template.service.js` | 附加項目模板預設值與保存 |
| `bank-sync.service.js` | 銀行同步前端流程（憑證加密封裝、同步/匯入） |
| `bank-sync-auto-refresh.service.js` | 銀行同步自動刷新節流與前景更新 |
| `bank-sync-debug.service.js` | 銀行同步 debug trace 與錯誤資訊 |
| `ai-loan-intent.service.js` | AI 借貸語意到借貸交易動作的轉換 |
| `auto-fill-rule.service.js` | 自動識別規則 CRUD |
| `exchange-rate.service.js` | 匯率同步資料流程 |
| `home-widget.service.js` | Android 首頁小工具摘要同步 |
| `home-widget-summary.js` | 首頁小工具圖表摘要資料建構 |
| `navigation-back.service.js` | App 內返回可達性與 fallback 判定 |
| `secure-setting.service.js` | 敏感設定值加密儲存（AES-GCM） |
| `security-lock.service.js` | 生物辨識/系統憑證安全鎖整合 |
| `theme.service.js` | 主題色、配色方案與字體縮放套用 |
| `app-update.service.js` | App 版本檢查與商店連結；Android AAB 發版版本碼由 `android/app/build.gradle` 依最終 `versionName` 自動推導（`1,000,000 + major * 1,000,000 + minor * 1,000 + patch`，保留 Play 歷史版本碼升級空間），仍可由 `CI_VERSION_CODE` 覆蓋；Play 發版流程若存在 `mapping.txt` 也會一併上傳去模糊化檔 |
| `i18n.service.js` | 多語系文案管理 |
| `setup-flow.service.js` | 是否顯示 Welcome / setup 流程判定 |
| `post-setup-intro.service.js` | 設定完成後導覽旗標管理 |
| `error-log.service.js` | 前端錯誤去重、上報與全域安裝 |
| `app-url-route.js` | App URL / invite code 解析與導向 |
| `route-scroll.service.js` | Router scroll restore 延後執行 |

UI composable 目錄：`src/ui/composables/`

| Composable | 功能 |
|---|---|
| `useTransactionSearchPage.js` | 交易搜尋頁 filter、批量選取、批量編輯 sheet、摘要與搜尋結果協調 |
| `useAppShellRuntime.js` | App shell boot 狀態、route transition key、視窗高度鎖定、安全鎖 lifecycle、更新提示協調 |

共享帳本 API 服務目錄：`src/services/shared-ledger/`

| Service | 功能 |
|---|---|
| `backend.js` | 共同帳本 Node backend API client、登入 session、帳號資料更新、Email 邀請、邀請碼兌換、管理員 API、client log 上報 |

## 8. Backend（Node.js 共同帳本 / 帳號）對應

目錄：`../backend/src/`

| 檔案 | 功能 |
|---|---|
| `server.js` | Node.js HTTP server 入口；透過 `routes/route-table.js` 做 prefix dispatcher，掛載 auth / admin / client-logs / shared-ledgers / referrals API，含 rate limit 與 body size 保護 |
| `routes/route-table.js` | API route table 與 pathname -> handler dispatch |
| `routes/auth.js` | auth 路由入口 re-export；實作已拆到 `routes/auth/` 模組目錄 |
| `routes/auth/` | Email / Google 登入、註冊、登出、refresh、`/me`、個人資料更新、忘記密碼 / 臨時密碼 / 重設密碼、Google Play 會員同步 action handlers 與共享 helper |
| `routes/admin.js` | 管理員總覽、會員狀態調整、錯誤 log 審核、使用者刪除 |
| `routes/client-logs.js` | 前端錯誤事件上報 |
| `routes/shared-ledgers.js` | shared-ledgers 路由入口 re-export；實作已拆到 `routes/shared-ledgers/` 模組目錄 |
| `routes/shared-ledgers/` | 共同帳本建立、查詢、快照上傳下載、Email 邀請、接受邀請、試用與同步 action handlers |
| `routes/referrals.js` | 邀請碼資訊、邀請碼兌換、會員獎勵發放 |
| `collab/store.js` | 本機 JSON store、使用者資料、共同帳本、邀請、會員加成資料、access token / auth session |
| `collab/auth-store.js` | 帳號、密碼、auth provider、會員 grant、Google Play 同步後的 public profile 會員狀態、refresh session 邏輯 |
| `collab/admin-store.js` | 管理員總覽、client log、會員管理 |
| `collab/auth-session.js` | Bearer token 驗證、登入狀態檢查、管理員權限檢查 |
| `collab/http.js` | backend 路由共用的 request/response helper，含 path segment parsing、method/body guard 與 route error serialization |

## 9. Repository（資料存取層）對應

目錄：`src/core/repositories/`

| Repository | 資料表/職責 |
|---|---|
| `transaction.repo.js` | 交易查詢、建立、更新、軟刪除 |
| `account.repo.js` | 帳戶清單、餘額計算、封存/刪除 |
| `budget.repo.js` | 預算、預算項目、預算存款結算紀錄 |
| `category.repo.js` | 分類與分類群組 |
| `ledger.repo.js` | 帳本 |
| `loan.repo.js` | 借貸與還款紀錄 |
| `reimbursement.repo.js` | 報銷單與明細 |
| `savings-jar.repo.js` | 存錢罐資料 |
| `bank-sync.repo.js` | 銀行連線與同步設定 |
| `counterparty.repo.js` | 往來對象 |
| `settings.repo.js` | 設定（含 ledger-scoped 預算存款偏好） |
| `base.repo.js` | 通用 helper |

## 10. 補充說明（維護建議）

- 前端頁面應優先透過對應 store 操作，不直接在 view 內寫入 DB。
- 交易查詢頁與分析頁不得再直接 import `transaction.repo.js`，統一經過 `transaction-query.service.js`。
- 業務規則集中在 service 層，若調整規則，優先改 service。
- SQL 與資料結構調整，先改 repository，再檢查對應 store/action。
- **日期工具統一使用 `src/core/utils/id.js` 的 `monthKeyFromDate` / `dateKeyFromDate`**，禁止在 view / service 內重複定義相同邏輯。
- **多步驟刪除/寫入操作須包裝在 `withTransaction`（來自 `@/core/db/sqlite`）** 以確保資料完整性，參考 `transaction.service.js:deleteManualTransaction`。
- `transaction.repo.js:listAllTransactions` 支援可選 `{ limit }` 參數；首頁「全部」模式已預設限制為 3000 筆（`HOME_ALL_TRANSACTIONS_DISPLAY_LIMIT`）；分析/搜尋頁仍使用無限制版本。
- 若新增主頁功能，優先考慮：`home.vue` + `HomeTransactionFeed.vue` + `transaction.store.js`。
- 若新增分析維度，優先考慮：`analysis.vue`、`analysis-breakdown.js` 與 `transaction-query.service.js`。
- 若調整交易報表欄位或匯出格式，優先考慮：`AnalysisPrintPage.vue` + `export.service.js`，並同步檢查列印 / PDF 版面。
- 若調整交易刪除邏輯，需同步檢查 `transaction.service.js` 的關聯刪除（退款/報銷）。
- 若調整 App 開啟流程，需同步檢查 `main.js`、`app-bootstrap.service.js`、`app-runtime.service.js`、`useAppShellRuntime.js`、`google/auth.js` 與備份 service 的靜默登入流程。
- 若調整帳本切換與 onboarding，需同步檢查 `ledger.store.js`、`ledger-runtime.service.js`、`setup-flow.service.js` 與相關 store reload 流程。
- 若調整快速記帳入口，需同步檢查 `BookkeepingPage.vue`、`bookkeeping-mode.service.js`、首頁 FAB 與 Android 小工具導向。
- 若調整會員限制或升級導流，需同步檢查 `membership.service.js`、`membership-navigation.service.js` 與 `SettingsMembershipBenefitsPage.vue`。
- 若調整銀行同步入口，需同步檢查 `settings.vue` 的 `isBankSyncFeatureEnabled()`、銀行同步 API 可用性提示，以及 `/settings/bank-sync` 路由可達性。
- 若調整電子發票載具入口或同步流程，需同步檢查 `settings.vue`、`FeatureListPage.vue`、`SettingsInvoiceCarrier*.vue`、`src/services/invoice-carrier/backend.js`、`src/core/services/invoice-carrier.service.js`、本機 secure settings 過濾規則，以及 `/api/invoice/*`。
- 若調整 Google Drive 帳本同步，需同步檢查 `SettingsGoogleDriveLedgerSyncPage.vue`、`google-drive-ledger-sync.service.js`、會員限制與活動帳本 reload 流程。
- 若調整 App URL / invite link，需同步檢查 `app-url-route.js`、router redirect 與 `SettingsSharedLedgerPage.vue` 的 invite code 自動加入邏輯。
- 若調整帳號 / 共同帳本 / 邀請碼 / 管理員流程，需同步檢查 `SettingsAccountPage.vue`、`SettingsSharedLedgerPage.vue`、`SettingsAdminPage.vue`、`src/services/shared-ledger/backend.js`、`../backend/src/routes/route-table.js` 與 `../backend/src/routes/auth/`、`../backend/src/routes/shared-ledgers/`。

## 11. 文件更新時機

建議在以下情況同步更新此文件：

- 新增/刪除路由頁面
- 調整主要功能流程（交易、借貸、報銷、請款、預算、備份）
- 變更 store/service/repository 的責任邊界
- 新增重要共用元件（日期選擇器、統計元件、首頁卡片等）
- 設定入口策略變更（例如：銀行同步 / 電子發票載具顯示策略）
- 帳號、共同帳本、邀請碼、管理員或 backend API 流程變更
- 記帳模式切換邏輯變更（AI / 快速新增 / 問答）
- Google Drive 帳本同步或分析報表列印流程變更

## 12. 變數與函數索引（檔案層級）

- 範圍：`*.js`、`*.mjs`、`*.cjs`、`*.vue` 的 `<script>` 區塊
- 規則：僅收錄檔案層級宣告（module scope），不含函數內部區域變數
- 產生方式：由專案自動掃描產生（可重複執行更新）
- 備註：此段為掃描快照，新增檔案或重新建置後請重新掃描更新

### `android/app/src/main/assets/public/assets/addon-note-Bwq_D-Ew.js`
- 函數（0）：無
- 變數（1）：`i`
- 類別（0）：無

### `android/app/src/main/assets/public/assets/fa-icon-options-3VeAQaPo.js`
- 函數（0）：無
- 變數（1）：`i`
- 類別（0）：無

### `android/app/src/main/assets/public/assets/index-CrU_SBIu.js`
- 函數（0）：無
- 變數（1）：`__vite__mapDeps`
- 類別（0）：無

### `scripts/android-versioning.mjs`
- 函數（1）：`deriveVersionCodeFromVersionName`
- 變數（3）：`DEFAULT_VERSION_CODE`, `MAJOR_MULTIPLIER`, `VERSION_SEGMENT_BASE`
- 類別（0）：無

### `scripts/patch-capacitor-sqlite-plugin.mjs`
- 函數（0）：無
- 變數（3）：`filePath`, `next`, `source`
- 類別（0）：無

### `src/core/db/migrate.js`
- 函數（10）：`ensureSchemaMetaTable`, `executeMigrationSql`, `getSchemaMetaValue`, `isIgnorableMigrationError`, `patchLegacySchema`, `patchLegacyTableColumns`, `runMigrations`, `setSchemaMetaValue`, `splitSqlStatements`, `tableExists`
- 變數（3）：`LEGACY_COLUMN_PATCHES`, `LEGACY_SCHEMA_PATCH_META_KEY`, `MIGRATIONS`
- 類別（0）：無

### `src/core/db/sqlite.js`
- 函數（19）：`closeAllConnectionsSafely`, `closeDatabase`, `emitDataMutationEvent`, `ensureWebStoreReady`, `execute`, `getDatabase`, `initDatabase`, `isDataMutationSql`, `isNoSuchTableError`, `isPluginNullError`, `isRecoverableSchemaError`, `normalizeErrorMessage`, `openDatabaseConnection`, `openRecoveryDatabase`, `query`, `rebuildDatabase`, `resetDatabase`, `run`, `withTransaction`
- 變數（8）：`DB_VERSION`, `PRIMARY_DB_NAME`, `RECOVERY_DB_NAME`, `RESET_TABLES`, `activeDbName`, `db`, `initPromise`, `sqlite`
- 類別（0）：無

### `src/core/db/web-store.js`
- 函數（2）：`ensureJeepSqliteRegistered`, `ensureWebSqliteStoreReady`
- 變數（3）：`WASM_PATH`, `registerPromise`, `webStorePromise`
- 類別（0）：無

### `src/core/repositories/account.repo.js`
- 函數（17）：`archiveAccount`, `countAccountTransactions`, `countAccountsByGroup`, `createAccount`, `createAccountGroup`, `deleteAccountGroupIfEmpty`, `deleteAccountIfUnused`, `getAccountBalances`, `listAccountGroups`, `listAccounts`, `normalizeAccountIcon`, `normalizeCurrencyCode`, `restoreAccount`, `updateAccountGroupSortOrders`, `updateAccountIcon`, `updateAccountProfile`, `updateAccountSortOrdersByGroup`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/base.repo.js`
- 函數（3）：`assertLedgerId`, `firstRow`, `rowsOf`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/budget.repo.js`
- 函數（7）：`computeBudgetSpentByCategory`, `createBudget`, `deleteBudgetItem`, `deleteBudgetItemsByBudget`, `getBudgetByMonth`, `listBudgetItems`, `upsertBudgetItem`
- 變數（0）：無
- 類別（0）：無
- 補充：除原本的 budgets / budget_items 讀寫外，現在也承接整月預算存款設定、待結算 budget 篩選與 `budget_save_settlements` 結算紀錄。
- 補充：`listBudgetItems()` 在 join `categories` 時已明確使用 `bi.sort_order AS sort_order`，避免建立新帳本後初始化預算快照時出現 ambiguous column error。

### `src/core/repositories/category.repo.js`
- 函數（20）：`archiveCategoriesByGroup`, `archiveCategory`, `archiveCategoryGroup`, `countBudgetItemReferencesByGroup`, `countCategoryTransactions`, `countCategoryTransactionsByGroup`, `createCategory`, `createCategoryGroup`, `deleteCategoriesByGroup`, `deleteCategoryGroupById`, `deleteCategoryGroupIfUnused`, `deleteCategoryIfUnused`, `findFirstCategoryByKind`, `listCategories`, `listCategoryGroups`, `normalizeCategoryIcon`, `updateCategoryGroupSortOrdersByKind`, `updateCategoryIcon`, `updateCategoryProfile`, `updateCategorySortOrdersByGroup`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/counterparty.repo.js`
- 函數（4）：`createCounterparty`, `ensureCounterpartyByName`, `getCounterpartyByName`, `listCounterparties`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/ledger.repo.js`
- 函數（7）：`createLedger`, `deleteLedger`, `getLedger`, `isForeignKeyError`, `listLedgers`, `renameLedger`, `updateLedgerSortOrders`
- 變數（1）：`LEGACY_LEDGER_CHILD_DELETE_ORDER`
- 類別（0）：無

### `src/core/repositories/loan.repo.js`
- 函數（8）：`countLoans`, `createLoan`, `createLoanPayment`, `getLoanById`, `listLoanPayments`, `listLoans`, `sumLoanPayments`, `updateLoanStatus`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/reimbursement.repo.js`
- 函數（10）：`countReimbursements`, `createReimbursement`, `createReimbursementItem`, `findTransactionByIdempotencyKey`, `getReimbursementById`, `listReimbursementItems`, `listReimbursements`, `recomputeReimbursementTotal`, `setReimbursementPaid`, `updateReimbursementStatus`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/settings.repo.js`
- 函數（2）：`getSetting`, `setSetting`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/transaction.repo.js`
- 函數（23）：`addTransaction`, `addTransfer`, `countReimbursableTransactions`, `dayRangeUtc`, `findReimbursementSettlementIncomeTx`, `findTransactionById`, `findTransactionRecordById`, `getPaidClaimItemMinorByTransactionId`, `listAllTransactions`, `listRecentTransactions`, `listReimbursementTransactions`, `listTransactionsByAccount`, `listTransactionsByDay`, `listTransactionsByMonth`, `listTransactionsByYear`, `listTransferTransactionsByGroup`, `markTransactionReimbursed`, `monthRangeUtc`, `paidClaimItemMinorSql`, `softDeleteTransactionById`, `softDeleteTransferGroup`, `updateTransactionById`, `yearRangeUtc`
- 變數（0）：無
- 類別（0）：無
- 補充：`listReimbursementTransactions` 的 `reimbursed_minor` 會合併直接報銷入帳、代收抵扣與已完成請款單匯入明細，避免完成請款後原交易仍被分到未報銷。
- 補充：交易軟刪會同步清空 `idempotency_key`，讓請款單還原後再次完成、排程轉帳重建等流程不會被已軟刪交易的唯一鍵擋住。

### `src/core/services/ai-bookkeeping.service.js`
- 函數（28）：`compactText`, `countSubsequenceHits`, `escapeRegExp`, `extractAddonItems`, `extractSmartNoteText`, `findAccountByKeyword`, `findAccountMatches`, `fuzzyAccountScore`, `includesAny`, `includesKeyword`, `isGenericCategoryName`, `normalizeIncludeFlag`, `normalizeReimbursable`, `normalizeText`, `normalizeType`, `parseAmountMajor`, `parseAmountWithUnit`, `parseAutoBookkeepingText`, `parseDateTimeFromText`, `pickCategoryBySemanticRules`, `pickCategoryMatch`, `pickClosestAccount`, `pickFirstNonGenericCategory`, `pickTransferAccounts`, `round2`, `shouldTreatAsTransfer`, `stripTextByRanges`, `toMinor`
- 變數（2）：`EXPENSE_CATEGORY_SEMANTIC_RULES`, `INCOME_CATEGORY_SEMANTIC_RULES`
- 類別（0）：無

### `src/core/services/bootstrap.service.js`
- 函數（3）：`bootstrapApp`, `isRecoverableBootstrapError`, `loadStores`
- 變數（0）：無
- 類別（0）：無

### `src/core/services/budget.service.js`
- 函數（7）：`copyPreviousMonthBudget`, `ensureBudgetForMonth`, `loadBudgetSnapshot`, `monthRangeUtc`, `previousMonthKey`, `removeBudgetItem`, `saveBudgetItem`
- 變數（0）：無
- 類別（0）：無
- 補充：service 會驗證預算存款的來源/目標帳戶、同分類衝突與 ledger-scoped `retroactiveMode`，並把整月預算存款與 item-level 預算存款設定一起帶進 snapshot / 複製上月流程。

### `src/core/services/budget-save.service.js`
- 函數（1）：`runBudgetSaveIfDue`
- 變數（0）：無
- 類別（0）：無
- 補充：背景流程依帳本時區補跑日結轉與月底結轉，支援 `manual` / `delta` 補差、無剩餘略過、來源餘額不足失敗記錄，以及同分類衝突排除。

### `src/core/services/export.service.js`
- 函數（33）：`createCsvBlobUrl`, `createExcelBlobUrl`, `customRangeUtc`, `dayRangeUtc`, `downloadBlob`, `downloadCsvFile`, `downloadExcelFile`, `downloadJsonFile`, `exportAccountsCsv`, `exportAllLedgersJson`, `exportCategoriesCsv`, `exportLedgerJson`, `exportLedgerTransactionsCsv`, `exportLedgerTransactionsExcel`, `exportTransactionsCsv`, `getSchemaVersion`, `loadAccountBalanceBeforeMap`, `monthRangeUtc`, `rangeByMode`, `revokeBlobUrl`, `rowsFromLedgerTable`, `rowsToCsv`, `rowsToSpreadsheetXml`, `saveCsvFileToDevice`, `saveExcelFileToDevice`, `saveJsonFileToDevice`, `timestampForFilename`, `toCsvValue`, `toXmlValue`, `triggerDownloadFromUrl`, `utf8ToBase64`, `writeBase64FileToDevice`, `yearRangeUtc`
- 變數（2）：`EXCEL_HEADERS`, `LEDGER_TABLES`
- 類別（0）：無

### `src/core/services/google-play-billing.service.js`
- 函數（31）：`createBillingError`, `delay`, `ensureBillingSupported`, `findOwnedPurchaseByProductId`, `hasFreshBillingSupportCache`, `invalidateBillingCache`, `isAndroidNativePlatform`, `isOwnedPurchase`, `isStoreUnavailableError`, `isSupported`, `loadProducts`, `loadProductsInternal`, `manageSubscriptions`, `normalizeOwnedPurchase`, `normalizePlan`, `normalizeProduct`, `normalizePurchaseExpiryIso`, `normalizeStoreError`, `pickFirstValidIso`, `purchase`, `purchaseInternal`, `queryOwned`, `queryOwnedInternal`, `redeemPromoCode`, `restore`, `setBillingSupportCache`, `toIsoFromAnyTimestamp`, `toLowerText`, `toTimestampMs`, `withStoreRetry`, `withTimeout`
- 變數（8）：`BILLING_ERROR_CODE`, `BILLING_SUPPORT_CACHE_TTL_MS`, `BILLING_SUPPORT_RETRY_MAX_ATTEMPTS`, `BILLING_TIMEOUT_MS`, `GOOGLE_PLAY_PRODUCTS`, `STORE_RETRY_DELAY_MS`, `billingConnectionInFlight`, `billingSupportCache`
- 類別（0）：無

### `src/core/services/import.service.js`
- 函數（19）：`importAccountsCsv`, `importBackupJsonAsNewLedgers`, `importCategoriesCsv`, `importLedgerCsv`, `importLedgerJsonAsNewLedger`, `importLedgerPayloadAsNewLedger`, `importTransactionsCsv`, `normalizeFaIcon`, `normalizeLedgerName`, `normalizeText`, `normalizedRows`, `objectToInsertSql`, `parseCsv`, `parseCsvLine`, `parseJson`, `previewCsvType`, `resolveImportedLedgerName`, `resolveSourceLedger`, `sumNumericValues`
- 變數（1）：`TABLE_IMPORT_ORDER`
- 類別（0）：無

### `src/core/services/loan.service.js`
- 函數（8）：`addLoanRepayment`, `createLoanWithOptionalTransaction`, `getLoanDetail`, `loadLoanDashboard`, `nextLoanStatus`, `validateAmountMinor`, `validateDirection`, `voidLoan`
- 變數（0）：無
- 類別（0）：無

### `src/core/services/membership.service.js`
- 函數（73）：`assertCanCreateAccount`, `assertCanCreateLedger`, `assertCanCreateLoan`, `assertCanCreateReimbursement`, `assertCanUseAiBookkeeping`, `beginGooglePlayCallTrace`, `clonePlayCallTraceEntry`, `commitEntitlementState`, `createDefaultEntitlementState`, `endGooglePlayCallTrace`, `fetchMembershipProductDisplay`, `getAiBookkeepingDailyUsage`, `getAppVersion`, `getAppVersionMajor`, `getBrowserStorage`, `getEmptyProductDisplay`, `getEntitlementState`, `getGooglePlayCallTraceSnapshot`, `getGooglePlayMembershipInfo`, `getMembershipLimits`, `getMembershipProductDisplay`, `getMembershipProductDisplaySnapshot`, `getMembershipTier`, `getMembershipTierSnapshot`, `getTierAndPlanFromState`, `hasFreshGooglePlaySupportCache`, `hasMembershipProductDisplayCache`, `isDebugMembershipOverrideEnabled`, `isFreeTier`, `isGooglePlayMembershipSupported`, `isMembershipCacheValid`, `isMembershipProductDisplayCacheFresh`, `isMonthlySyncFailureGraceActive`, `isTransientStoreError`, `migrateLegacyMembershipState`, `normalizeCacheExpiry`, `normalizeEntitlementState`, `normalizeGooglePlayPlan`, `normalizeProductDisplay`, `normalizeSyncStatus`, `normalizeUsageCount`, `notifyMembershipSnapshot`, `notifyPlayCallTraceListeners`, `openGooglePlaySubscriptionManagement`, `readAiUsageMap`, `readEntitlementState`, `recordAiBookkeepingUsage`, `redeemGooglePlayPromoCode`, `resolveMonthlyCacheExpiry`, `resolveMonthlyCacheExpiryFromPurchaseResult`, `restoreGooglePlayMembership`, `saveEntitlementState`, `setGooglePlaySupportCache`, `setMembershipProductDisplayCache`, `sleep`, `subscribeGooglePlayCallTrace`, `subscribeGooglePlayMembership`, `subscribeMembershipSnapshot`, `syncMembershipEntitlements`, `syncMembershipEntitlementsWithRetry`, `toDateKey`, `toEpochMs`, `toExpiryIso`, `toIsoNow`, `toMembershipLimitsByTier`, `toMembershipSnapshot`, `traceGooglePlayCall`, `triggerBackgroundMembershipSync`, `trimPlayCallTraceEntries`, `warmupMembershipRuntime`, `withTimeout`, `writeAiUsageMap`, `writeEntitlementState`
- 變數（33）：`AI_BOOKKEEPING_USAGE_STORAGE_KEY`, `FREE_LIMITS`, `GOOGLE_PLAY_SUPPORT_CACHE_TTL_FAIL_MS`, `GOOGLE_PLAY_SUPPORT_CACHE_TTL_OK_MS`, `GOOGLE_PLAY_SUPPORT_RETRY_DELAY_MS`, `LEGACY_GOOGLE_PLAY_MEMBER_PLAN_STORAGE_KEY`, `LEGACY_GOOGLE_PLAY_MEMBER_STORAGE_KEY`, `MEMBERSHIP_BACKGROUND_SYNC_COOLDOWN_MS`, `MEMBERSHIP_CACHE_FOREVER`, `MEMBERSHIP_ENTITLEMENT_STORAGE_KEY`, `MEMBERSHIP_FREE`, `MEMBERSHIP_MEMBER`, `MEMBERSHIP_PRODUCT_DISPLAY_CACHE_TTL_MS`, `MEMBERSHIP_PRODUCT_DISPLAY_FETCH_TIMEOUT_MS`, `MEMBERSHIP_SYNC_RETRY_DELAY_MS`, `MEMBERSHIP_SYNC_RETRY_MAX_ATTEMPTS`, `MEMBERSHIP_SYNC_STATUS_ERROR`, `MEMBERSHIP_SYNC_STATUS_OK`, `MONTHLY_MEMBERSHIP_EXPIRY_UNKNOWN_GRACE_MS`, `MONTHLY_MEMBERSHIP_SYNC_FAILURE_GRACE_MS`, `PLAY_CALL_TRACE_MAX_ENTRIES`, `googlePlaySupportCache`, `membershipBackgroundSyncInFlight`, `membershipBackgroundSyncRequestedAt`, `membershipProductDisplayCache`, `membershipProductDisplayCachedAt`, `membershipProductDisplayInFlight`, `membershipSnapshotListeners`, `membershipSyncInFlight`, `playCallExecutionQueue`, `playCallTraceEntries`, `playCallTraceListeners`, `playCallTraceSeq`
- 類別（0）：無

### `src/core/services/reimbursement.service.js`
- 函數（17）：`appendDateToNote`, `assertCanTransition`, `buildCopiedExpenseNote`, `cancelReimbursableExpenseSettlement`, `copyExpenseToTargetLedgers`, `createReimbursementDraft`, `ensureCategoryInTargetLedger`, `ensureHiddenReimbursementCategory`, `findTargetAccountId`, `getReimbursementDetail`, `loadReimbursementDashboard`, `markReimbursementPaid`, `normalizeAmountMinor`, `normalizeTargetLedgerIds`, `settleReimbursableExpense`, `toDateKey`, `transitionReimbursementStatus`
- 變數（1）：`ALLOWED_TRANSITIONS`
- 類別（0）：無

### `src/core/services/repair.service.js`
- 函數（3）：`countValue`, `repairLedgerData`, `scanLedgerIntegrity`
- 變數（0）：無
- 類別（0）：無

### `src/core/services/seed.service.js`
- 函數（4）：`ensureLedgerDefaults`, `normalizeSeedLocale`, `resolveLedgerSeedLocale`, `seedCategoryGroupsAndCategories`
- 變數（3）：`CATEGORY_DEFAULTS_BY_LOCALE`, `LEDGER_SEED_LOCALE_KEY`, `SUPPORTED_SEED_LOCALES`
- 類別（0）：無

### `src/core/services/transaction.service.js`
- 函數（15）：`assertPositiveAmount`, `cloneTransactionFailureTraceEntry`, `createAdjustment`, `createExpense`, `createIncome`, `createTransfer`, `deleteManualTransaction`, `getTransactionFailureReasonType`, `getTransactionFailureTraceSnapshot`, `notifyTransactionFailureTraceListeners`, `recordTransactionFailureTrace`, `subscribeTransactionFailureTrace`, `traceTransactionCreate`, `trimTransactionFailureTraceEntries`, `updateManualTransaction`
- 變數（4）：`TRANSACTION_FAILURE_TRACE_MAX_ENTRIES`, `transactionFailureTraceEntries`, `transactionFailureTraceListeners`, `transactionFailureTraceSeq`
- 類別（0）：無

### `src/core/utils/id.js`
- 函數（3）：`createId`, `monthKeyFromDate`, `nowIso`
- 變數（0）：無
- 類別（0）：無

### `src/main.js`
- 函數（5）：`initSqliteWebStoreIfNeeded`, `initSqliteWebStoreWithTimeout`, `main`, `scheduleAutoBackupOnDataChange`, `scheduleMembershipWarmup`
- 變數（3）：`DATA_CHANGE_BACKUP_DEBOUNCE_MS`, `dataChangeBackupRunning`, `dataChangeBackupTimer`
- 類別（0）：無

### `src/services/google/auth.js`
- 函數（15）：`appendDebugDetails`, `assertNativePlatform`, `createReauthRequiredError`, `extractErrorDebugParts`, `extractToken`, `getAccessToken`, `getCachedGoogleProfile`, `getConfiguredWebClientId`, `googleSignIn`, `googleSignOut`, `initGoogleAuth`, `isAccountReauthError`, `loginGoogleWithOptions`, `normalizeGoogleAuthError`, `reauth`
- 變數（7）：`DRIVE_APPDATA_SCOPE`, `GOOGLE_REAUTH_REQUIRED_CODE`, `GOOGLE_SCOPES`, `cachedAccessToken`, `cachedProfile`, `initializedClientId`, `ongoingSignInPromise`
- 類別（0）：無

### `src/services/google/drive-appdata-backup.js`
- 函數（11）：`authHeaders`, `buildMultipartBody`, `createDriveFile`, `deleteDriveFile`, `downloadAppDataBackupText`, `ensureOk`, `fetchWithAuth`, `findFilesByName`, `listAppDataBackups`, `updateDriveFile`, `uploadBackupJsonToAppDataFolder`
- 變數（2）：`DRIVE_FILES_API`, `DRIVE_UPLOAD_API`
- 類別（0）：無

### `src/ui/App.vue`
- 函數（0）：無
- 變數（7）：`accountStore`, `hasAccounts`, `hasLedgers`, `isBooting`, `ledgerStore`, `route`, `showWelcomePage`
- 類別（0）：無

### `src/ui/components/budget/BudgetItemSheet.vue`
- 函數（6）：`closeCategoryPicker`, `onSave`, `openCategoryPicker`, `pickCategory`, `setCategoryPickerParent`, `syncCategoryPickerParent`
- 變數（11）：`categoryOptions`, `categoryPickerChildren`, `categoryPickerGroups`, `categoryPickerParentId`, `emit`, `hasVisibleCategories`, `model`, `props`, `selectedCategoryIcon`, `selectedCategoryLabel`, `showCategoryPicker`
- 類別（0）：無
- 補充：sheet 內新增 item-level 預算存款開關、來源帳戶 / 目標存錢罐選擇與錯誤提示，帳戶選擇沿用快速新增的分組式 account picker；`daily_average` 會固定顯示為日結轉，其餘固定預算為月底結轉。

### `src/ui/components/common/AppDialog.vue`
- 函數（1）：`onRequestCloseOverlay`
- 變數（2）：`emit`, `props`
- 類別（0）：無

### `src/ui/components/common/CustomSelect.vue`
- 函數（8）：`handleWindowClick`, `handleWindowResizeOrScroll`, `isActive`, `isSameValue`, `normalizeOptions`, `pick`, `toggleOpen`, `updateMenuPosition`
- 變數（11）：`emit`, `menuRef`, `menuStyle`, `normalizedGroups`, `normalizedOptions`, `open`, `props`, `rootRef`, `selectedLabel`, `selectedOption`, `triggerRef`
- 類別（0）：無

### `src/ui/components/common/DateTimePickerField.vue`
- 函數（12）：`handleWindowClick`, `handleWindowResizeOrScroll`, `pad2`, `parseDate`, `pickDate`, `pickHour`, `pickMinute`, `setNow`, `shiftMonth`, `toDateInput`, `toggleOpen`, `updatePanelPosition`
- 變數（14）：`dayCells`, `displayText`, `emit`, `hours`, `minutes`, `monthLabel`, `open`, `panelRef`, `panelStyle`, `props`, `rootRef`, `triggerRef`, `viewMonth`, `weekNames`
- 類別（0）：無

### `src/ui/components/common/TimePickerField.vue`
- 函數（15）：`applySelection`, `closePanel`, `handleWindowClick`, `handleWindowResizeOrScroll`, `normalizeHour`, `normalizeMinute`, `onRequestCloseOverlay`, `pad2`, `parseTime`, `pickHour`, `pickMinute`, `resetToCurrentValue`, `syncDraftFromValue`, `toggleOpen`, `updatePanelPosition`
- 變數（14）：`displayText`, `draftHour`, `draftMinute`, `emit`, `hours`, `minutes`, `open`, `panelRef`, `panelStyle`, `props`, `rootRef`, `triggerRef`, `useSheetPresentation`, `viewportWidth`
- 類別（0）：無

### `src/ui/components/common/HomeRangePicker.vue`
- 函數（14）：`handleWindowClick`, `handleWindowResizeOrScroll`, `monthName`, `parseDay`, `parseMonth`, `pickDay`, `pickMonth`, `pickToday`, `pickYear`, `shift`, `toDayKey`, `toMonthKey`, `toggleOpen`, `updatePanelPosition`
- 變數（15）：`dayCells`, `displayLabel`, `emit`, `headerLabel`, `now`, `open`, `panelRef`, `panelStyle`, `props`, `rootRef`, `triggerRef`, `viewMonth`, `viewYear`, `weekNames`, `yearOptions`
- 類別（0）：無

### `src/ui/components/common/LedgerSwitcher.vue`
- 函數（5）：`onChange`, `onWindowClick`, `onWindowResizeOrScroll`, `toggleOpen`, `updateMenuPosition`
- 變數（9）：`activeLedgerName`, `isOpen`, `ledgerStore`, `menuRef`, `menuStyle`, `rootRef`, `switchableLedgers`, `triggerRef`, `uiStore`
- 類別（0）：無

### `src/ui/components/common/MoneyText.vue`
- 函數（0）：無
- 變數（2）：`props`, `text`
- 類別（0）：無

### `src/ui/components/common/ToastHost.vue`
- 函數（0）：無
- 變數（2）：`orderedToasts`, `uiStore`
- 類別（0）：無

### `src/ui/components/home/HomeAssetSummaryCard.vue`
- 函數（0）：無
- 變數（4）：`expenseMinor`, `incomeMinor`, `title`, `transactionStore`
- 類別（0）：無

### `src/ui/components/home/HomeBudgetSummaryCard.vue`
- 函數（0）：無
- 變數（7）：`budgetStore`, `isOverBudget`, `pieStyle`, `totalBudgetMinor`, `totalSpentMinor`, `usedPercentLabel`, `usedRatio`
- 類別（0）：無
- 補充：首頁預算簡表的月模式與日模式都會顯示保留金額；日模式使用目前選定日期之後尚未到來的 `daily_average` 保留額，不含今天已生效的日均額度。

### `src/ui/components/home/HomeTransactionEditSheet.vue`
- 函數（34）：`addAddonRow`, `addonLabelOf`, `addonOptionIdByLabel`, `addonTotalDeltaMajorFromNote`, `applyOperator`, `closeCategoryPicker`, `closeDeleteConfirm`, `collectAppliedAddonItems`, `confirmRemove`, `createAddonRow`, `defaultAddonOption`, `defaultCategoryId`, `ensureInCategories`, `evaluateExpression`, `formatAmountInput`, `handleAmountInput`, `isFormulaExpression`, `isOperator`, `onAddonOptionChange`, `onRequestCloseOverlay`, `openCategoryPicker`, `parseAddonRowsFromNote`, `pickCategory`, `precedence`, `pressCalcKey`, `remove`, `removeAddonRow`, `round2`, `setCategoryPickerParent`, `submit`, `syncAmountFromInput`, `syncCategoryPickerParent`, `toDateInput`, `toOccurredAtIso`
- 變數（27）：`accountStore`, `addonDirectionOptions`, `addonOptions`, `addonOptionsByType`, `addonRows`, `addonSeq`, `addonTemplateStore`, `calcKeys`, `categoryPickerChildren`, `categoryPickerGroups`, `categoryPickerParentId`, `categoryStore`, `deleteConfirmOpen`, `deleting`, `emit`, `hasVisibleCategories`, `model`, `props`, `selectedCategoryIcon`, `selectedCategoryLabel`, `showCategory`, `showCategoryPicker`, `showExtra`, `transactionStore`, `types`, `uiStore`, `visibleCategoryGroups`
- 類別（0）：無
- 補充：附加項目列採單行橫向排列；報銷/預算/收支採卡片式切換按鈕。

### `src/ui/components/home/HomeTransactionFeed.vue`
- 函數（13）：`accountNameOfTransaction`, `addonDeltaMajor`, `addonDeltaTag`, `categoryIconOfTransaction`, `dateKeyOf`, `dateLabelOf`, `formatTime`, `labelOf`, `labelOfTransaction`, `loanTransactionIcon`, `loanTransactionLabel`, `openEdit`, `showAddonDeltaTag`
- 變數（7）：`accountStore`, `categoryStore`, `groupedRecentTransactions`, `loanStore`, `monthLabel`, `router`, `transactionStore`
- 類別（0）：無

### `src/ui/components/home/QuickAddSheet.vue`
- 函數（45）：`accountNameById`, `addAddonRow`, `addonDirectionByOptionId`, `addonLabelOf`, `addonOptionIdByLabel`, `applyAiDraft`, `applyOperator`, `categoryNameById`, `closeCategoryPicker`, `collectAppliedAddonItems`, `createAddonRow`, `defaultAccountId`, `defaultAddonTemplate`, `defaultOccurredDateTime`, `defaultPeerAccountId`, `ensureCategoryIdByType`, `ensureValidAccounts`, `evaluateExpression`, `formatAmountInput`, `formatDateInput`, `formatOccurredAtLabel`, `goEditCreatedTransaction`, `handleAmountInput`, `isFormulaExpression`, `isOperator`, `monthKeyFromDate`, `normalizeType`, `onAddonOptionChange`, `onRequestCloseOverlay`, `openCategoryPicker`, `parseAddonRowsFromAiDraft`, `parseWithAi`, `pickCategory`, `precedence`, `pressCalcKey`, `pushAiMessage`, `removeAddonRow`, `resolveTypeByCategory`, `round2`, `setCategoryPickerParent`, `submit`, `syncAmountFromInput`, `syncCategoryPickerParent`, `toOccurredAtIso`, `toggleAiVoiceInput`
- 變數（46）：`accountStore`, `addonDirectionOptions`, `addonRows`, `addonSeq`, `addonTemplateItems`, `addonTemplateOptions`, `addonTemplateStore`, `aiAutoCreating`, `aiCreatedRecord`, `aiInput`, `aiInterimSpeechText`, `aiMessageSeq`, `aiMessages`, `aiOccurredAtLabel`, `aiResultAccountId`, `aiResultAccountText`, `aiResultAmountMajor`, `aiResultCategoryId`, `aiResultIcon`, `aiResultOccurredAtLabel`, `aiResultPeerAccountId`, `aiResultSignedAmount`, `aiResultTitle`, `aiResultType`, `budgetStore`, `calcKeys`, `categoryPickerChildren`, `categoryPickerGroups`, `categoryPickerParentId`, `categoryStore`, `emit`, `equalShowsDone`, `hasAiInputText`, `hasVisibleCategories`, `isAiMode`, `model`, `props`, `router`, `selectedCategoryIcon`, `selectedCategoryLabel`, `showCategoryPicker`, `showExtra`, `transactionStore`, `types`, `uiStore`, `visibleCategoryGroups`
- 類別（0）：無
- 補充：同一元件同時承載 AI 對話模式與手動記帳表單；附加項目列維持單行，附加條件使用卡片式切換按鈕。

### `src/ui/components/layout/BottomNav.vue`
- 函數（0）：無
- 變數（4）：`NAV_ITEMS`, `activeTab`, `items`, `route`
- 類別（0）：無

### `src/ui/composables/use-speech-input.js`
- 函數（7）：`normalizeRawErrorCode`, `normalizeSpeechError`, `normalizeSpeechTranscript`, `parseChineseIntegerToken`, `parseChineseNumberToken`, `resolveSpeechRecognitionCtor`, `useSpeechInput`
- 變數（4）：`CHINESE_BIG_UNIT_MAP`, `CHINESE_DIGIT_MAP`, `CHINESE_SMALL_UNIT_MAP`, `isDev`
- 類別（0）：無

### `src/ui/constants/currency-options.js`
- 函數（1）：`normalizeCurrencyCode`
- 變數（3）：`CURRENCY_OPTION_LIST`, `VALID_CURRENCY_CODES`, `currencyOptions`
- 類別（0）：無

### `src/ui/router/index.js`
- 函數（0）：無
- 變數（1）：`router`
- 類別（0）：無

### `src/ui/services/addon-template.service.js`
- 函數（7）：`getDefaultAddonTemplates`, `getDefaultAddonTemplatesByLedger`, `loadAddonTemplates`, `normalizeSeedLocale`, `normalizeTemplate`, `normalizeTemplates`, `saveAddonTemplates`
- 變數（4）：`ADDON_TEMPLATE_KEY`, `DEFAULT_TEMPLATES_BY_LOCALE`, `LEDGER_SEED_LOCALE_KEY`, `SUPPORTED_SEED_LOCALES`
- 類別（0）：無

### `src/ui/services/google-backup.service.js`
- 函數（15）：`assertLedgerId`, `buildDefaultState`, `connectGoogleBackup`, `disconnectGoogleBackup`, `ensureNativePlatform`, `getGoogleBackupState`, `isBackupDue`, `normalizeState`, `performGoogleBackup`, `pickPreferredBackupFile`, `restoreGoogleBackupJson`, `runGoogleAutoBackupIfDue`, `runGoogleAutoBackupOnDataChange`, `saveState`, `updateGoogleBackupState`
- 變數（2）：`GOOGLE_BACKUP_FILENAME`, `GOOGLE_BACKUP_KEY`
- 類別（0）：無

### `src/ui/services/i18n.service.js`
- 函數（21）：`applyDocumentLanguage`, `applyTemplateParams`, `detectUserLocale`, `getCurrentLocale`, `initLocalePreference`, `isInRuntimeTranslateExcludedZone`, `normalizeLocale`, `processElementAttributes`, `processNodeTree`, `processTextNode`, `readLocale`, `safelyStartRuntimeDomTranslator`, `setLocale`, `shouldRefreshOriginalValue`, `shouldSkipTextNode`, `startRuntimeDomTranslator`, `syncRuntimeDomTranslations`, `translateRuntimeText`, `translateTextByLocale`, `useI18n`, `writeLocale`
- 變數（16）：`DEFAULT_LOCALE`, `ENABLE_RUNTIME_DOM_TRANSLATOR`, `MESSAGES`, `RUNTIME_EN_EXACT`, `RUNTIME_EN_PHRASE_REPLACEMENTS`, `RUNTIME_EN_REPLACEMENTS`, `RUNTIME_EN_TEXT`, `STORAGE_KEY`, `SUPPORTED_LOCALES`, `domTranslatorObserver`, `isSyncingRuntimeDomTranslations`, `localeRef`, `originalAttrsByElement`, `originalTextByNode`, `runtimeReplacementEntries`, `translatableAttributeNames`
- 類別（0）：無

### `src/ui/services/runtime-en-exact.generated.js`
- 函數（0）：無
- 變數（1）：`RUNTIME_EN_TEXT_EXACT_GENERATED`
- 類別（0）：無

### `src/ui/services/runtime-en-phrases.generated.js`
- 函數（0）：無
- 變數（1）：`RUNTIME_EN_TEXT_GENERATED`
- 類別（0）：無

### `src/ui/services/theme.service.js`
- 函數（20）：`applyPalette`, `applyPreference`, `applyPrimary`, `applyThemeColor`, `applyThemeScheme`, `contrastText`, `getCurrentThemePreference`, `getDefaultThemeColor`, `getScheme`, `hexToRgb`, `listThemeSchemes`, `loadThemeColor`, `normalizeHex`, `readPreference`, `resetThemeColor`, `rgbToHex`, `saveThemeColor`, `saveThemeScheme`, `tint`, `writePreference`
- 變數（4）：`DEFAULT_SCHEME_ID`, `LEGACY_PRIMARY_KEY`, `STORAGE_KEY`, `THEME_SCHEMES`
- 類別（0）：無

### `src/ui/services/webdav-backup.service.js`
- 函數（28）：`assertLedgerId`, `base64EncodeUtf8`, `buildAuthHeader`, `buildBackupFilename`, `buildDefaultState`, `buildLegacyBackupFilename`, `buildRemoteDirUrl`, `buildUploadUrl`, `connectWebdavBackup`, `decodeXmlText`, `disconnectWebdavBackup`, `downloadJsonFromWebdav`, `ensureRemoteDirExists`, `filenameFromHref`, `getWebdavBackupState`, `isBackupDue`, `listWebdavBackupFilenames`, `listWebdavBackupFilenamesByDirectoryGet`, `normalizeEndpoint`, `normalizeRemoteDir`, `normalizeState`, `performWebdavBackup`, `requestWebdav`, `restoreWebdavBackupJson`, `runWebdavAutoBackupIfDue`, `runWebdavAutoBackupOnDataChange`, `updateWebdavBackupState`, `uploadJsonToWebdav`
- 變數（2）：`WEBDAV_BACKUP_KEY`, `WEBDAV_REQUEST_TIMEOUT_MS`
- 類別（0）：無

### `src/ui/stores/account.store.js`
- 函數（0）：無
- 變數（1）：`useAccountStore`
- 類別（0）：無

### `src/ui/stores/addon-template.store.js`
- 函數（0）：無
- 變數（1）：`useAddonTemplateStore`
- 類別（0）：無

### `src/ui/stores/budget.store.js`
- 函數（0）：無
- 變數（1）：`useBudgetStore`
- 類別（0）：無

### `src/ui/stores/category.store.js`
- 函數（1）：`buildCategoryGroupsByKind`
- 變數（1）：`useCategoryStore`
- 類別（0）：無

### `src/ui/stores/ledger.store.js`
- 函數（0）：無
- 變數（2）：`ACTIVE_LEDGER_KEY`, `useLedgerStore`
- 類別（0）：無

### `src/ui/stores/loan.store.js`
- 函數（0）：無
- 變數（1）：`useLoanStore`
- 類別（0）：無

### `src/ui/stores/reimbursement.store.js`
- 函數（0）：無
- 變數（1）：`useReimbursementStore`
- 類別（0）：無

### `src/ui/stores/transaction.store.js`
- 函數（0）：無
- 變數（1）：`useTransactionStore`
- 類別（0）：無

### `src/ui/stores/ui.store.js`
- 函數（0）：無
- 變數（1）：`useUiStore`
- 類別（0）：無

### `src/ui/utils/addon-note.js`
- 函數（8）：`addonDeltaMajorFromNote`, `addonDeltaTagText`, `formatAmount`, `mergeAddonItemsToNote`, `normalizeDirection`, `parseAddonItemsFromNote`, `parseSummaryLine`, `round2`
- 變數（1）：`ADDON_NOTE_PREFIX`
- 類別（0）：無

### `src/ui/utils/fa-icon-options.js`
- 函數（1）：`normalizeFaIcon`
- 變數（7）：`ACCOUNT_ICON_OPTIONS`, `CATEGORY_ICON_OPTIONS`, `accountIconOptions`, `categoryIconOptions`, `defaultAccountIcon`, `defaultCategoryExpenseIcon`, `defaultCategoryIncomeIcon`
- 類別（0）：無

### `src/ui/views/AiAutoBookkeepingPage.vue`
- 函數（7）：`applyDraft`, `parseText`, `submit`, `toDateInput`, `toOccurredAtIso`, `toggleVoiceInput`, `waitFor`
- 變數（19）：`accountStore`, `aiStatusText`, `categoryGroupsByType`, `categoryStore`, `hasDraft`, `hasInputText`, `isPageLeaving`, `model`, `pageRef`, `parsing`, `showAiStatus`, `sourceText`, `speechLanguage`, `speechLiveText`, `submitting`, `transactionStore`, `typeOptions`, `uiStore`, `warnings`
- 類別（0）：無
- 補充：AI 解析後的手動修正表單與 `QuickAddSheet.vue` / `HomeTransactionEditSheet.vue` 保持一致的附加項目與附加條件 UI。

### `src/ui/views/BookkeepingPage.vue`
- 功能：記帳模式容器頁，依路由在 AI 記帳與手動快速新增之間切換。
- 內嵌頁：`src/ui/views/AiAutoBookkeepingPage.vue`、`src/ui/views/QuickAddPage.vue`

### `src/ui/views/AnalysisCategoryDetailPage.vue`
- 函數（19）：`accountName`, `categoryIconOfTransaction`, `categoryKeyOf`, `dateKeyOf`, `dateLabelOf`, `ensureReferenceData`, `formatTime`, `goBack`, `labelOf`, `labelOfTransaction`, `loadStatsTransactions`, `loanTransactionIcon`, `loanTransactionLabel`, `monthKeyFromDate`, `normalizedAmountMinor`, `openTransaction`, `parseMode`, `parseMonthKey`, `parseYear`
- 變數（25）：`accountStore`, `activeCategoryLabel`, `activeTypeLabel`, `analysisType`, `categoryId`, `categoryNameMap`, `categoryRatioText`, `categoryStore`, `categoryTotalMinor`, `categoryTransactions`, `groupedCategoryTransactions`, `ledgerStore`, `loanStore`, `mode`, `queryCategoryLabel`, `rangeLabel`, `referenceLedgerId`, `route`, `router`, `selectedMonth`, `selectedYear`, `statsTransactions`, `typeTotalMinor`, `typeTransactions`, `uiStore`
- 類別（0）：無

### `src/ui/views/AnalysisPrintPage.vue`
- 函數（10）：`dayKeyFromDate`, `exportCsv`, `monthKeyFromDate`, `openExportLink`, `parseMode`, `pickDay`, `pickEndDay`, `pickMonth`, `pickStartDay`, `pickYear`
- 變數（15）：`endDate`, `exportedActionLabel`, `exportedFilename`, `exportedIsDeviceLink`, `exportedLocation`, `exportedUrl`, `exporting`, `ledgerStore`, `mode`, `route`, `selectedDay`, `selectedMonth`, `selectedYear`, `startDate`, `uiStore`
- 類別（0）：無

### `src/ui/views/CalendarPage.vue`
- 函數（17）：`accountNameOfTransaction`, `addonDeltaMajor`, `addonDeltaTag`, `dateKeyFromDate`, `dateKeyFromIso`, `formatMinor`, `formatTime`, `goNextMonth`, `goPrevMonth`, `loadMonthTransactions`, `loanTransactionIcon`, `monthKeyFromDate`, `openTx`, `selectDay`, `showAddonDeltaTag`, `txIcon`, `txLabel`
- 變數（16）：`accountStore`, `calendarCells`, `categoryStore`, `currentMonth`, `dailyMap`, `ledgerStore`, `loanStore`, `monthLabel`, `monthTransactions`, `router`, `selectedDateKey`, `selectedDayExpenseMinor`, `selectedDayIncomeMinor`, `selectedDayTransactions`, `uiStore`, `weekLabels`
- 類別（0）：無

### `src/ui/views/IconPickerPage.vue`
- 函數（5）：`buildBaseQuery`, `goBack`, `pick`, `queryText`, `safeNavigate`
- 變數（8）：`currentValue`, `options`, `picking`, `route`, `router`, `scope`, `scopeLabel`, `uiStore`
- 類別（0）：無

### `src/ui/views/TransactionAboutPage.vue`
- 函數（15）：`accountName`, `categoryIcon`, `categoryIconOfTransaction`, `categoryName`, `closeEdit`, `formatTime`, `goBack`, `handleSaved`, `labelOfTransaction`, `load`, `loanTransactionIcon`, `loanTransactionLabel`, `openEdit`, `relationAccountText`, `transactionTypeLabel`
- 變數（19）：`accountStore`, `allTransactions`, `categoryStore`, `editingTx`, `hasAnyRelation`, `isEditOpen`, `ledgerStore`, `loading`, `loanRelated`, `loanStore`, `reimbursementSettledTx`, `reimbursementSourceTx`, `relationRows`, `route`, `router`, `transaction`, `transferRelated`, `txId`, `uiStore`
- 類別（0）：無

### `src/ui/views/TransactionSearchPage.vue`
- 函數（21）：`accountIcon`, `accountName`, `addonDeltaMajor`, `addonDeltaTag`, `categoryIcon`, `categoryName`, `clearTxIdQuery`, `dayEndMs`, `dayStartMs`, `formatTime`, `labelOfTransaction`, `loadTransactions`, `loanTransactionIcon`, `loanTransactionLabel`, `normalizeTxId`, `openEdit`, `parseLocalDateTime`, `pickEndDay`, `pickStartDay`, `showAddonDeltaTag`, `tryOpenPendingTransaction`
- 變數（13）：`accountStore`, `categoryStore`, `endDay`, `filteredTransactions`, `keyword`, `ledgerStore`, `loanStore`, `pendingOpenTxId`, `route`, `router`, `startDay`, `transactions`, `uiStore`
- 類別（0）：無

### `src/ui/views/WelcomePage.vue`
- 函數（5）：`createFirstAccount`, `createFirstLedger`, `goNextStep`, `goPrevStep`, `pickLanguage`
- 變數（15）：`accountCurrencyCodeInput`, `accountGroupNameInput`, `accountNameInput`, `accountStore`, `canCreateAccount`, `canGoNext`, `creatingAccount`, `creatingLedger`, `hasAccounts`, `hasLedgers`, `ledgerNameInput`, `ledgerStore`, `router`, `step`, `uiStore`
- 類別（0）：無

### `src/ui/views/accounts/AccountDetailPage.vue`
- 函數（20）：`addonDeltaMajor`, `addonDeltaTag`, `categoryIconOfTransaction`, `clearIconQuery`, `closeDeleteConfirm`, `confirmRemoveAccountRecord`, `dateKeyOf`, `dateLabelOf`, `formatTime`, `labelOfTransaction`, `loanTransactionIcon`, `loanTransactionLabel`, `openEdit`, `openIconPicker`, `persistPickedIcon`, `queryText`, `refreshTransactions`, `removeAccountRecord`, `saveProfile`, `showAddonDeltaTag`
- 變數（32）：`account`, `accountCurrencyCode`, `accountGroupName`, `accountId`, `accountName`, `accountStore`, `accountTransactions`, `backLink`, `canSave`, `categoryStore`, `currentAccountBalanceMinor`, `deleteConfirmOpen`, `deleting`, `editCurrencyCode`, `editGroupId`, `editIcon`, `editName`, `editOpening`, `groupOptions`, `groupedAccountTransactions`, `iconSaving`, `initializedAccountId`, `isEditMode`, `ledgerStore`, `loanStore`, `openingInvalid`, `refreshing`, `route`, `router`, `saving`, `transactions`, `uiStore`
- 類別（0）：無

### `src/ui/views/accounts/AssetAccountGroupDetailPage.vue`
- 函數（6）：`clampOrder`, `closeDeleteConfirm`, `confirmRemoveGroupRecord`, `moveItem`, `removeGroupRecord`, `saveOrder`
- 變數（15）：`accountStore`, `canSave`, `currentOrder`, `deleteConfirmOpen`, `deleting`, `group`, `groupId`, `groupTypeLabel`, `orderInput`, `orderInvalid`, `parsedOrderInput`, `route`, `router`, `saving`, `uiStore`
- 類別（0）：無

### `src/ui/views/accounts/AssetAccountManagementPage.vue`
- 函數（18）：`accountItemsByGroup`, `addAccount`, `addAccountFromHeader`, `addGroup`, `clearAccountDialogQuery`, `closeAccountDialog`, `closeGroupDialog`, `expandedStateStorageKeyForLedger`, `isGroupExpanded`, `onAccountSortEnd`, `openAccountIconPicker`, `persistExpandedGroupState`, `queryText`, `readExpandedGroupState`, `setAccountItems`, `submitAccountDialog`, `submitGroupDialog`, `toggleGroup`
- 變數（20）：`accountCurrencyCodeInput`, `accountDialogOpen`, `accountIconInput`, `accountItemsMap`, `accountNameInput`, `accountOpeningInput`, `accountOpeningInvalid`, `accountStore`, `accountTargetGroupId`, `expandedGroupIds`, `expandedInitialized`, `expandedStateStorageKey`, `groupDialogOpen`, `groupNameInput`, `groupOptions`, `groupSummaries`, `ledgerStore`, `route`, `router`, `uiStore`
- 類別（0）：無

### `src/ui/views/analysis.vue`
- 函數（7）：`buildBreakdown`, `buildPieStyle`, `loadStatsTransactions`, `monthKeyFromDate`, `openCategoryDetail`, `pickMonth`, `pickYear`
- 變數（26）：`activeBreakdown`, `activeCount`, `activePieStyle`, `activeTotalMinor`, `activeTypeLabel`, `analysisType`, `categoryNameMap`, `categoryStore`, `expenseBreakdown`, `expenseCount`, `expensePalette`, `expensePieStyle`, `expenseTotalMinor`, `incomeBreakdown`, `incomeCount`, `incomePalette`, `incomePieStyle`, `incomeTotalMinor`, `ledgerStore`, `mode`, `printLink`, `router`, `selectedMonth`, `selectedYear`, `statsTransactions`, `uiStore`
- 類別（0）：無

### `src/ui/views/assets.vue`
- 函數（8）：`accountsByGroup`, `balanceOf`, `expandedStateStorageKeyForLedger`, `goLoans`, `isGroupExpanded`, `persistExpandedGroupState`, `readExpandedGroupState`, `toggleGroup`
- 變數（12）：`accountStore`, `balanceMetrics`, `disposableMinor`, `expandedGroupIds`, `expandedInitialized`, `expandedStateStorageKey`, `groupSummaries`, `groupedAccounts`, `ledgerStore`, `liabilityMinor`, `loanStore`, `router`
- 類別（0）：無

### `src/ui/views/budgeting.vue`
- 函數（22）：`categoryName`, `changeMonth`, `closeDeleteDialog`, `closeSheet`, `confirmRemoveItem`, `copyPreviousMonth`, `formatMajor`, `goCurrentMonth`, `isItemOverBudget`, `itemBudgetMinor`, `itemPieStyle`, `itemRemainMinor`, `itemSpentMinor`, `itemUsedPercentLabel`, `itemUsedRatio`, `monthKeyFromDate`, `numberFormatLocale`, `openCreate`, `openEdit`, `removeItem`, `saveItem`, `shiftMonthKey`
- 變數（9）：`budgetStore`, `categoryStore`, `deleteDialogOpen`, `deleteLoading`, `displayMonth`, `editingItem`, `isSheetOpen`, `pendingDeleteItemId`, `uiStore`
- 類別（0）：無
- 補充：月摘要新增保留金額；分類預算列改為整列點擊先開唯讀詳情，再從詳情進入編輯 / 刪除；項目上的日結轉 / 月底結轉 chip 與 `A -> B` 來源 / 目標摘要改成同一行；整月總額預算存款也拆成摘要列 -> 詳情 sheet -> 設定 sheet 三段式流程，來源 / 目標帳戶同樣沿用快速新增的分組式 account picker。

### `src/ui/views/home.vue`
- 函數（12）：`applyMonthInput`, `dateKeyFromDate`, `goCurrentRange`, `localeRangeMonth`, `monthKeyFromDate`, `openQuickAdd`, `pickDay`, `pickMonth`, `pickYear`, `switchFilterMode`, `switchQuickAddMode`, `syncHomeTransactions`
- 變數（14）：`budgetStore`, `currentRangeLabel`, `displayRange`, `filterMode`, `filterModes`, `isSheetOpen`, `ledgerStore`, `quickAddMode`, `quickAddType`, `selectedDay`, `selectedMonth`, `selectedYear`, `transactionStore`, `uiStore`
- 類別（0）：無

### `src/ui/views/loans/LoanCounterpartyDetailPage.vue`
- 函數（10）：`canRepay`, `closeRepaySheet`, `markVoid`, `normalizeCounterpartyName`, `openRepaySheet`, `showDetail`, `statusLabel`, `submitRepayment`, `syncFinishedFromRoute`, `syncTabFromRoute`
- 變數（19）：`accountStore`, `activeCount`, `backLink`, `budgetStore`, `counterpartyName`, `defaultAccountId`, `loanStore`, `loansByCounterpartyAndTab`, `outstandingMinor`, `repayForm`, `repayLoan`, `repayOpen`, `route`, `showFinished`, `summaryLabel`, `tab`, `transactionStore`, `uiStore`, `visibleLoans`
- 類別（0）：無

### `src/ui/views/loans/LoanListPage.vue`
- 函數（7）：`closeCreateSheet`, `createLoan`, `normalizeCounterpartyName`, `openCounterpartyDetail`, `openCreateSheet`, `syncFinishedFromRoute`, `syncTabFromRoute`
- 變數（16）：`accountStore`, `budgetStore`, `counterpartyGroups`, `createForm`, `createOpen`, `defaultAccountId`, `directionOptions`, `loanStore`, `loansByTab`, `route`, `router`, `showFinished`, `tab`, `transactionStore`, `uiStore`, `visibleLoans`
- 類別（0）：無

### `src/ui/views/reimbursements/ReimbursementListPage.vue`
- 函數（6）：`closeSettle`, `confirmSettle`, `formatTime`, `markPending`, `markVoid`, `openSettle`
- 變數（11）：`accountStore`, `activeList`, `copyLedgerOptions`, `isSettleOpen`, `ledgerStore`, `reimbursementStore`, `settleForm`, `settleTargetTx`, `tab`, `transactionStore`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsAboutPage.vue`
- 函數（0）：無
- 變數（1）：`privacyPolicyUrl`
- 類別（0）：無

### `src/ui/views/settings/SettingsAddonTemplatePage.vue`
- 函數（6）：`addItem`, `cloneItems`, `removeItem`, `resetDefaults`, `saveItems`, `syncDraftFromStore`
- 變數（7）：`addonTemplateStore`, `directionOptions`, `draftItems`, `ledgerStore`, `saving`, `seq`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsAutoBackupPage.vue`
- 函數（15）：`backupNowToGoogle`, `backupNowToWebdav`, `connectGoogle`, `connectWebdav`, `disconnectGoogle`, `disconnectWebdav`, `errorMessage`, `formatBackupTime`, `refreshGoogleBackupState`, `refreshWebdavBackupState`, `restoreCheckHint`, `restoreFromGoogle`, `restoreFromWebdav`, `saveGoogleBackupSettings`, `saveWebdavBackupSettings`
- 變數（27）：`googleAutoEnabled`, `googleBackingUpNow`, `googleBackupState`, `googleConnecting`, `googleDataChangeAutoEnabled`, `googleDisconnecting`, `googleIntervalHours`, `googleIntervalOptions`, `googleRestoringNow`, `googleSavingSettings`, `isWorking`, `ledgerStore`, `uiStore`, `webdavAutoEnabled`, `webdavBackingUpNow`, `webdavBackupState`, `webdavConnecting`, `webdavDataChangeAutoEnabled`, `webdavDisconnecting`, `webdavEndpointInput`, `webdavIntervalHours`, `webdavIntervalOptions`, `webdavPasswordInput`, `webdavRemoteDirInput`, `webdavRestoringNow`, `webdavSavingSettings`, `webdavUsernameInput`
- 類別（0）：無

### `src/ui/views/settings/SettingsCategoryDetailPage.vue`
- 函數（6）：`closeDeleteConfirm`, `confirmRemoveCategoryRecord`, `openIconPicker`, `queryText`, `removeCategoryRecord`, `saveProfile`
- 變數（17）：`backLink`, `canSave`, `category`, `categoryId`, `categoryKind`, `categoryStore`, `deleteConfirmOpen`, `deleting`, `editGroupId`, `editIcon`, `editName`, `groupOptions`, `initializedCategoryId`, `route`, `router`, `saving`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsCategoryGroupDetailPage.vue`
- 函數（7）：`clampOrder`, `closeDeleteConfirm`, `confirmRemoveGroupRecord`, `moveItem`, `queryText`, `removeGroupRecord`, `saveOrder`
- 變數（18）：`backLink`, `canSave`, `categoryStore`, `currentOrder`, `deleteConfirmOpen`, `deleting`, `group`, `groupId`, `groupKind`, `groupsByKind`, `kindLabel`, `orderInput`, `orderInvalid`, `parsedOrderInput`, `route`, `router`, `saving`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsCategoryPage.vue`
- 函數（15）：`addCategory`, `addCategoryForGroup`, `addGroup`, `categoriesByGroup`, `categoryItemsByGroup`, `clearCategoryDialogQuery`, `closeCategoryDialog`, `closeGroupDialog`, `groupNameById`, `onCategorySortEnd`, `openCategoryIconPicker`, `queryText`, `setCategoryItems`, `submitCategoryDialog`, `submitGroupDialog`
- 變數（16）：`activeKind`, `categoryDialogOpen`, `categoryGroupIdInput`, `categoryGroupLockedId`, `categoryIconInput`, `categoryItemsMap`, `categoryNameInput`, `categoryStore`, `filteredCategories`, `filteredGroups`, `groupDialogOpen`, `groupNameInput`, `groupOptions`, `route`, `router`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsDataManagementPage.vue`
- 函數（12）：`clearResetTimer`, `closeResetConfirm`, `confirmResetAllData`, `exportCsv`, `exportJson`, `importIntegrityHint`, `onImportCsvFile`, `onImportJsonFile`, `onRequestCloseOverlay`, `openResetConfirm`, `readFileAsText`, `refreshAllStores`
- 變數（18）：`accountStore`, `budgetStore`, `categoryStore`, `csvImportType`, `csvImportTypeOptions`, `csvInputRef`, `isResetConfirmOpen`, `jsonInputRef`, `lastExportPath`, `ledgerStore`, `loanStore`, `reimbursementStore`, `resetConfirmLabel`, `resetCountdown`, `resetTimerId`, `resettingAllData`, `transactionStore`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsDeveloperDebugPage.vue`
- 函數（3）：`formatDuration`, `patchSnapshot`, `refresh`
- 變數（8）：`loading`, `playCalls`, `playSupported`, `snapshot`, `txFailures`, `unsubscribe`, `unsubscribePlayTrace`, `unsubscribeTxFailureTrace`
- 類別（0）：無

### `src/ui/views/settings/SettingsLanguagePage.vue`
- 函數（1）：`pickLanguage`
- 變數（2）：`currentLabel`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsLedgerDetailPage.vue`
- 函數（4）：`closeDeleteConfirm`, `confirmRemoveLedgerRecord`, `removeLedgerRecord`, `saveLedgerName`
- 變數（11）：`canSave`, `deleteConfirmOpen`, `deleting`, `ledger`, `ledgerId`, `ledgerNameInput`, `ledgerStore`, `route`, `router`, `saving`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsLedgerPage.vue`
- 函數（4）：`closeDialog`, `createLedger`, `onLedgerSortEnd`, `submitDialog`
- 變數（7）：`canCreateLedger`, `dialogMode`, `ledgerItems`, `ledgerNameInput`, `ledgerStore`, `showFreeLimitHint`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsMembershipBenefitsPage.vue`
- 函數（8）：`ensureDollarPrefix`, `loadProductPrices`, `openSubscriptionManagement`, `redeemPromoCode`, `refreshMembershipState`, `restorePurchases`, `subscribe`, `toErrorMessage`
- 變數（16）：`canUsePlayStore`, `compareRows`, `currentPlanLabel`, `currentTier`, `isBusy`, `lifetimePriceLabel`, `loadingPrices`, `monthlyPriceLabel`, `openingManage`, `playStoreSupported`, `priceDisplay`, `redeemCode`, `redeeming`, `restoring`, `submittingPlan`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsPersonalizationPage.vue`
- 函數（10）：`applyColor`, `normalizeHex`, `pickPreset`, `pickScheme`, `previewStyleOf`, `resetColor`, `saveTheme`, `schemeDescription`, `schemeName`, `schemePrimaryOf`
- 變數（6）：`initialTheme`, `presets`, `primary`, `schemes`, `selectedSchemeId`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsVersionInfoPage.vue`
- 函數（0）：無
- 變數（1）：`version`
- 類別（0）：無

### `src/ui/views/settings.vue`
- 函數（0）：無
- 變數（1）：`settingItems`
- 類別（0）：無
