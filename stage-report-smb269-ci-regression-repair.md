# SMB-269 CI Regression Repair Stage Report

## 變更

- 讀取 GitHub Actions run `29203598538` 摘要，失敗點為 frontend job 的 `npm run check`；`gh run view --log-failed` 與 job log 未提供可用失敗細節。
- 修復 `frontend/src/core/services/budget.service.js` 發薪週期 / 預算 snapshot 查詢範圍依 process timezone 漂移的問題：
  - 新增帳本讀取 dependency，snapshot 以帳本 `timezone` 正規化期間查詢。
  - `dateRangeUtc()` 與 `monthRangeUtc()` 改用指定時區轉 UTC，不再依執行環境本地時區。
  - `todayRangeUtc()` 同步改用帳本時區，今日花費查詢與期間查詢一致。
- 補強 SMB-269 回歸測試：
  - 發薪日當天歸入新週期，下次發薪日前一天仍歸入前一週期。
  - `dateRangeUtc()` 在 Asia/Taipei 與 UTC runner 下輸出可預期 UTC 範圍。
  - 發薪週期下日均項目與共同日池保留金額計算至 inclusive 期末。
  - 發薪週期共同日池預算存款僅在期末後結算，且使用整期帳本時區 UTC 查詢範圍。
- 更新 `release-notes.pending.md` v1.3.58 header 下的 pending note。
- 更新兩份功能文件：
  - `StrawMoneyBook_App_Features_Detailed.md`
  - `frontend/StrawMoneyBook_Features_Map.md`

## 測試

- `cd frontend && node --test test/budget.service.test.js test/budget-reserve.service.test.js test/budget-save.service.test.js`
  - 39 tests completed。
- `cd frontend && npm run check`
  - `npm run test:node`: 682 tests completed。
  - `npm run build:web`: completed。
- `git diff --check`
  - 無輸出。

## 建議狀態

- 建議由 Hermes 依原 trigger-verify 流程重新執行正式驗證與 CI。
- 本階段未讀寫 Plane / Linear，未執行 `npm run gpr`，未改版本號，未打 tag，未發版。
