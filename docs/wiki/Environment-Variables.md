# Environment-Variables

## 目的
整理本專案使用的環境變數命名規則、用途與建議覆寫方式，避免：
- 把 secret 值提交到 Git
- 在部署/CI 時因環境變數缺失導致 fail-closed 行為

## 適用範圍
- 本機開發（frontend/backend）
- CI / Playwright（以 workflow 為準）
- 需要 debug/觀察 bank-sync/載具同步行為時

## 你要使用的檔案
- 前端範本：[`frontend/.env.example`](../../frontend/.env.example)
- 後端範本：[`backend/.env.example`](../../backend/.env.example)
- 本機調試覆寫：通常用 gitignored 的「覆寫檔」或「自建 local env」

## 前端（VITE_*）重點
前端所有控制項都以 `VITE_*` 為主；Wiki 只列「變數名稱與用途」，不收錄任何真實 secret 值。

1. API base URL / 功能開關（例如 bank-sync）
2. Google Oauth / e-invoice 相關配置
3. Debug-only：僅在 DEV/debug 開啟 console trace（不建議上線後依賴）

常見（依 [`frontend/.env.example`](../../frontend/.env.example)）：
- `VITE_SHARED_LEDGER_API_BASE_URL`：shared ledger/共同帳本後端 API base URL
- `VITE_GOOGLE_WEB_CLIENT_ID`：Google Sign-In 的 Web client id
- `VITE_BANK_SYNC_FEATURE_ENABLED`：bank-sync 入口是否顯示（Feature flag）
- `VITE_BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS`：允許/限制部分「未支援 provider」的行為
- `VITE_BANK_SYNC_API_BASE_URL`：bank-sync 相關 API base URL
- `VITE_EINVOICE_CLIENT_SHARED_KEY`：e-invoice/載具流程的前端共享 key（server 端需同值）
- `VITE_EINVOICE_API_BASE_URL`：e-invoice/載具 API base URL
- `VITE_GOOGLE_OAUTH_API_ORIGIN`：Google OAuth API 的 origin（production 時影響走哪個網域）
- `VITE_WEB_HASH_ROUTER`：Hosted GitHub Pages 巢狀 SPA hash router

## 後端（非 VITE_*）重點
1. Node server port / database file
2. Auth 與 rate limiting
3. Google Oauth client secret（必要時）
4. 銀行/載具同步的 client shared key（fail-closed 用）

常見（依 [`backend/.env.example`](../../backend/.env.example)）：
- `HOST` / `PORT`：後端监听設定（預設 `HOST=0.0.0.0`、`PORT=8787`）
- `SHARED_LEDGER_DB_FILE`：collab-store sqlite 檔案位置
- `GOOGLE_AUTH_WEB_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`：Google OAuth 設定
- `EINVOICE_CLIENT_SHARED_KEY`、`BANK_SYNC_CLIENT_SHARED_KEY`、`GOOGLE_OAUTH_CLIENT_SHARED_KEY`：同步/驗證的 client shared key
- `LINEAR_API_KEY` / `LINEAR_TEAM_KEY`：Linear 整合用（可選）
- SMTP：`SMTP_SERVER` / `SMTP_USER` / `SMTP_PASS` 等（密碼不要提交）

## 安全規範（避免知識漂移）
- 不提交 `.env`、`key.properties`、`.jks` 等密鑰檔（詳見 [`CONTRIBUTING.md`](../../CONTRIBUTING.md)）
- Wiki 只描述「變數用途/必填/預期行為」，不收錄真實 secret 值

## 引用來源
- [`frontend/.env.example`](../../frontend/.env.example)
- [`backend/.env.example`](../../backend/.env.example)
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

