# Testing-And-Verification

## 目的
定義維護者在提交/Release 前的最低驗收流程，確保：
- 對應測試（Node test / source regression）通過
- Web build 正常
- 如改動網頁元件，使用對應 Playwright suite 驗證真實畫面/錯誤碼分流

## 建議的「最低驗收」
### 1) Node 測試（覆蓋你改到的 source/service 合約）
```bash
npm run test:node --prefix frontend
```

### 2) Web Build（確保前端編譯/資產生成正常）
```bash
npm run build:web --prefix frontend
```

### 3) Playwright（若改到頁面元件/路由/錯誤碼呈現）
依改動選擇 suite（下列為常見 bank/載具/版面類）：
```bash
npm run playwright:bank-sync --prefix frontend
npm run playwright:carrier-sync --prefix frontend
npm run playwright:ui-layout --prefix frontend
```

## 如何判斷要跑哪些 Playwright？
- 改到 `frontend/src/ui/views/settings/**`：通常跑 `playwright:ui-layout` + 對應功能 suite（例如 `playwright:bank-sync`）
- 改到 bank/載具同步可用性診斷、錯誤碼 UI：優先跑對應功能 suite（例如 `playwright:bank-sync`）

## 更完整的本地驗收（對齊 CI）
若你想儘量貼近 GitHub Actions 的 gate，可以直接跑：
```bash
npm run check --prefix frontend
```
並視需要補上對應 Playwright suite（同本頁判斷規則）。

## 引用來源（CI 補充）
- GitHub Actions 會用 `CI: true` 與 `PLAYWRIGHT_BROWSERS_PATH` 指定 Playwright browsers 位置（見 [`./.github/workflows/ci.yml`](../../.github/workflows/ci.yml)）。

## 引用來源
- `frontend/package.json` 中的腳本定義（測試/Playwright）：[`frontend/package.json`](../../frontend/package.json)

