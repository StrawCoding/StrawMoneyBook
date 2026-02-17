# StrawMoneyBook 功能與檔案對應

此文件整理目前 StrawMoneyBook 的主要功能、頁面、元件與資料層對應關係，方便開發與維護。

## 1. 功能總覽

- 多帳本管理（切換帳本、帳本設定）
- 首頁總覽（收支卡、預算卡、交易紀錄、快速新增）
- 首頁功能列表頁（借貸、報銷入口）
- 交易搜尋頁（獨立頁面）
- 預算管理（月預算、分類預算、已用/剩餘）
- 分析頁（收入/支出圓餅圖、統計模式切換、列印頁）
- 資產管理（帳戶餘額、管理模式、資產簡表）
- 借貸管理（借出/借入、還款、作廢）
- 報銷管理（未報銷/已報銷、入帳處理）
- 設定功能（資料管理、修復、分類、帳本、個人化）

## 2. 路由與頁面對應

路由定義檔：`src/ui/router/index.js`

| 路由 | 頁面檔案 | 主要用途 |
|---|---|---|
| `/` | `src/ui/views/home.vue` | 首頁總覽、範圍篩選、快速新增入口 |
| `/budget` | `src/ui/views/budgeting.vue` | 月預算與分類預算管理 |
| `/analysis` | `src/ui/views/analysis.vue` | 圖表分析（全部/年/月） |
| `/analysis/print` | `src/ui/views/AnalysisPrintPage.vue` | 交易報表匯出（Excel） |
| `/transactions/search` | `src/ui/views/TransactionSearchPage.vue` | 交易搜尋（獨立頁） |
| `/features` | `src/ui/views/FeatureListPage.vue` | 首頁功能列表（借貸/報銷入口） |
| `/ai-auto-bookkeeping` | `src/ui/views/AiAutoBookkeepingPage.vue` | AI 記帳對話頁 |
| `/assets` | `src/ui/views/assets.vue` | 帳戶與資產管理 |
| `/assets/accounts` | `src/ui/views/accounts/AssetAccountManagementPage.vue` | 資產帳戶管理 |
| `/icons/pick` | `src/ui/views/IconPickerPage.vue` | 帳戶/分類 icon 選擇獨立頁 |
| `/settings` | `src/ui/views/settings.vue` | 設定首頁 Router Link 入口 |
| `/settings/data-management` | `src/ui/views/settings/SettingsDataManagementPage.vue` | 匯入匯出與資料重設 |
| `/settings/repair` | `src/ui/views/settings/SettingsRepairPage.vue` | 資料修復 |
| `/settings/ledgers` | `src/ui/views/settings/SettingsLedgerPage.vue` | 帳本管理 |
| `/settings/categories` | `src/ui/views/settings/SettingsCategoryPage.vue` | 分類與群組管理 |
| `/settings/personalization` | `src/ui/views/settings/SettingsPersonalizationPage.vue` | 主題色個人化 |
| `/loans` | `src/ui/views/loans/LoanListPage.vue` | 借貸清單、還款、作廢 |
| `/reimbursements` | `src/ui/views/reimbursements/ReimbursementListPage.vue` | 報銷清單、報銷入帳 |
| `/accounts/:id` | `src/ui/views/accounts/AccountDetailPage.vue` | 帳戶明細 |

## 2.1 主要導覽流程

### 底部導覽（`src/ui/components/layout/BottomNav.vue`）

- 首頁：`/`
- 分析：`/analysis`
- 資產：`/assets`
- 設定：`/settings`

### 首頁內導覽（`src/ui/views/home.vue`）

- 快速新增：開啟 `src/ui/components/home/QuickAddSheet.vue`
- 交易搜尋：`/transactions/search`
- 分析頁：`/analysis`
- 功能列表：`/features`

### 設定內導覽（`src/ui/views/settings.vue`）

- 資料管理：`/settings/data-management`
- 資料修復：`/settings/repair`
- 帳本管理：`/settings/ledgers`
- 分類管理：`/settings/categories`
- 個人化：`/settings/personalization`

### 資產與分類導覽

- 資產頁管理入口：`/assets` -> `/assets/accounts`
- 帳戶明細：`/assets` 或 `/assets/accounts` -> `/accounts/:id`
- 分類/帳戶 icon 選擇：`/settings/categories` 或 `/assets/accounts` -> `/icons/pick`

## 3. 首頁功能對應

頁面檔案：`src/ui/views/home.vue`

| 功能 | 主要檔案 |
|---|---|
| 帳本切換 | `src/ui/components/common/LedgerSwitcher.vue` |
| 範圍選擇（全部/年/月/日） | `src/ui/components/common/HomeRangePicker.vue` |
| 當期收支卡 | `src/ui/components/home/HomeAssetSummaryCard.vue` |
| 預算簡表 | `src/ui/components/home/HomeBudgetSummaryCard.vue` |
| 交易清單 | `src/ui/components/home/HomeTransactionFeed.vue` |
| 編輯交易 | `src/ui/components/home/HomeTransactionEditSheet.vue` |
| 快速新增交易 | `src/ui/components/home/QuickAddSheet.vue` |
| 快速新增附加資訊（備註/報銷） | `src/ui/components/home/QuickAddSheet.vue`（懸浮抽屜） |
| 日期時間選擇 | `src/ui/components/common/DateTimePickerField.vue` |
| 交易搜尋頁 | `src/ui/views/TransactionSearchPage.vue` |
| 功能列表頁 | `src/ui/views/FeatureListPage.vue` |

## 4. 分析頁功能對應

頁面檔案：`src/ui/views/analysis.vue`

| 功能 | 主要邏輯來源 |
|---|---|
| mode 切換（全部/年/月） | `analysis.vue` 內部 state + query repo |
| 收入圓餅圖 | `analysis.vue`（分類彙總 + 色盤） |
| 支出圓餅圖 | `analysis.vue`（分類彙總 + 色盤） |
| 右上角列印按鈕 | `analysis.vue` -> `/analysis/print` |
| 交易 Excel 匯出 | `src/ui/views/AnalysisPrintPage.vue` + `src/core/services/export.service.js` |
| 匯出範圍 | `AnalysisPrintPage.vue`（全部/年/月/日/自訂） |

## 5. 導覽與全域 UI

| 功能 | 檔案 |
|---|---|
| App Shell / Router View | `src/ui/App.vue` |
| 底部導覽列 | `src/ui/components/layout/BottomNav.vue` |
| Toast 訊息 | `src/ui/components/common/ToastHost.vue` |
| 全域樣式與動畫 | `src/ui/assets/css/global.css` |
| 入口與 icon 註冊 | `src/main.js` |

## 6. Store（UI 狀態層）對應

目錄：`src/ui/stores/`

| Store | 主要職責 |
|---|---|
| `ledger.store.js` | 活動帳本、帳本切換 |
| `account.store.js` | 帳戶清單與餘額 |
| `category.store.js` | 分類清單、群組、二級分類資料 |
| `transaction.store.js` | 交易載入、新增、更新、刪除、首頁篩選 |
| `budget.store.js` | 月預算與預算項目 |
| `loan.store.js` | 借貸清單、還款、作廢、明細 |
| `reimbursement.store.js` | 報銷列表與報銷狀態處理 |
| `ui.store.js` | 全域 UI 狀態（Toast 等） |

## 7. Service（業務邏輯層）對應

目錄：`src/core/services/`

| Service | 功能 |
|---|---|
| `bootstrap.service.js` | 啟動時初始化資料與 stores |
| `transaction.service.js` | 收入/支出/轉帳/調整建立與編輯驗證 |
| `budget.service.js` | 預算快照、複製上月預算 |
| `loan.service.js` | 借貸建立、還款、作廢 |
| `reimbursement.service.js` | 報銷流程、報銷入帳、隱藏分類處理 |
| `import.service.js` | 匯入 |
| `export.service.js` | 匯出（含交易 Excel） |
| `repair.service.js` | 資料一致性檢查與修復 |
| `seed.service.js` | 種子資料 |

## 8. Repository（資料存取層）對應

目錄：`src/core/repositories/`

| Repository | 資料表/職責 |
|---|---|
| `transaction.repo.js` | 交易查詢、建立、更新、軟刪除 |
| `account.repo.js` | 帳戶清單、餘額計算、封存/刪除 |
| `budget.repo.js` | 預算與預算項目 |
| `category.repo.js` | 分類與分類群組 |
| `ledger.repo.js` | 帳本 |
| `loan.repo.js` | 借貸與還款紀錄 |
| `reimbursement.repo.js` | 報銷單與明細 |
| `counterparty.repo.js` | 往來對象 |
| `settings.repo.js` | 設定 |
| `base.repo.js` | 通用 helper |

## 9. 補充說明（維護建議）

- 前端頁面應優先透過對應 store 操作，不直接在 view 內寫入 DB。
- 業務規則集中在 service 層，若調整規則，優先改 service。
- SQL 與資料結構調整，先改 repository，再檢查對應 store/action。
- 若新增主頁功能，優先考慮：`home.vue` + `HomeTransactionFeed.vue` + `transaction.store.js`。
- 若新增分析維度，優先考慮：`analysis.vue` 與 `transaction.repo.js` 的查詢方法。
- 若調整交易報表欄位或匯出格式，優先考慮：`AnalysisPrintPage.vue` + `export.service.js`。

## 10. 文件更新時機

建議在以下情況同步更新此文件：

- 新增/刪除路由頁面
- 調整主要功能流程（交易、借貸、報銷、預算）
- 變更 store/service/repository 的責任邊界
- 新增重要共用元件（日期選擇器、統計元件等）
