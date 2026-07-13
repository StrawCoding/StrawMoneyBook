# smb274-budget-period-runtime-verification stage report

## 變更摘要

- 讀取 `frontend/.playwright-cli/console-2026-07-13T11-41-32-240Z.log`，確認第 141-149 行的 `budgets.ledger_id, budgets.period_key` 唯一鍵錯誤由 app-shell `visibilitychange` 背景 reload 觸發。
- 根因為 `ensureBudgetForPeriod()` 的查詢後建立不是原子操作；focus 與 visibility 可同時載入尚未建立的發薪週期，兩個請求都嘗試插入同一 `(ledger_id, month_key)`。
- `ensureBudgetForPeriod()` 現在只在同期間唯一鍵衝突時重新查詢並使用已建立的 budget；若查不到資料或遇到其他資料庫錯誤，仍保留原本錯誤行為。
- 新增並行 pay-cycle snapshot Node regression，模擬一個請求先建立、另一個請求收到 SQLite unique constraint 的時序。
- `playwright:budget-pay-cycle` 現在會把 `[budget-period] ... failed` console warning 視為 runtime failure，防止背景錯誤被既有 pageerror-only 檢查漏掉。
- 更新功能詳細文件、功能地圖與 pending release note。

## 主要檔案

- `frontend/src/core/services/budget.service.js`
- `frontend/test/budget.service.test.js`
- `frontend/scripts/playwright-budget-pay-cycle.spec.mjs`
- `StrawMoneyBook_App_Features_Detailed.md`
- `frontend/StrawMoneyBook_Features_Map.md`
- `release-notes.pending.md`

## 已執行測試

- `git diff --check`
- `cd frontend && node --test test/budget.service.test.js`：28/28
- `cd frontend && npm run test:node`：695/695
- `cd frontend && npm run build:web`：完成
- `cd frontend && npm run playwright:budget-pay-cycle`：完成；涵蓋 app-shell focus / visibility 的發薪日 rollover，未觸發 `[budget-period] ... failed` gate。

## 注意事項

- `npm run build:web` 仍顯示既有 Vite dynamic/static import 與 chunk size 警告。
- Playwright console 仍有既有 preview CSP / meta `frame-ancestors` 訊息；本階段新增的 budget-period runtime warning gate 未觸發。
- 未執行 `npm run gpr`，未修改版本號、tag 或發版。

## 建議狀態

- 建議交由 Hermes 進行本階段驗收判定。
