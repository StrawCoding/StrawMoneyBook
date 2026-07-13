# smb276-payday-change-preserve-budget stage report

## 變更摘要

- 新增 `applyLedgerBudgetPeriodSettings()`：套用新帳本預算期間設定前，先以舊設定解析帳本時區「今天」所在的目前期間並載入其預算結構；套用後再解析新目前期間。若新舊 `period_key` 不同且新期尚無使用者設定內容（無項目、無共同池、無整期預算存款設定），自動 carry-forward 分類項目金額／日均規則、共同池與綁定、整期預算存款設定；已花費依新期日期範圍重算，交易與歷史期間資料不搬移、不覆寫。
- `ledger.store.js` 的 `updateBudgetPeriodSettings` 改走上述服務，帳本詳細設定頁、預算項目 sheet、共同池 sheet 三條入口行為一致。
- 補 Node regression（改發薪日前後、曆月↔發薪切換、短月 29/30/31、新期已有資料不重複 carry-forward）與 `playwright:budget-pay-cycle`（從預算 sheet 改發薪日後仍看得到原項目）。
- 更新 `StrawMoneyBook_App_Features_Detailed.md`、`frontend/StrawMoneyBook_Features_Map.md`、`release-notes.pending.md`。

## 主要檔案

- `frontend/src/core/services/budget.service.js`
- `frontend/src/ui/stores/ledger.store.js`
- `frontend/src/ui/views/budgeting.vue`（沿用既有 `applyBudgetPeriodSettings` 入口，無額外邏輯分叉）
- `frontend/src/ui/views/settings/SettingsLedgerDetailPage.vue`（沿用 ledger store）
- `frontend/test/budget.service.test.js`
- `frontend/test/budget-container-source.test.js`
- `frontend/scripts/playwright-budget-pay-cycle.mjs`
- `frontend/scripts/playwright-budget-pay-cycle.spec.mjs`
- `StrawMoneyBook_App_Features_Detailed.md`
- `frontend/StrawMoneyBook_Features_Map.md`
- `release-notes.pending.md`

## 已執行測試

- `git diff --check`
- `cd frontend && npm run test:node`（705/705）
- `cd frontend && npm run build:web`
- `cd frontend && npm run playwright:budget-pay-cycle`

## 注意事項

- `npm run build:web` 仍顯示既有 Vite chunk size 與 dynamic/static import 警告。
- `playwright:budget-pay-cycle` workflow 通過；console 仍有既有 preview CSP / meta `frame-ancestors` 訊息，未觀察到本階段新增的預算 runtime error。
- 未執行 `npm run gpr`，未手動修改版本號、tag 或發版。

## 建議狀態

- 建議交由 Hermes 進行本階段驗收判定。
