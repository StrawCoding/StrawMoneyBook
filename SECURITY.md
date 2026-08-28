# Security Policy

## Supported Versions

目前僅維護最新發布版本的安全性修補。

| 版本 | 支援狀態 |
|------|----------|
| 最新版本 | 支援 |
| 舊版本 | 不支援 |

## 回報安全漏洞

**請勿在公開的 GitHub Issues 中揭露安全漏洞。**

若你發現安全漏洞，請透過以下方式私下回報：

1. 使用 [GitHub Private Security Advisory](../../security/advisories/new) 功能回報。
2. 或直接寄送電子郵件給維護者，說明漏洞的影響範圍與重現步驟。

我們會在收到回報後盡快回應，並在修復後公開說明。

## 安全設計說明

### 認證與 Session

- 使用短效 Bearer access token（15 分鐘）搭配 rotating refresh token
- Refresh token 在資料庫只儲存 hash，不存明文
- Refresh token reuse 偵測：grace（預設 60 秒）內重放剛旋轉的舊 token 視為遺失回應並續發，不踢登入；grace 過後再重放才撤銷整個 token family。family revoke 必須在 SQLite transaction 成功 commit 後才丟錯，避免 throw 造成 rollback 而沒真正撤銷。
- Google Sign-In ID token 僅在 `/api/auth/google` 換取本地 session，不作為 API 憑證

### 環境變數

所有敏感設定（SMTP 密碼、JWT secret、Google Client ID、API Key）均透過環境變數管理，不得硬編碼於原始碼。請參考 `backend/.env.example` 和 `frontend/.env.example` 了解所需設定。

### Rate Limiting

後端 API 實作了全域與認證端點的 IP-based rate limit，可透過環境變數調整。

### 第三方整合

- Google OAuth：僅用於身分驗證，Google token 不直接存取業務 API
- SMTP：用於密碼重設信件，設定應使用專用的服務帳號而非個人帳號
