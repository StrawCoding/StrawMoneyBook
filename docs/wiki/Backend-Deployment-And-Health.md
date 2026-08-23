# Backend-Deployment-And-Health

## 目的
記錄後端部署與健康檢查的安全流程，尤其是 native dependency（`better-sqlite3`）必須在 StrawMB runtime 容器內安裝。

## 部署（概念流程）
1. `backend && npm run deploy:copy`
2. 部署腳本會在容器內執行 `deploy-production-install.mjs`，確保 native binding ABI/libc 與 runtime 一致

## 為什麼必須在容器內安裝 native deps
native binding（例如 `better-sqlite3`）同時受 Node ABI 與 libc 影響；若在部署主機上直接 `npm install`，會導致部署窗口期出現：
- `Module did not self-register`
- `NODE_MODULE_VERSION mismatch`
- `ERR_DLOPEN_FAILED`（GLIBC_*）

專案治本做法是：使用 `backend/scripts/deploy-production-install.mjs`，在與 StrawMB runtime 一致的 `1panel/node:<NODE_VERSION>` 容器內安裝，並在同一 image 內驗證 `better-sqlite3` 可載入。

## 健康檢查
- 使用 API：`GET /health`
- 若失敗，先檢查：
  - Node server 是否已啟動
  - 依賴載入錯誤（native binding）
  - 環境變數是否缺失（fail-closed）

### 建議的最短處理順序
1. `backend && npm run deploy:install`
2. 仍不行再檢查容器 native install 的驗證輸出（見 `deploy-production-install.mjs` 的 better-sqlite3 verify）

## 常見故障定位（先跑對腳本）
- 重新執行：`backend && npm run deploy:install`
- 參考 native 安裝治本說明：`backend/scripts/deploy-production-install.mjs`

## 引用來源
- [`backend/package.json`](../../backend/package.json)
- [`backend/scripts/deploy-production-install.mjs`](../../backend/scripts/deploy-production-install.mjs)
- [`./.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

