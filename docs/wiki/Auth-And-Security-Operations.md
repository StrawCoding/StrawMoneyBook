# Auth-And-Security-Operations

## 目的
整理後端登入/權限整合的「操作型」規格與安全政策，避免在 debug/部署時因憑證/secret 誤用造成安全風險或不可用。

## 登入架構（Google / Email / Refresh rotation）
- 主方案：[`docs/google-backend-auth.md`](../google-backend-auth.md)

後端主要端點（運維/串接用）：
- `POST /api/auth/google/prepare`：取得一次性 nonce（目的：login/link）
- `POST /api/auth/google`：用 Google idToken 完成登入/連結並回傳本地 Bearer token + refresh token
- `POST /api/auth/refresh`：refresh token rotation（舊 token 被替換）
- `POST /api/auth/logout`：撤銷 refresh token family
- `GET /api/auth/me`：回傳目前登入者 profile / 權限資訊

## Token 與風險控管（和安全策略一致）
- 使用短效 Bearer access token
- refresh token reuse 偵測：grace（預設 60 秒）內重放剛旋轉的舊 token 會續發、不踢登入；過後才撤銷整個 token family
- refresh token 只存 hash，不存明文（避免資料庫外洩造成可用 token 泄漏）

## Drive OAuth／405／refresh

Google 備份、server auth code、refresh token 類問題要同時查前端 auth flow 與後端 `/api/google/oauth/*` host，不要只修 UI 登入。細節：[`docs/google-backend-auth.md`](../google-backend-auth.md)。Cookie session 只負責 restore；呼叫 API 仍要 access token。

## 安全政策（必讀）
主要規範：
- 不提交 secret/密鑰檔（Wiki 只描述用途/必填/行為）
- 安全漏洞走私下回報（依 SECURITY.md）

## 引用來源
- [`docs/google-backend-auth.md`](../google-backend-auth.md)
- [`SECURITY.md`](../../SECURITY.md)
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

