# Local-Dev-Quickstart

## 目的
讓維護者可以在本機快速完成：環境安裝、前端/後端啟動、以及常用檢查指令。

## 適用範圍
- 開發中功能/修 bug（前端 Vue、後端 Node）
- 需要本機測試（Node test、Vite build、Playwright suite）

## 操作流程（快速）
### 1) 安裝依賴
```bash
npm install
npm install --prefix frontend
npm install --prefix backend
```

### 2) 啟動
預設連正式後端 API（`https://api.strawmb.com`）：
```bash
npm run dev:frontend
```

若要改打本機後端（`8787`）：
1. 修改 `frontend/.env.development.local`（覆寫 `VITE_SHARED_LEDGER_API_BASE_URL` 與其餘 `VITE_*_API_BASE_URL`）
2. 啟動後端：
```bash
npm run dev:backend
```

### 3) 常用檢查
```bash
npm run test --silent
npm run check --silent
```
（若只要前端 Node 測試：`npm run test:node --prefix frontend`）

## 常見失敗與處理（先用這些定位）
- 啟動時打到正式 API：確認 `.env.development*` 是否有正確覆寫（見「Environment-Variables」）
- 測試失敗：優先看 `frontend/test/*.test.js` 對應來源測試與其期望結構

## 引用來源
- [`README.md`](../../README.md)

