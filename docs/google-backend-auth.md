# StrawMoneyBook Google 後端登入方案

## 最終推薦方案

- 主方案：`短效 access token + rotating refresh token + Google ID token 僅作登入交換`
- Google 只負責身分驗證，不直接當 API 存取憑證
- 後端是最終 session / 權限中心
- 支援：
  - Email / Password
  - Google Sign-In
  - 之後可擴 Apple / 匿名升級 / 更多 provider
- 已實作：
  - `POST /api/auth/google/prepare`
  - `POST /api/auth/google`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - Email 註冊 / 登入 / 重設密碼 全部統一改成 access + refresh session

## 為什麼選這個方案

### 主方案：Bearer access token + rotating refresh token

- 優點：
  - 最符合目前 StrawMoneyBook 現有 Bearer API 架構
  - Web 與 Android/Capacitor 都能共用同一套登入邏輯
  - Google token 只用在 `/auth/google` 一次，不會滲透到其他 API
  - refresh token rotation + family revoke 可處理 token reuse
- 取捨：
  - Web 端 refresh token 不在 HttpOnly cookie，中 XSS 時風險較 cookie 方案高
  - 但目前專案已採用前端 Bearer session，這個方案最容易穩定落地

### 備案：HttpOnly session cookie / refresh cookie

- 優點：
  - Web 上較能降低 XSS 直接讀取 refresh token 的風險
- 缺點：
  - Capacitor / Native 與跨網域 API 整合複雜度更高
  - 需要額外處理 cookie policy、SameSite、CSRF token、行動端 cookie 管理

## 已實作檔案

```text
backend/
  .env.example
  src/
    collab/
      google-id-token.js
      http.js
      store.js
    routes/
      auth.js
  test/
    google-id-token.test.js
    refresh-session.test.js

frontend/
  .env.example
  src/
    services/shared-ledger/backend.js
    ui/services/google-identity.service.js
    ui/views/settings/SettingsAccountPage.vue
  android/app/
    build.gradle
    src/main/java/com/strawcoding/strawmoneybook/
      GoogleIdentityPlugin.java
      MainActivity.java
```

## 資料表設計

### `users`

- 沿用既有表
- 新增重點欄位：
  - `email_verified`
  - `last_login_at`

### `user_auth_providers`

- 一個本地帳號可綁多個 provider
- 目前已支援 `provider='google'`
- 關鍵欄位：
  - `user_id`
  - `provider`
  - `provider_sub`
  - `provider_email`
  - `email_verified`
  - `provider_display_name`
  - `provider_avatar_url`
  - `linked_at`
  - `last_login_at`
- 唯一鍵：
  - `(provider, provider_sub)`
  - `(user_id, provider)`

### `refresh_tokens`

- 目的：access token 短效、refresh token rotation
- 關鍵欄位：
  - `token_family_id`
  - `token_hash`
  - `parent_token_id`
  - `replaced_by_token_id`
  - `issued_by_provider`
  - `ip_address`
  - `user_agent`
  - `expires_at`
  - `revoked_at`
  - `revoke_reason`

### `auth_nonces`

- 用於 Google nonce 防 replay
- 關鍵欄位：
  - `provider`
  - `purpose` (`login` / `link`)
  - `nonce_hash`
  - `user_id`
  - `expires_at`
  - `consumed_at`

### `auth_audit_logs`

- 記錄：
  - prepare
  - login success/failure
  - link success/failure
  - refresh
  - logout

### `sessions`

- 本次主方案未採用 cookie session table
- 若之後切到 cookie session，可用 `sessions` 取代 `refresh_tokens`

## API 設計

### `POST /api/auth/google/prepare`

- 作用：向後端拿一次性 nonce
- request:

```json
{
  "purpose": "login"
}
```

- response:

```json
{
  "provider": "google",
  "purpose": "login",
  "nonce": "random-base64url",
  "expires_at": "2026-03-14T12:00:00.000Z"
}
```

### `POST /api/auth/google`

- request:

```json
{
  "idToken": "google-id-token",
  "nonce": "random-base64url",
  "purpose": "login"
}
```

- link 模式：
  - 帶本地 access token `Authorization: Bearer ...`
  - `purpose = "link"`

- response:

```json
{
  "token": "local-access-token",
  "access_token": "local-access-token",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "opaque-refresh-token",
  "refresh_token_expires_in": 2592000,
  "refresh_token_expires_at": "2026-04-13T12:00:00.000Z",
  "user": {
    "id": "user_xxx",
    "email": "user@example.com",
    "email_verified": true,
    "display_name": "User",
    "has_password": true,
    "auth_providers": [
      {
        "provider": "google",
        "provider_sub": "google-sub",
        "email": "user@example.com",
        "email_verified": true,
        "linked_at": "...",
        "last_login_at": "..."
      }
    ]
  }
}
```

### `POST /api/auth/refresh`

- request:

```json
{
  "refreshToken": "opaque-refresh-token"
}
```

- 行為：
  - 驗 token hash
  - 驗未撤銷 / 未過期
  - rotate 成新 refresh token
  - 舊 token 標記 `rotated`
  - 若舊 token 被重複使用，整個 family revoke

### `POST /api/auth/logout`

- request:

```json
{
  "refreshToken": "opaque-refresh-token"
}
```

- 行為：
  - revoke 目前 refresh family
  - access token 靠短 TTL 自然失效

### `GET /api/auth/me`

- 使用本地 access token
- 回傳本地使用者資料與 provider 綁定狀態

## 驗證流程

1. 前端呼叫 `/api/auth/google/prepare`
2. 後端簽發一次性 nonce，存 `auth_nonces`
3. 前端把 nonce 交給：
   - Web：Google Identity Services
   - Android：Credential Manager + Sign in with Google
4. 前端取得 Google ID token
5. 前端送到 `/api/auth/google`
6. 後端驗：
   - signature
   - `aud`
   - `iss`
   - `exp`
   - `nonce`
7. 後端取出：
   - `sub`
   - `email`
   - `email_verified`
   - `name`
   - `picture`
8. 查 `user_auth_providers(provider=google, provider_sub=sub)`
9. 分流：
   - 有 provider link：直接登入
   - 無 provider link + 無本地同 email：自動註冊
   - 無 provider link + 已有同 email：要求先用原方式登入後再綁定
10. 後端簽發本地 access token + refresh token

## 前端行為

### Web

- 使用 Google Identity Services rendered button
- 由後端 prepare nonce 後再 render button
- GIS callback 拿到 `credential` 後送 `/api/auth/google`

### Android / Capacitor

- 新增 `GoogleIdentityPlugin`
- 使用：
  - `CredentialManager`
  - `GetGoogleIdOption`
  - `serverClientId = Web client ID`
  - `nonce = /api/auth/google/prepare` 回傳值

## 本機與正式環境差異

### 本機

- `frontend/.env.example`
  - `VITE_SHARED_LEDGER_API_BASE_URL=http://127.0.0.1:8787`
- `backend/.env.example`
  - `GOOGLE_AUTH_WEB_CLIENT_ID=...`
- Web GIS 在 localhost 可用
- Android debug 需把 debug keystore SHA-1 / SHA-256 加到 Google Cloud OAuth Android client

### 正式環境

- API 必須 HTTPS
- `ALLOWED_ORIGINS` 不要用 `*`
- `SHARED_LEDGER_TOKEN_SECRET` 必須換成高熵隨機值
- 設定正式網域對應的 OAuth Web client Authorized JavaScript origins

## Google Cloud Console 設定步驟

1. 到 `Google Cloud Console`
2. 建立 / 選取專案
3. `APIs & Services` -> `OAuth consent screen`
4. 設定：
   - App name
   - Support email
   - Authorized domains
5. `APIs & Services` -> `Credentials`
6. 建立 `OAuth client ID`
7. 建兩種 client：
   - Web application
   - Android

### Web application client

- 用途：
  - Web GIS
  - Android Credential Manager 的 `serverClientId`
  - 後端 `aud` 驗證
- 需要填：
  - Authorized JavaScript origins
    - `http://localhost:5173`
    - `http://127.0.0.1:5173`
    - 正式 `https://strawmb.com`
    - 正式 `https://www.strawmb.com`

### Android client

- 需要填：
  - package name：`com.strawcoding.strawmoneybook`
  - SHA-1 / SHA-256
- 至少加入以下版本的憑證指紋：
  - debug keystore
  - release keystore
  - Google Play App Signing certificate

## SHA 指紋清單

請至少整理這三組：

1. Debug keystore
2. Release keystore
3. Google Play App Signing

建議記錄欄位：

```text
用途 | Package Name | SHA-1 | SHA-256 | 是否已加到 Android OAuth client
```

### 取得方式

- Debug keystore：

```bash
keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android
```

- Release keystore：

```bash
keytool -list -v -alias <your_alias> -keystore <your_release_keystore.jks>
```

- Play App Signing：
  - Play Console -> App integrity -> App signing

## 安全設計重點

### Replay attack

- 使用後端發的一次性 nonce
- `auth_nonces` 消耗後即失效
- refresh token reuse 會整個 family revoke

### CSRF

- 本次主方案採 Bearer token，不以 cookie 當主要 API 認證
- 後端有 origin allowlist
- 若未來切 HttpOnly cookie，需補 CSRF token / SameSite 策略

### XSS

- 風險點：Web refresh token 仍在 JS 可讀存放區
- 已緩解：
  - access token 短 TTL
  - refresh token rotation
  - reuse detection
- 建議再補：
  - 前端 CSP
  - DOM sanitize 規範
  - 避免 `v-html`

### Refresh token 洩漏

- DB 只存 hash
- rotate 後舊 token 失效
- reuse 時 family revoke
- audit log 記錄

### Rate limit

- `backend/src/server.js` 已對 `/api/auth` 使用 IP-based rate limit
- 可透過下列環境變數調整：
  - `AUTH_RATE_LIMIT_WINDOW_MS`
  - `AUTH_RATE_LIMIT_MAX_REQUESTS`
  - `GLOBAL_RATE_LIMIT_WINDOW_MS`
  - `GLOBAL_RATE_LIMIT_MAX_REQUESTS`

### 權限邊界

- 只有後端 access token 能打 API
- Google token 不可直接打任何業務 API

## 錯誤處理對應

- `google_token_expired`
- `google_audience_mismatch`
- `google_invalid_signature`
- `google_nonce_mismatch`
- `existing_account_link_required`
- `provider_already_linked`
- `refresh_token_invalid`
- `refresh_token_expired`
- `refresh_token_reuse_detected`
- `password_login_not_available`

## 測試案例

### 已自動化

- `backend/test/google-id-token.test.js`
  - valid payload
  - nonce mismatch
  - audience mismatch mapping
- `backend/test/refresh-session.test.js`
  - refresh rotation
  - token reuse detection
  - nonce one-time consume

### 建議 API 測試

1. `POST /api/auth/google/prepare` 取得 nonce
2. 使用 mock / staging Google token 走 `/api/auth/google`
3. `/api/auth/refresh` rotate 成功
4. 重送舊 refresh token 觸發 reuse revoke
5. `/api/auth/logout` 後 refresh token 不可再用

### 建議 E2E

1. Web 首次 Google 登入 -> 自動註冊
2. 既有 Email 帳號登入後 -> 綁定 Google
3. 綁定後登出 -> 用 Google 再登入
4. Android debug APK -> Credential Manager 成功取回 ID token

## 部署清單

- 後端：
  - `GOOGLE_AUTH_WEB_CLIENT_ID`
  - `SHARED_LEDGER_TOKEN_SECRET`
  - `SHARED_LEDGER_ACCESS_TOKEN_TTL_MS`
  - `SHARED_LEDGER_REFRESH_TOKEN_TTL_MS`
  - `ALLOWED_ORIGINS`
- 前端：
  - `VITE_SHARED_LEDGER_API_BASE_URL`
  - `VITE_GOOGLE_WEB_CLIENT_ID`
- Android：
  - package name 正式值
  - release keystore
  - Play App Signing SHA
- Google Cloud：
  - OAuth consent screen
  - Web client
  - Android client
  - JavaScript origins / package + SHA

## 驗收清單

- Web 可看到 Google 登入按鈕
- Android 可成功喚起 Google Credential Manager
- `/api/auth/google` 只接受 Google ID token 換本地 token
- `/api/auth/me` 只接受本地 access token
- refresh token rotation 正常
- reuse 舊 refresh token 會失效整個 family
- 已登入帳號可綁定 Google
- 同一個 Google `sub` 不會綁到兩個本地帳號
- 相同 email 的舊帳號不會被靜默接管，必須先登入再綁定
