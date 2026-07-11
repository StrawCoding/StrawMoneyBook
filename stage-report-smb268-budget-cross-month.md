# Stage Report: smb268-budget-cross-month

## 變更摘要

- 新增共同預算池支援「套用至月份」建立：只在新建容器時顯示，以目前預算頁 `monthKey` 為起點，結束月為 inclusive。
- 服務層以 `YYYY-MM` 純字串產生跨月 range，支援跨年，並將每個月份 fan-out 成獨立 `budget` / `budget_container`，未新增跨月單筆資料模型。
- 月池維持每月金額；日池維持每日費率，既有 `resolveContainerMonthlyAmountMinor` 仍依各月天數計算。
- 跨月建立會先讀取所有目標月份狀態，預檢月份格式、range 順序、任一月份同名共同預算池衝突，以及日池池層存款與目標分類既有項目存款衝突，再開始寫入。
- 既有共同預算池編輯仍只儲存當月，不會走跨月 range save。
- 補齊繁中、英文、日文 i18n，並更新兩份功能文件與 `release-notes.pending.md`。
- 新增 Node service/source 測試與 `playwright:budget-cross-month` app-shell 驗證腳本。

## 驗證紀錄

- `git diff --check`
  - 結果：0 exit code，無輸出。
- `cd frontend && npm run test:node`
  - 結果：0 exit code。
  - 摘要：`# tests 665`, `# pass 665`, `# fail 0`。
- `cd frontend && npm run build:web`
  - 結果：0 exit code。
  - 摘要：Vite production build completed；仍有既有 dynamic import / chunk size warnings。
- `cd frontend && npm run playwright:budget-cross-month`
  - 結果：0 exit code。
  - 摘要：`Budget cross-month Playwright flow passed`。

## 注意事項

- 未使用 Plane 或 Linear。
- 未執行 `npm run gpr`。
- 未修改版本號，未自行發版。
- 第一次 Playwright 驗證曾暴露測試腳本在預期錯誤後未關閉 bottom sheet，導致後續案例污染；已修正腳本並重跑通過。

## 建議狀態

建議交由 Hermes 依上述證據標記本階段狀態。
