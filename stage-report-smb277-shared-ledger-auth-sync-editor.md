# Stage report: smb277-shared-ledger-auth-sync-editor

**Stage ID:** smb277-shared-ledger-auth-sync-editor  
**Worker:** Cursor (Composer)  
**Date:** 2026-07-18  
**Version target:** ?（worker 未 bump／未 gpr；交由 Hermes closeout）

## Summary

治本完成會員登入狀態一致性、共同帳本 HTTPS 共享連結、同步可見狀態／重試、交易 `created_by`／`updated_by` 編輯者標註，以及共同帳本／交易 UI 對齊核准設計稿（現代模式；保留 FAB／首頁區塊）。Hermes 介入後依設計稿補齊帳號／共同帳本頁 Session pill（已登入／有效／自動同步開；過期／同步暫停／需重新登入）與交易編輯者 chip 視覺。

## Changes

### Auth session
- `frontend/src/services/shared-ledger/backend.js`：`needsSharedLedgerReauth` / `getSharedLedgerAuthStatus`；401 refresh 清 token 保留 profile 並標需重新登入；網路／5xx 不誤清 token、不標 needs-reauth；`isSharedLedgerAuthenticated` 在 needs-reauth 時暫停背景同步 API。
- `SettingsAccountPage.vue` / `SettingsSharedLedgerPage.vue`：設計稿狀態列（● 已登入 + Session 有效 + 自動同步開；● 已過期 + 同步暫停 + 需重新登入），帳號／共同帳本頁一致。

### HTTPS share + rotate
- 前後端強制邀請連結為 `https://www.strawmb.com/open/shared-ledger?...`（localhost http 例外）。
- Backend `POST /api/shared-ledgers/:id/invite-code/rotate`（Owner/Admin）；前端複製／分享／產生新連結。

### Sync UX
- meta 記錄 `last_sync_status` / `last_sync_error`；共同帳本頁顯示上次同步、版本、錯誤與重試；Viewer 文案「自動下載最新資料」。

### Transaction editor attribution
- Migration `040_transaction_editor_attribution.sql`：`created_by_*` / `updated_by_*`。
- `transaction.repo` / `transaction.service` / `transaction-editor-attribution.js`：建立／編輯／批量寫入目前登入者快照；匯出／匯入／快照同步以 `SELECT *` + dynamic INSERT 帶欄位。
- `HomeTransactionFeed` / `TransactionAboutPage`：清單與詳情顯示建立者／最後編輯者；單人非共享可隱藏自己；chip 對齊設計稿圓角標註。

### Docs
- `StrawMoneyBook_Features_Map.md`、`StrawMoneyBook_App_Features_Detailed.md`、`release-notes.pending.md`（pending header 下 SMB-277 條目）。

## Tests

| Command | Result |
|---------|--------|
| `cd frontend && node --test test/smb277-shared-ledger-auth-sync-editor.test.js test/shared-ledger-cookie-auth-cors-source.test.js` | 11/11 pass |
| `cd frontend && npm run test:node` | 710/710 pass |
| Backend（先前 feat commit；本輪無 backend 變更）：`1panel/node:25.8.0` ephemeral shared-ledgers / cors / invitation | 18/18 pass（含 rotate；見先前 deploy 紀錄） |
| `cd frontend && npm run build:web` | pass（含於 playwright） |
| `cd frontend && PLAYWRIGHT_BROWSERS_PATH=…/backend/.server-data/playwright-browsers npm run playwright:ui-layout` | pass（帳號／共同帳本 HTTPS 文案 + app-shell 編輯者 chip） |

## Deploy

- 本輪（設計稿 pill／Playwright 強化）僅 frontend；無需 `deploy:copy`。
- 先前 feat 已執行：`cd backend && npm run deploy:copy` 成功；`docker restart StrawMB` 成功；Health `{"ok":true,"service":"strawmoneybook-backend"}`。

## Suggested status

**建議 Hermes 標記：READY_FOR_VERIFY**（worker 不自行宣稱 PASS）

驗收請跑 stage brief 所列 Hermes 驗證命令（含 `git fetch` HEAD=origin/main、`rg` 關鍵字、`playwright:ui-layout`）。
