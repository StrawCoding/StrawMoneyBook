# smb275-current-date-auto-detection stage report

## 變更摘要

- 根因：預算期間的「今天」解析分散在裝置 `Date`、persisted `pay:*` monthKey 與首頁月份篩選之間；發薪週期帳本在首頁 `syncBudgetMonthByHomeFilter()` 會以曆月 `YYYY-MM` / 月初 `YYYY-MM-01` 覆寫 `loadCurrentPeriod()` 剛解析的正確週期，導致跨月尾（尤其發薪日 29/30/31）或隔日仍停在錯誤 period。
- 新增 `dateKeyForLedgerTimeZone` / `monthKeyForLedgerTimeZone` / `resolveCurrentBudgetPeriodForLedger()`，統一以帳本時區決定今天與 active budget period。
- `budget.store.loadCurrentPeriod()` 改走 `resolveCurrentBudgetPeriodForLedger()`；曆月模式遇到 stale `pay:*` key 會回退帳本時區目前曆月，不再 `slice(0, 7)` 產生非法月份。
- `useHomePeriodFilter`：期間選擇改以帳本時區初始化與重置；發薪週期帳本不再由首頁月份篩選呼叫 `loadMonth()`；監聽 `app:budget-period-sync` 在 lifecycle reload 後同步首頁範圍與交易。
- `app-runtime.service`：cold launch 也觸發 `reloadCurrentBudgetPeriodInBackground('app_start')`；reload 成功後廣播 `app:budget-period-sync`。
- `budgeting.vue`：進入預算頁與收到 sync 事件時重新 `loadCurrentPeriod()`。
- 補 Node regression（跨時區、發薪日前/當日/之後、跨月跨年、29/30/31 短月）與 source / Playwright contract 更新。
- 更新 `StrawMoneyBook_App_Features_Detailed.md`、`frontend/StrawMoneyBook_Features_Map.md`、`release-notes.pending.md`。

## 主要檔案

- `frontend/src/core/services/budget.service.js`
- `frontend/src/ui/stores/budget.store.js`
- `frontend/src/ui/services/app-runtime.service.js`
- `frontend/src/ui/composables/useHomePeriodFilter.js`
- `frontend/src/ui/views/budgeting.vue`
- `frontend/test/budget.service.test.js`
- `frontend/test/budget-container-source.test.js`
- `frontend/scripts/playwright-budget-pay-cycle.mjs`
- `StrawMoneyBook_App_Features_Detailed.md`
- `frontend/StrawMoneyBook_Features_Map.md`
- `release-notes.pending.md`

## 已執行測試

- `git diff --check`
- `cd frontend && npm run test:node`：699/699
- `cd frontend && npm run build:web`：完成（既有 chunk size 警告）
- `cd frontend && npm run playwright:budget-pay-cycle`：完成；含 mock 今天、發薪日 rollover、短月 reload、首頁/預算頁 period 與 today 一致

## 注意事項

- 未執行 `npm run gpr`，未修改版本號、tag 或發版。
- Playwright console 仍有既有 preview CSP / meta 訊息；本階段未觸發 `[budget-period] ... failed` gate。
- lifecycle 回到「今天」會重置首頁期間篩選（符合「不可沿用上次瀏覽月份」）；使用者手動選歷史月份後若 App 僅背景再回前景，會自動回到帳本時區今天。

## 建議狀態

- 建議交由 Hermes 執行完整 trigger-verify 驗收判定。
