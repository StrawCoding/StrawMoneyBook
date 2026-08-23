# Sync-Operations-Runbooks

## 目的
針對「同步類」功能（Shared Ledger、Google Drive 備份/同步、Bank Sync、Carrier Sync）提供可操作的 runbook：
- 何時要跑哪個驗證（對應 `npm run playwright:*` / Node 測試）
- 錯誤碼/診斷欄位的判讀方向（以現有 UI 診斷為準）
- 發生失敗後的復原 CTA（先驗證、再復原，不要跳步）

## 主要對應頁/腳本
### Shared Ledger / Google Drive
- 以 `docs/google-backend-auth.md` 與專案既有驗收流程為主。

### Bank Sync / Carrier Sync
#### Bank Sync（可用性診斷 + 錯誤碼分流 + seeded review）
- 最推薦的驗證：`npm run playwright:bank-sync --prefix frontend`
- 對應腳本：`frontend/scripts/playwright-bank-sync-settings.mjs`
- Mock/流程觀察（非真實 provider）：`npm run simulate:bank-sync --prefix frontend`

#### Carrier Sync（載具同步）
- 驗證：`npm run playwright:carrier-sync --prefix frontend`
- 對應腳本：`frontend/scripts/playwright-carrier-sync-settings.mjs`

#### 需要特別留意的環境變數（治本優先）
- bank-sync 入口/可用性診斷常受 `VITE_BANK_SYNC_FEATURE_ENABLED` 等 feature flag 影響（見：[`Environment-Variables`](Environment-Variables)）

## 驗證與處理原則（避免治標）
- 一律先確認「可用性診斷」顯示的錯誤碼屬於哪一類（而非只看 UI 總結）
- 若錯誤碼涉及 native/原生自動化：優先檢查 native 路徑是否可用，再處理 UI/回退路徑
- 若錯誤碼涉及憑證缺失：只沿用專案既有 recovery CTA，不自行跳過任何閘門

## 引用來源
- [`docs/google-backend-auth.md`](../google-backend-auth.md)
- Playwright bank sync：[`frontend/scripts/playwright-bank-sync-settings.mjs`](../../frontend/scripts/playwright-bank-sync-settings.mjs)
- Playwright carrier sync：[`frontend/scripts/playwright-carrier-sync-settings.mjs`](../../frontend/scripts/playwright-carrier-sync-settings.mjs)

