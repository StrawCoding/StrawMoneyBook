# Troubleshooting

## 目的
把最常見的失敗症狀與對應的「驗證指令/檢查順序/處理步驟」整理成操作型內容。

## 常見問題（先列分類，細節在下一輪填充）
### 測試通過但 UI 不符合預期
- 優先跑：`npm run playwright:ui-layout --prefix frontend`
- 再跑：對應功能 suite（例如 `playwright:bank-sync`）

### Playwright browsers/session 問題
- 若 CI 失敗，對照 `.github/workflows/ci.yml` 的 `PLAYWRIGHT_BROWSERS_PATH` 設定

### Android 初始化失敗（native binding/SQLite）
- 對照：`backend/scripts/deploy-production-install.mjs` 的治本策略（必須在 runtime 容器內安裝）

### bank-sync 可用性診斷誤判
- 以 `playwright:bank-sync` 驗證 seeded review / 錯誤碼分流
- 以 Node source regression 確認合約/錯誤碼分類未被破壞

## 症狀→可能原因→驗證指令→處理步驟（操作型）
### A) CI 擋在 `release:sync-check`
- 症狀：workflow 明確指出 `frontend/package.json` version 與最新 `v*` tag 不一致
- 可能原因：人工改版本但沒走 `gpr`；或 tag/commit 對不上
- 驗證指令：
```bash
cd frontend
npm run release:sync-check
```
- 處理步驟：回到 release 流程使用 `npm run gpr`（不要再手動改 tag/version）

### B) Android/Wear unit tests 或啟動驗證失敗（native binding）
- 症狀：native binding 載入錯誤（ABI/libc mismatch 類）
- 可能原因：`better-sqlite3` 等 native deps 未在 runtime 容器內安裝
- 驗證指令（對照腳本邏輯）：
  - 參考 [`backend/scripts/deploy-production-install.mjs`](../../backend/scripts/deploy-production-install.mjs)
- 處理步驟：重跑 `backend && npm run deploy:copy`（讓 native deps 在容器內重建並驗證）

### C) Playwright 報錯找不到 browsers 或瀏覽器路徑錯誤
- 症狀：Playwright 無法找到 browser bundle / session 行為異常
- 可能原因：本機/CI 的 `PLAYWRIGHT_BROWSERS_PATH` 沒指到已安裝的位置
- 驗證指令（本機）：
```bash
cd backend
npm run playwright:install-browsers
```
- 處理步驟：確認環境變數 `PLAYWRIGHT_BROWSERS_PATH` 指向安裝目錄後再跑對應 suite

## 引用來源
- [`./.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`backend/scripts/deploy-production-install.mjs`](../../backend/scripts/deploy-production-install.mjs)
- [`docs/release-checklist.md`](../release-checklist.md)

