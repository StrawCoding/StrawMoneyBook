# smb273-payday-budget-rollover stage report

## 變更摘要

- 預算目前週期改以帳本時區的「今天」解析，避免瀏覽器或 CI 執行環境時區造成發薪日邊界誤判。
- App runtime 在 Android 回前景、window focus、visibility 回 visible 時重新呼叫 `budgetStore.loadCurrentPeriod()`，避免背景跨日、頁面 reload 或重新啟動後停留在 stale period state。
- Playwright pay-cycle workflow 新增前一天 `2026-07-30T23:59:00+08:00` 仍維持舊期、發薪日 `2026-07-31T00:00:00+08:00` 自動切到新期的驗證，並覆蓋預算頁與首頁預算卡。
- Node regression 補上發薪日 29/30/31 遇短月與跨年案例，鎖定發薪日當天含起始日、前一天仍屬上一期。
- 更新功能文件與 pending release note，說明發薪週期自動 rollover、生命週期重新解析，以及既有曆月與歷史預算資料不搬移。

## 主要檔案

- `frontend/src/ui/stores/budget.store.js`
- `frontend/src/ui/services/app-runtime.service.js`
- `frontend/test/budget.service.test.js`
- `frontend/test/budget-container-source.test.js`
- `frontend/scripts/playwright-budget-pay-cycle.mjs`
- `frontend/scripts/playwright-budget-pay-cycle.spec.mjs`
- `StrawMoneyBook_App_Features_Detailed.md`
- `frontend/StrawMoneyBook_Features_Map.md`
- `release-notes.pending.md`

## 已執行測試

- `git diff --check`
- `cd frontend && npm run test:node`
- `cd frontend && npm run build:web`
- `cd frontend && npm run playwright:budget-pay-cycle`

## 注意事項

- `npm run build:web` 仍顯示既有 Vite chunk size 與 dynamic/static import 警告。
- `npm run playwright:budget-pay-cycle` workflow 通過；console summary 仍包含既有 preview CSP / meta `frame-ancestors` 瀏覽器訊息，未觀察到本階段新增的預算 runtime error。
- 未執行 `npm run gpr`，未手動修改版本號、tag 或發版。

## 建議狀態

- 建議交由 Hermes 進行本階段驗收判定。
