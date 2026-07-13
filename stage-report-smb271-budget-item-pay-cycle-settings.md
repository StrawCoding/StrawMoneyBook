# smb271-budget-item-pay-cycle-settings stage report

## 變更

- 在 `BudgetItemSheet.vue` 新增「目前帳本預算期間」設定區，可於新增/編輯一般預算項目時切換曆月/發薪週期並設定每月發薪日。
- 在 `BudgetContainerSheet.vue` 套用同一 UX，讓共同預算池新增/編輯流程也可調整目前帳本的預算期間設定。
- 在 `budgeting.vue` 串接 `ledgerStore.updateBudgetPeriodSettings()`，儲存預算項目/共同池時一併套用帳本層預算期間設定並重新載入目前預算期間。
- 補齊 zh/en/ja i18n 文案，明確說明此設定屬於目前帳本且會影響帳本預算週期，不是單一項目的獨立週期。
- 新增 source regression 覆蓋預算項目與共同池 sheet 入口，以及 budgeting view 的帳本期間設定儲存流程。
- 修復 App 啟動 / 首次載入發薪週期錯誤：`budget.store.js` 的 `loadCurrentPeriod()` 改用完整今日日期 `dateKeyFromDate()` 解析目前發薪週期，避免每月發薪日後仍以該月 1 號載入上一期。
- 修復 web SQLite mutation 後未保存 web store 的問題：`sqlite.js` 在 web 平台資料 mutation 後呼叫 `saveToStore()`，避免建立帳本/帳戶/預算設定後 full reload 又回到 Welcome，並確保 app-shell reload 驗證能反映實際持久化資料。
- 補強資料層 regression：發薪週期下日均 `monthday`、`weekday` 規則與共同日池都使用實際週期日期範圍 / 實際天數，涵蓋跨月、跨年與 29/30/31 短月行為。
- 新增 `sqlite-web-store-source.test.js` 鎖住 web SQLite mutation 後需先保存 store 再發出 mutation event。
- 更新 `frontend/scripts/playwright-budget-pay-cycle.mjs` 的 source contract，並新增 `frontend/scripts/playwright-budget-pay-cycle.spec.mjs` app-shell workflow，覆蓋從新增/編輯一般預算項目與新增共同預算池流程進入週期設定、儲存、首頁預算卡與 reload 後期間範圍。
- 更新 `frontend/StrawMoneyBook_Features_Map.md`、`StrawMoneyBook_App_Features_Detailed.md`、`release-notes.pending.md`。

## 測試

- 已執行 `cd frontend && npm run test:node`：通過，690 tests。
- 已執行 `git diff --check`：通過。
- 已透過 `cd frontend && npm run playwright:budget-pay-cycle` 內建 build 階段執行 `npm run build:web`：通過；僅既有 Vite dynamic/static import 與 chunk size 警告。
- 已執行 `cd frontend && npm run playwright:budget-pay-cycle`：完成 build、preview、source contract 與 app-shell workflow。流程涵蓋：
  - 乾淨資料 onboarding 後進入 `/budget`。
  - 新增一般預算項目時從 sheet 切到發薪週期、設定 25 號並儲存，預算頁顯示 `2026-06-25` 到 `2026-07-24`，首頁預算卡顯示下次發薪日。
  - 重新載入 `/budget` 後仍顯示同一發薪週期範圍。
  - 編輯既有預算項目時從 sheet 切回曆月，預算頁與首頁週期提示消失。
  - 新增共同預算池時從 sheet 切到發薪週期、設定 31 號並儲存，驗證 `2026-06-30` 到 `2026-07-30`、`2026-07-31` 到 `2026-08-30`、`2026-02-28` 到 `2026-03-30`。

## 建議狀態

- 建議交由 Hermes 執行專屬驗證命令與狀態判定。
- 未使用 Plane/Linear，未執行 `npm run gpr`，未改版本號、tag 或發版。
