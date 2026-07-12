# Stage Report: smb268-budget-item-cross-month

## 變更摘要

- 一般分類預算項目新建流程支援「套用至月份」：只在新增項目時顯示，以目前預算頁 `monthKey` 為起點，結束月為 inclusive，支援跨年。
- 服務層 `saveBudgetItemRange` 會將新分類預算 fan-out 成每個目標月份各自獨立的正常 `budget_item`，不新增跨月彙總資料模型。
- 跨月項目建立保留金額模式、日期日均規則、預算存款設定與未入池 / 同名共同預算池對應；既有項目編輯因帶 `id` 只會修改目前月。
- 寫入前會完整預檢每個目標月份；同分類預算已存在、目標月缺少同名共同預算池、預算存款父子衝突或月份範圍無效時都會阻擋，避免 partial write。
- 補齊繁中、英文、日文 i18n、Node service 測試、`playwright:budget-cross-month` app-shell 一般項目流程，並更新兩份功能文件與 `release-notes.pending.md`。
- 本輪另補強 Node 回歸：入池一般項目跨月時每月對應同名共同池 id，且目標月缺同名池時零寫入。
- 本輪將 `playwright:budget-cross-month` 改為 preview runner + 單一 `playwright-cli run-code` flow，避免逐步 CLI eval/click 在環境中卡住；流程仍覆蓋共同池與一般項目跨月、跨年、無效範圍、衝突零寫入、編輯單月。

## 驗證紀錄

- `git diff --check`
  - 結果：0 exit code，無輸出。
- `cd frontend && npm run test:node`
  - 結果：0 exit code。
  - 摘要：`# tests 673`, `# pass 673`, `# fail 0`。
- `cd frontend && npm run build:web`
  - 結果：0 exit code。
  - 摘要：Vite production build completed；仍有既有 dynamic import / chunk size warnings。
- `cd frontend && npm run playwright:budget-cross-month`
  - 結果：0 exit code。
  - 摘要：`Budget cross-month Playwright flow passed`；flow 最終停在 `http://127.0.0.1:4176/budget`，Playwright CLI 回報 app console 既有 errors/warnings log，但無 flow assertion error。

## 注意事項

- 未使用 Plane 或 Linear。
- 未執行 `npm run gpr`。
- 未修改版本號，未自行發版。

## 建議狀態

建議交由 Hermes 依上述證據標記本階段狀態。
