# StrawMoneyBook 功能與檔案對應

此文件整理目前 StrawMoneyBook 的主要功能、頁面、元件與資料層對應關係，方便開發與維護。

## 1. 功能總覽

- 多帳本管理（切換帳本、帳本設定、帳本資料載入）
- 首頁總覽（收支卡、預算簡表、交易流、快速新增）
- 預算簡表支援月均/日均切換，並可左右滑動切換模式
- 交易查詢（搜尋頁、日曆頁、交易明細頁）
- 快速新增按鈕預設開啟 AI 記帳頁（`/ai-auto-bookkeeping`）
- 預算管理（月預算、分類預算、已用/剩餘）
- 分析頁（收入/支出圖表、分類明細、報表匯出）
- 資產管理（帳戶餘額、帳戶群組、資產簡表）
- 借貸管理（借出/借入、還款、作廢）
- 報銷與請款管理（報銷入帳、請款單建立/完成/匯出）
- 存錢罐與訂閱追蹤
- AI 自動記帳（文字解析 + 會員次數限制）
- 設定功能（資料管理、自動備份、匯率、自動識別、安全鎖、語言、會員）
- 銀行同步（路由與頁面已存在，設定入口目前預設隱藏）

## 2. 路由與頁面對應

路由定義檔：`src/ui/router/index.js`
以下表格列出主要路由（非完整清單）。

| 路由 | 頁面檔案 | 主要用途 |
|---|---|---|
| `/` | `src/ui/views/home.vue` | 首頁總覽、範圍篩選、快速新增 |
| `/budget` | `src/ui/views/budgeting.vue` | 月預算與分類預算管理 |
| `/analysis` | `src/ui/views/analysis.vue` | 收支圖表分析（全部/年/月） |
| `/analysis/category` | `src/ui/views/AnalysisCategoryDetailPage.vue` | 分類分析明細 |
| `/analysis/print` | `src/ui/views/AnalysisPrintPage.vue` | 交易報表頁（CSV 匯出） |
| `/transactions/search` | `src/ui/views/TransactionSearchPage.vue` | 交易搜尋 |
| `/transactions/quick-add` | `src/ui/views/QuickAddPage.vue` | 快速新增（獨立頁） |
| `/transactions/calendar` | `src/ui/views/CalendarPage.vue` | 交易日曆 |
| `/transactions/:id` | `src/ui/views/TransactionAboutPage.vue` | 交易明細（含退款/關聯） |
| `/features` | `src/ui/views/FeatureListPage.vue` | 功能列表入口頁 |
| `/ai-auto-bookkeeping` | `src/ui/views/AiAutoBookkeepingPage.vue` | AI 記帳頁 |
| `/assets` | `src/ui/views/assets.vue` | 資產總覽 |
| `/icons/pick` | `src/ui/views/IconPickerPage.vue` | 帳戶/分類 icon 選擇 |
| `/assets/accounts` | `src/ui/views/accounts/AssetAccountManagementPage.vue` | 資產帳戶管理 |
| `/assets/account-groups/:id` | `src/ui/views/accounts/AssetAccountGroupDetailPage.vue` | 帳戶群組管理 |
| `/accounts/:id` | `src/ui/views/accounts/AccountDetailPage.vue` | 帳戶明細 |
| `/loans` | `src/ui/views/loans/LoanListPage.vue` | 借貸清單 |
| `/loans/counterparty` | `src/ui/views/loans/LoanCounterpartyDetailPage.vue` | 依往來對象檢視借貸明細 |
| `/loans/:id` | `src/ui/views/loans/LoanDetailPage.vue` | 借貸明細 |
| `/reimbursements` | `src/ui/views/reimbursements/ReimbursementListPage.vue` | 報銷清單 |
| `/reimbursements/:id/edit` | `src/ui/views/reimbursements/ReimbursementEditPage.vue` | 報銷明細編輯/入帳 |
| `/claim-sheets` | `src/ui/views/claims/ClaimSheetListPage.vue` | 請款單清單與匯出 |
| `/savings-jars` | `src/ui/views/savings-jars/SavingsJarListPage.vue` | 存錢罐管理 |
| `/subscriptions` | `src/ui/views/subscriptions/SubscriptionListPage.vue` | 訂閱追蹤 |
| `/settings` | `src/ui/views/settings.vue` | 設定首頁 |
| `/settings/data-management` | `src/ui/views/settings/SettingsDataManagementPage.vue` | 匯入/匯出/重設 |
| `/settings/auto-backup` | `src/ui/views/settings/SettingsAutoBackupPage.vue` | Google / WebDAV 自動備份 |
| `/settings/exchange-rate` | `src/ui/views/settings/SettingsExchangeRatePage.vue` | 匯率同步 |
| `/settings/bank-sync` | `src/ui/views/settings/SettingsBankSyncPage.vue` | 銀行同步管理 |
| `/settings/bank-sync/new` | `src/ui/views/settings/SettingsBankSyncCreatePage.vue` | 新增銀行連線 |
| `/settings/ledgers` | `src/ui/views/settings/SettingsLedgerPage.vue` | 帳本管理 |
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
| `/settings/about` | `src/ui/views/settings/SettingsAboutPage.vue` | 關於我們 |
| `/settings/version-info` | `src/ui/views/settings/SettingsVersionInfoPage.vue` | 版本資訊 |
| `/settings/developer-debug` | `src/ui/views/settings/SettingsDeveloperDebugPage.vue` | 開發除錯資訊頁 |

## 2.1 主要導覽流程

### 底部導覽（`src/ui/components/layout/BottomNav.vue`）

- 首頁：`/`
- 分析：`/analysis`
- 資產：`/assets`
- 設定：`/settings`

### 首頁內導覽（`src/ui/views/home.vue`）

- 快速新增：導向 `/ai-auto-bookkeeping`（預設）
- 功能列表：`/features`
- 交易搜尋：`/transactions/search`
- 分析頁：`/analysis`

### 設定內導覽（`src/ui/views/settings.vue`）

- 帳本管理：`/settings/ledgers`
- 分類管理：`/settings/categories`
- 附加項目：`/settings/addon-templates`
- 自動識別：`/settings/auto-fill-rules`
- 匯率同步：`/settings/exchange-rate`
- 資料管理：`/settings/data-management`
- 自動備份：`/settings/auto-backup`
- 語言：`/settings/language`
- 個人化：`/settings/personalization`
- 安全鎖：`/settings/security`
- 會員權益：`/settings/membership-benefits`
- 關於我們：`/settings/about`
- 版本資訊：`/settings/version-info`
- 銀行同步：`/settings/bank-sync`（目前由 `SHOW_BANK_SYNC_ENTRY = false` 控制為隱藏入口）
- 開發除錯：`/settings/developer-debug`（目前不在設定入口清單）

### 功能列表導覽（`src/ui/views/FeatureListPage.vue`）

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
| 快速新增交易 | `src/ui/views/QuickAddPage.vue` |
| 快速新增附加資訊（備註/報銷/附加項目） | `src/ui/views/QuickAddPage.vue`（頁面內） |
| 日期時間選擇 | `src/ui/components/common/DateTimePickerField.vue` |
| 交易搜尋頁 | `src/ui/views/TransactionSearchPage.vue` |
| 交易日曆頁 | `src/ui/views/CalendarPage.vue` |
| 功能列表頁 | `src/ui/views/FeatureListPage.vue` |

## 4. 分析頁功能對應

頁面檔案：`src/ui/views/analysis.vue`

| 功能 | 主要邏輯來源 |
|---|---|
| mode 切換（全部/年/月） | `analysis.vue` 內部 state + query repo |
| 收入圓餅圖 | `analysis.vue`（分類彙總 + 色盤） |
| 支出圓餅圖 | `analysis.vue`（分類彙總 + 色盤） |
| 分類明細頁 | `analysis.vue` -> `/analysis/category` + `AnalysisCategoryDetailPage.vue` |
| 右上角列印按鈕 | `analysis.vue` -> `/analysis/print` |
| 交易 CSV 匯出 | `src/ui/views/AnalysisPrintPage.vue` + `src/core/services/export.service.js` |
| 匯出範圍 | `AnalysisPrintPage.vue`（全部/年/月/日/自訂） |

## 5. 導覽與全域 UI

| 功能 | 檔案 |
|---|---|
| App Shell / Router View | `src/ui/App.vue` |
| 啟動時背景 Google 靜默登入（備份用途） | `src/ui/App.vue` + `src/services/google/auth.js` |
| 安全鎖遮罩與前景驗證 | `src/ui/App.vue` + `src/ui/services/security-lock.service.js` |
| 底部導覽列 | `src/ui/components/layout/BottomNav.vue` |
| App 內返回與 fallback 邏輯 | `src/ui/services/navigation-back.service.js` |
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
| `transaction.store.js` | 交易載入、新增、更新、刪除、首頁篩選與關聯刷新 |
| `budget.store.js` | 月預算與預算項目 |
| `loan.store.js` | 借貸清單、還款、作廢、明細 |
| `reimbursement.store.js` | 報銷列表與報銷狀態處理 |
| `addon-template.store.js` | 附加項目模板讀取與快取 |
| `ui.store.js` | 全域 UI 狀態（Toast 等） |

## 7. Service（業務邏輯層）對應

核心目錄：`src/core/services/`

| Service | 功能 |
|---|---|
| `bootstrap.service.js` | 啟動時初始化資料與 stores |
| `transaction.service.js` | 收入/支出/轉帳/退款建立、編輯驗證、刪除關聯交易（報銷/退款） |
| `budget.service.js` | 預算快照、複製上月預算 |
| `loan.service.js` | 借貸建立、還款、作廢 |
| `reimbursement.service.js` | 報銷流程、報銷入帳、隱藏分類處理 |
| `savings-jar.service.js` | 存錢罐存提與目標管理 |
| `subscription-tracker.service.js` | 訂閱追蹤與期別處理 |
| `ai-bookkeeping.service.js` | AI 記帳語意解析與建議 |
| `ai-bookkeeping-tiny-ner.service.js` | AI 記帳輕量關鍵詞/實體抽取 |
| `membership.service.js` | 會員等級、限制與 Google Play 狀態同步 |
| `google-play-billing.service.js` | Google Play 方案查詢、購買、恢復、兌換 |
| `import.service.js` | 匯入 |
| `export.service.js` | 匯出（CSV / Spreadsheet XML / 檔案落地） |
| `repair.service.js` | 資料一致性檢查與修復 |
| `seed.service.js` | 種子資料 |

UI 服務目錄：`src/ui/services/`

| Service | 功能 |
|---|---|
| `google-backup.service.js` | Google Drive AppData 備份連線、自動備份、還原 |
| `webdav-backup.service.js` | WebDAV 備份連線、自動備份、還原 |
| `addon-template.service.js` | 附加項目模板預設值與保存 |
| `bank-sync.service.js` | 銀行同步前端流程（憑證加密封裝、同步/匯入） |
| `ai-loan-intent.service.js` | AI 借貸語意到借貸交易動作的轉換 |
| `auto-fill-rule.service.js` | 自動識別規則 CRUD |
| `exchange-rate.service.js` | 匯率同步資料流程 |
| `home-widget.service.js` | Android 首頁小工具摘要同步 |
| `navigation-back.service.js` | App 內返回可達性與 fallback 判定 |
| `secure-setting.service.js` | 敏感設定值加密儲存（AES-GCM） |
| `security-lock.service.js` | 生物辨識/系統憑證安全鎖整合 |
| `theme.service.js` | 主題色、配色方案與字體縮放套用 |
| `app-update.service.js` | App 版本檢查與商店連結 |
| `i18n.service.js` | 多語系文案管理 |

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
| `savings-jar.repo.js` | 存錢罐資料 |
| `bank-sync.repo.js` | 銀行連線與同步設定 |
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
- 若調整交易刪除邏輯，需同步檢查 `transaction.service.js` 的關聯刪除（退款/報銷）。
- 若調整 App 開啟流程，需同步檢查 `App.vue`、`google/auth.js` 與備份 service 的靜默登入流程。
- 若調整銀行同步入口，需同步檢查 `settings.vue` 的 `SHOW_BANK_SYNC_ENTRY` 與 `/settings/bank-sync` 路由可達性。

## 10. 文件更新時機

建議在以下情況同步更新此文件：

- 新增/刪除路由頁面
- 調整主要功能流程（交易、借貸、報銷、請款、預算、備份）
- 變更 store/service/repository 的責任邊界
- 新增重要共用元件（日期選擇器、統計元件、首頁卡片等）
- 設定入口策略變更（例如：銀行同步顯示/隱藏）

## 11. 變數與函數索引（檔案層級）

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

### `scripts/bump-android-version-code.mjs`
- 函數（0）：無
- 變數（7）：`currentCode`, `match`, `nextCode`, `pattern`, `source`, `targetPath`, `updated`
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
- 函數（21）：`addTransaction`, `addTransfer`, `countReimbursableTransactions`, `dayRangeUtc`, `findReimbursementSettlementIncomeTx`, `findTransactionById`, `findTransactionRecordById`, `listAllTransactions`, `listRecentTransactions`, `listReimbursementTransactions`, `listTransactionsByAccount`, `listTransactionsByDay`, `listTransactionsByMonth`, `listTransactionsByYear`, `listTransferTransactionsByGroup`, `markTransactionReimbursed`, `monthRangeUtc`, `softDeleteTransactionById`, `softDeleteTransferGroup`, `updateTransactionById`, `yearRangeUtc`
- 變數（0）：無
- 類別（0）：無

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

### `src/ui/components/home/HomeTransactionEditSheet.vue`
- 函數（34）：`addAddonRow`, `addonLabelOf`, `addonOptionIdByLabel`, `addonTotalDeltaMajorFromNote`, `applyOperator`, `closeCategoryPicker`, `closeDeleteConfirm`, `collectAppliedAddonItems`, `confirmRemove`, `createAddonRow`, `defaultAddonOption`, `defaultCategoryId`, `ensureInCategories`, `evaluateExpression`, `formatAmountInput`, `handleAmountInput`, `isFormulaExpression`, `isOperator`, `onAddonOptionChange`, `onRequestCloseOverlay`, `openCategoryPicker`, `parseAddonRowsFromNote`, `pickCategory`, `precedence`, `pressCalcKey`, `remove`, `removeAddonRow`, `round2`, `setCategoryPickerParent`, `submit`, `syncAmountFromInput`, `syncCategoryPickerParent`, `toDateInput`, `toOccurredAtIso`
- 變數（27）：`accountStore`, `addonDirectionOptions`, `addonOptions`, `addonOptionsByType`, `addonRows`, `addonSeq`, `addonTemplateStore`, `calcKeys`, `categoryPickerChildren`, `categoryPickerGroups`, `categoryPickerParentId`, `categoryStore`, `deleteConfirmOpen`, `deleting`, `emit`, `hasVisibleCategories`, `model`, `props`, `selectedCategoryIcon`, `selectedCategoryLabel`, `showCategory`, `showCategoryPicker`, `showExtra`, `transactionStore`, `types`, `uiStore`, `visibleCategoryGroups`
- 類別（0）：無

### `src/ui/components/home/HomeTransactionFeed.vue`
- 函數（13）：`accountNameOfTransaction`, `addonDeltaMajor`, `addonDeltaTag`, `categoryIconOfTransaction`, `dateKeyOf`, `dateLabelOf`, `formatTime`, `labelOf`, `labelOfTransaction`, `loanTransactionIcon`, `loanTransactionLabel`, `openEdit`, `showAddonDeltaTag`
- 變數（7）：`accountStore`, `categoryStore`, `groupedRecentTransactions`, `loanStore`, `monthLabel`, `router`, `transactionStore`
- 類別（0）：無

### `src/ui/components/home/QuickAddSheet.vue`
- 函數（45）：`accountNameById`, `addAddonRow`, `addonDirectionByOptionId`, `addonLabelOf`, `addonOptionIdByLabel`, `applyAiDraft`, `applyOperator`, `categoryNameById`, `closeCategoryPicker`, `collectAppliedAddonItems`, `createAddonRow`, `defaultAccountId`, `defaultAddonTemplate`, `defaultOccurredDateTime`, `defaultPeerAccountId`, `ensureCategoryIdByType`, `ensureValidAccounts`, `evaluateExpression`, `formatAmountInput`, `formatDateInput`, `formatOccurredAtLabel`, `goEditCreatedTransaction`, `handleAmountInput`, `isFormulaExpression`, `isOperator`, `monthKeyFromDate`, `normalizeType`, `onAddonOptionChange`, `onRequestCloseOverlay`, `openCategoryPicker`, `parseAddonRowsFromAiDraft`, `parseWithAi`, `pickCategory`, `precedence`, `pressCalcKey`, `pushAiMessage`, `removeAddonRow`, `resolveTypeByCategory`, `round2`, `setCategoryPickerParent`, `submit`, `syncAmountFromInput`, `syncCategoryPickerParent`, `toOccurredAtIso`, `toggleAiVoiceInput`
- 變數（46）：`accountStore`, `addonDirectionOptions`, `addonRows`, `addonSeq`, `addonTemplateItems`, `addonTemplateOptions`, `addonTemplateStore`, `aiAutoCreating`, `aiCreatedRecord`, `aiInput`, `aiInterimSpeechText`, `aiMessageSeq`, `aiMessages`, `aiOccurredAtLabel`, `aiResultAccountId`, `aiResultAccountText`, `aiResultAmountMajor`, `aiResultCategoryId`, `aiResultIcon`, `aiResultOccurredAtLabel`, `aiResultPeerAccountId`, `aiResultSignedAmount`, `aiResultTitle`, `aiResultType`, `budgetStore`, `calcKeys`, `categoryPickerChildren`, `categoryPickerGroups`, `categoryPickerParentId`, `categoryStore`, `emit`, `equalShowsDone`, `hasAiInputText`, `hasVisibleCategories`, `isAiMode`, `model`, `props`, `router`, `selectedCategoryIcon`, `selectedCategoryLabel`, `showCategoryPicker`, `showExtra`, `transactionStore`, `types`, `uiStore`, `visibleCategoryGroups`
- 類別（0）：無

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
