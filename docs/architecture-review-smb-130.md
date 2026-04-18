# SMB-130 架構審查與收斂方向

本文件記錄 `SMB-130` 實作前確認的結構性問題，作為本次重構的邊界與驗收依據。

## 已確認問題

### 1. `core -> ui` 反向依賴

- `frontend/src/core/services/bootstrap.service.js` 直接依賴 Pinia store。
- `frontend/src/core/services/membership.service.js` 直接依賴 router 並在 domain 層做導頁 side effect。
- 這讓 `core` 無法單獨測試，也讓 UI 層與商業邏輯層的責任邊界變得模糊。

### 2. View 直接碰 repository / core service

- `analysis.vue`、`AnalysisCategoryDetailPage.vue`、`CalendarPage.vue`、`TransactionSearchPage.vue`、`TransactionAboutPage.vue`、`TransactionEditPage.vue`、`accounts/AccountDetailPage.vue` 直接查 `transaction.repo`。
- 查詢策略分散在頁面內，造成交易資料流沒有單一入口，也使頁面同時承擔查詢、聚合、顯示三種責任。

### 3. 啟動鏈與 runtime side effects 過度集中

- `frontend/src/main.js` 同時負責 App 建立、SQLite 初始化、bootstrap、背景同步、Android 返回鍵、備份排程、widget 同步、shared ledger / Google Drive sync、membership warmup。
- 這讓啟動流程難以測試，也讓新增跨頁 runtime 能力時只能繼續把邏輯堆進 entrypoint。

### 4. Ledger lifecycle 協調混在 store

- `frontend/src/ui/stores/ledger.store.js` 除了帳本清單與 active ledger 狀態，還負責 cross-store reset、reload、資料修復與 onboarding 預設值流程。
- Store 既是 state owner，又是跨模組 runtime coordinator，責任過重。

### 5. 分析頁與交易搜尋頁函式過胖

- `analysis.vue` 同時處理 query、統計、配色、pie/bar/time-bar 計算與導頁。
- `TransactionSearchPage.vue` 同時處理 query sync、搜尋、批量選取、批量編輯、summary 與 UI state。
- 這些頁面雖然能工作，但修改時很難局部驗證，回歸風險高。

### 6. 後端 route 入口過胖

- `backend/src/routes/auth.js` 與 `backend/src/routes/shared-ledgers.js` 把 route dispatch、request parsing、domain orchestration、error mapping 都放在同一檔。
- `backend/src/server.js` 也維持一長串 prefix if/else，擴充與測試都不理想。

### 7. 測試中存在過多 source-level assertions

- 目前有多個 `*-source.test.js` 直接檢查檔案內字串、函式名或 CSS 片段。
- 這類測試對重構極度敏感，但對使用者行為保護有限，會把重構成本放大到不合理程度。

## 本次收斂原則

- 不改資料表 schema。
- 不改既有前後端 API 路徑與 response shape。
- 先把責任邊界拉正，再做局部檔案瘦身。
- 能改成行為測試的區塊，不再新增 source-level 測試。
- 以「能落地、風險可控、可持續擴充」為優先，不為了抽象而抽象。
