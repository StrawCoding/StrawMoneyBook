# SMB-272 App 啟動 Invalid time value 修復階段報告

## 摘要
- 根因確認：發薪週期帳本啟動 / reload 後可能保留 `budgetStore.monthKey = pay:YYYY-MM-DD`；首頁期間篩選初始化直接沿用該值當「月份」載入交易，`transaction.repo.js` 的月份 UTC range 對非法月份呼叫 `toISOString()`，造成 `RangeError: Invalid time value`。此路徑會在 app shell / store 載入期間先於完整 route 畫面發生，符合使用者 debug 記錄 routePath 空白的證據。
- 修復：首頁月份篩選只接受 `YYYY-MM`；預算 store / service 可正規解析 persisted `pay:YYYY-MM-DD` 與 `pay:YYYY-MM-DD:YYYY-MM-DD`；交易 repo 對非法年/月/日 key 回空結果，不再讓 `Invalid Date` 進入 `toISOString()`。
- 診斷保留：`error-log.service.js` 的本機 snapshot 補上 `stack` / `info`，保留既有 `message` / `source` / `routePath` / `component`，並同步 `window.__SMB_ERROR_LOG__` 供 app-shell Playwright 驗證啟動期錯誤。

## 變更檔案
- `frontend/src/ui/composables/useHomePeriodFilter.js`
- `frontend/src/ui/stores/budget.store.js`
- `frontend/src/core/services/budget.service.js`
- `frontend/src/core/repositories/transaction.repo.js`
- `frontend/src/ui/services/error-log.service.js`
- `frontend/test/budget.service.test.js`
- `frontend/test/budget-container-source.test.js`
- `frontend/scripts/playwright-budget-pay-cycle.mjs`
- `frontend/scripts/playwright-budget-pay-cycle.spec.mjs`
- `release-notes.pending.md`
- `StrawMoneyBook_App_Features_Detailed.md`
- `frontend/StrawMoneyBook_Features_Map.md`

## 驗證
- `cd frontend && node --test test/budget.service.test.js test/budget-container-source.test.js test/admin-error-log.test.js`：通過，51/51。
- `cd frontend && npm run test:node`：通過，693/693。
- `cd frontend && node --test test/budget.service.test.js test/budget-container-source.test.js`：最後版補充驗證通過，40/40。
- `cd frontend && npm run build:web`：通過；僅既有 Vite dynamic import / chunk size 警告。
- `cd frontend && npm run playwright:budget-pay-cycle`：最後版通過；覆蓋乾淨 web SQLite onboarding、當月、月初、發薪日前後、短月與 reload。新增 `pageerror` / console / `window.__SMB_ERROR_LOG__` evidence 檢查，未出現 `Invalid time value`。
- `git diff --check`：通過。

## 注意事項
- Playwright preview console 仍會記錄既有 CSP 封鎖 app-update 外部 fallback 與 `frame-ancestors` meta 警告；本階段檢查過該 log，與 `Invalid time value` / app runtime exception 無關。
- 未使用 Plane / Linear。
- 未執行 `npm run gpr`，未手動改版本號、tag 或發版。

## 建議狀態
- 建議 Hermes 進行階段驗證與 closeout 判定。
