# Pending Release Notes

---

## v1.3.19
- (SMB-240) 修復電子發票爬蟲「尚未設定（缺少 EINVOICE_CLIENT_SHARED_KEY）」：後端 production env 補上 `EINVOICE_CLIENT_SHARED_KEY` 與 `EINVOICE_SCRAPE_USE_PLAYWRIGHT=1` 並重啟 StrawMB；前端 `.env.production` 同步 `VITE_EINVOICE_CLIENT_SHARED_KEY`。驗證：無 key 回 401、有 key 進入參數驗證；backend einvoice 9/9、前端 564/564。
- 修復載具同步憑證格式錯誤：財政部 scrape 登入改為「手機號碼 + 密碼」（非手機條碼 / 查詢碼）；後端 Playwright provider 改走 `accounts/login` 後再查詢發票；設定頁欄位與驗證（09 開頭 10 碼 + 至少 4 位密碼）及三語 i18n 同步更新。
- 修復第一銀行同步驗證碼辨識失敗：OCR 全失敗時改拋 `first_bank_captcha_manual_required` 並回傳驗證碼圖；建立連線頁新增手動輸入 4 碼重試；若使用者已填驗證碼則優先採用手動輸入、跳過 OCR。後端 einvoice 路由測試 9/9、前端載具/銀行同步 source 測試、Android `FirstBankAutomationCaptchaTest` 通過。

## v1.3.18
- (SMB-239) 修復 Android / iOS 冷啟動後會員登入狀態無法保持：Capacitor WebView 在 process 結束後會清空 `sessionStorage`，v1.3.14 雖能在同 session 重載時保留使用者快取，但 App 完全重啟後 profile 與 access token 皆遺失，設定 / 會員頁呼叫 `refreshSharedLedgerSession()` 又因無 token 直接回傳 null 而不觸發 HttpOnly cookie 靜默 refresh，導致誤顯示未登入。`auth-session-storage.js` 改為在 native 平台把使用者 profile（不含 token）存進 `localStorage`，Web 仍只用 `sessionStorage`；`refreshSharedLedgerSession()` 在 cookie 模式且 access token 已清空時改委派 `restoreSharedLedgerSession({ force: true })`。新增 `auth-session-storage.test.js`、`auth-session-storage-source.test.js`、`shared-ledger-cookie-auth-cors-source.test.js` 回歸案例。

## v1.3.17
- 銀行同步上線（會員限定）：`VITE_BANK_SYNC_FEATURE_ENABLED` 控制功能開關；生產路徑移除 Sandbox / Mock provider，僅保留第一銀行 Android 本地同步與多銀行 Provider 擴充接口。新增建立連線 Wizard（選銀行 → 登入 → 批次帳戶對應 → 首次同步）、列表待匯入 badge、連線頁「全部儲存」與進階設定收合、舊 Mock 連線停用提示；三語 i18n 改為生產導向免責聲明與 Android-only 提示。新增 `saveBankAccountsSettings`、`countBankReviewTransactionsByConnection`；`test:smoke` 改以 `simulate:first-bank-provider` 取代 mock flow。新增 `bank-sync-backend-source.test.js`、`bank-sync-ui-source.test.js`、`bank-sync-batch-accounts.test.js` 與 `playwright:bank-sync` 腳本。
- 載具同步（會員限定）：新增 `/settings/carrier-sync` 設定頁與 `carrier-sync.service.js`，透過 scrape API 拉取財政部載具發票、pending 佇列審核後匯入；migration 037 建立 `einvoice_sync_config` / `einvoice_pending_invoices` / `einvoice_sync_runs`；支援自動同步、驗證碼對話框、預設帳戶/分類與背景 refresh。後端 `einvoice` 路由改為 provider 模組化（`backend/src/einvoice/*`）。新增 `einvoice-carrier-sync.test.js`、`playwright:carrier-sync` 腳本。

## v1.3.16
- (CSP / SMB-233 回歸) 修復 Web 版電子發票「載具」及所有依賴資料庫的功能在瀏覽器中完全失效：v1.3.5（SMB-233 XSS 防護）加入的 CSP `<meta>` 中 `script-src 'self'` 未允許 WebAssembly 編譯，導致 web 版 SQLite 引擎 jeep-sqlite 的 `WebAssembly.instantiate()` 被 CSP 擋下並 `Aborted`、連 fallback ArrayBuffer 實例化也失敗，`ensureWebSqliteStoreReady()` 無法初始化 web store。載具流程所依賴的憑證加密儲存（`saveEInvoiceCredential` / `loadEInvoiceCredential`）、已匯入發票去重、匯入時建立支出交易（`createExpense` 寫入載具標籤）等 DB 操作在 web 端全數無法運作。修正：於 `script-src` 加入 `'wasm-unsafe-eval'`（僅允許 WebAssembly 編譯，仍封鎖 JS `eval()`，完整保留 SMB-233 的 XSS 防護）。Playwright 驗證載入 `/einvoice-import` 後 jeep-sqlite `getVersion` 成功、Pinia 各 store 正常安裝、WASM/CSP 編譯錯誤全數消除；539 個前端測試全綠、`npm run build:web` 通過且建置後 `dist/index.html` 確認為 `script-src 'self' 'wasm-unsafe-eval'`。

## v1.3.15
- 修復請款單完成時含「借出收回」項目會導致金額重複計算：完成入帳不再把借出整套刪除，改以 `addLoanRepayment` 建立收回交易並將借出標記為 `settled`；報銷入帳金額 `reimbursementCashMinor` 會扣除借出收回項目，避免同一本金同時出現在報銷入帳與借出刪除兩條路徑。paid→draft / 刪除已付請款改為沖銷請款期間建立的還款紀錄；完成對話框的入帳預覽與帳戶必填條件同步排除借出收回金額；三語 i18n 改為「完成請款後借出以收回方式結清」。新增 `claim-sheet-borrow-loan-settle-source.test.js` 並更新 borrow_loan import source regression。

## v1.3.14
- (SMB-238) 修復 Capacitor `https://localhost` 登入後會員自動被登出：v1.3.13 雖修好 Google 登入 CORS preflight，但 `auth-cookies.js` 的 `shouldUseCrossSiteCookie()` 把 `localhost` Origin 誤判為同站，refresh HttpOnly cookie 被設成 `SameSite=Lax`；從 `https://localhost` 跨域 `fetch` 到 `api.strawmb.com` 時瀏覽器不會帶此 cookie → `POST /api/auth/refresh` 回 `refresh_token_required` → 前端 `clearSession()` 清空 session。改為比對請求 Origin 與 API `Host` 是否相同來決定 `SameSite`（跨站改 `SameSite=None; Secure`）；前端 `readPersistedAuthSession` 在 cookie 模式下保留 sessionStorage 使用者資料，重載後靜默 refresh 期間不再誤顯示已登出。新增 `auth-cookies.test.js` Capacitor / 本機 dev 案例與 `auth-session-storage.test.js` 重載情境測試。

## v1.3.13
- (SMB-238) 修復帳號頁實際 Google 登入提交 `POST /api/auth/google` 在 `https://localhost`（Capacitor WebView）跨域連線正式 API 時仍出現 `shared_ledger_network_error`：v1.3.12 後登入提交會以 `useAuthStorage: true` 帶 `X-Straw-Auth-Storage: cookie` + `credentials: include`，但瀏覽器送出的 CORS preflight（`OPTIONS`）並不會帶這個自訂 header，而是改用 `Access-Control-Request-Headers` 通告。後端 `http.js` 的 `wantsCredentialedCors()` 只檢查實際 `X-Straw-Auth-Storage` header，preflight 偵測不到 → 在 `ALLOW_ALL_ORIGINS=*` 時回 `Access-Control-Allow-Origin: *` 且無 `Access-Control-Allow-Credentials`，瀏覽器因 credentialed 請求收到 wildcard ACAO 而拒絕 preflight → Failed to fetch。修正 `wantsCredentialedCors()` 在 preflight 時改從 `Access-Control-Request-Headers` 偵測 `x-straw-auth-storage`，使 preflight 也能反射實際 Origin 並附 `Access-Control-Allow-Credentials: true`；匿名 preflight（如 `/api/auth/google/prepare`）仍維持 `*`。新增 `backend/test/http-cors.test.js` 兩個 preflight 案例（credentialed 反射 Origin + credentials、匿名維持 wildcard）。

## v1.3.12
- (SMB-238) 修復帳號頁 Google 登入準備階段在 `https://localhost`（Capacitor WebView）連線 `api.strawmb.com` 時出現 `shared_ledger_network_error`：SMB-233 後所有共同帳本 API 請求都帶 `credentials: include`，但 `POST /api/auth/google/prepare`（login 用途）其實不需要 cookie，跨域時瀏覽器會因 `Access-Control-Allow-Origin: *` 與 credentials 不相容而直接 Failed to fetch。前端改為僅在明確 `useAuthStorage: true` 的登入 / refresh / logout 才附帶 cookie auth header 與 `credentials: include`；後端 `http.js` 在收到 `X-Straw-Auth-Storage: cookie` 時改回反射實際 Origin 並附 `Access-Control-Allow-Credentials`，匿名跨域仍維持 `*`；補上 `https://localhost` 等 Capacitor / HTTPS 本機開發 Origin。帳號頁 `refreshGoogleButtonUi` 也會捕捉 prepare 失敗並顯示 toast，不再留下未處理 rejection。新增 `shared-ledger-cookie-auth-cors-source.test.js` 與 `backend/test/http-cors.test.js`。

## v1.3.11
- (SMB-237) 報銷項目可自訂報銷金額：報銷清單未報銷項目新增「報銷金額」設定（底部輸入面板，可輸入元為單位的報銷金額或一鍵重設為原始支出），交易表新增 `reimburse_target_minor` 欄位（migration 036）儲存設定值。設定後匯出 CSV、請款單導入與報銷待處理 / 已報銷金額計算都改以設定金額為準（未設定時維持以原始支出計算的舊行為）；匯出 CSV 另新增「報銷金額」欄位。新增 `reimbursement-claim-amount.test.js`（含 alias loader 行為測試 9 案例）與 db-migrate 註冊測試。

## v1.3.10
- (SMB-232) 後端 `updateStore` 全量讀寫瓶頸優化：原本每次 mutation 都會把所有 users / shared_ledgers / referrals 全量 upsert，並對三張表各做一次 `SELECT id` 全表掃描比對刪除，寫入量隨資料量線性成長。改為在 `store.js` 載入時以 id → 序列化快照建立 baseline（`buildStoreBaseline`），寫回時只 upsert「新增或實際變更」的 record、只刪除「實際被移除」的 record，全部仍包在單一 SQLite transaction 內確保原子性，並移除三次全表刪除掃描。mutator API 完全不變，15+ 呼叫端零改動。新增 `backend/test/update-store-row-level.test.js`（用第二連線 trigger 計數驗證單筆變更只觸發 1 次寫入、刪除只移除目標 row），backend 全測試 61 案例綠燈。

## v1.3.9
- (SMB-229) 共享帳本角色權限系統：引入 Owner / Admin / Member / Viewer 四種角色與集中式權限矩陣（`store-shared-ledgers.js`）。Owner 擁有全部權限並可轉移所有權；Admin 可上傳快照與邀請成員、調整 Member/Viewer 角色；Member 可上傳但不可邀請；Viewer 唯讀只能下載。後端每個敏感 endpoint 都改為依角色檢查：snapshot push 禁止 Viewer（403）、Email 邀請與重發禁止 Member/Viewer（403）；新增 `POST /:id/members/:userId/role`（改角色）與 `POST /:id/transfer`（轉移所有權）端點，帳本 detail 回傳成員清單，summary 附帶 `permissions`。前端 `SettingsSharedLedgerPage.vue` 依角色顯示/隱藏分享連結與 Email 邀請、新增「成員與角色」管理區（改角色下拉、轉移所有權）與唯讀提示；背景自動同步對 Viewer 跳過上傳，被降級為 Viewer 時清除 dirty 佇列避免重試風暴。新增後端單元與路由整合測試（權限矩陣、role 指派治理、Viewer 禁 push、Member 禁 invite、改角色、轉移所有權），三語 i18n。

## v1.3.8
- (SMB-236) 修復共同帳本 / Google Drive 快照合併仍可能靜默跨表覆蓋：`snapshot-merge.js` 新增 merge unit（帳戶連帶交易、轉帳雙腿、借貸還款、請款與預支 bundle），偵測到同一 unit 內本機與遠端混用時改為 all-or-nothing 整組採用較新一方並記錄衝突；`mergeSharedLedgerSnapshots` 補上 `detectConflicts` 結構化回傳，Google Drive 雙向合併與共同帳本 version conflict 路徑都會回報衝突筆數。新增 cross-table 單元測試與 google-drive source regression。

## v1.3.7
- (SMB-235) 修復 Google 帳號切換後可能靜默推送到不同帳號：`ensureGoogleAccess` 以綁定 `accountEmail` 比對目前 Google profile，不符時拋出 `GOOGLE_ACCOUNT_SWITCHED` 並阻擋 push/pull；背景同步改寫入 `pendingAccountSwitch` + `account_mismatch` 狀態、記錄 `[google-ledger-sync] account switched` log，並透過 `google-ledger-sync:account-switched` 事件顯示 warning toast。`SettingsGoogleDriveLedgerSyncPage.vue` 顯示綁定帳號與待確認切換提示，手動同步/啟用時以確認對話框要求改綁定後才繼續。補齊三語 i18n；新增 google-drive-ledger-sync source regression 測試。

## v1.3.6
- (SMB-234) 修復共同帳本 Email 邀請寄失敗無提示：後端改為同步寄信並回傳 `email_delivery` 狀態（sent / failed / not_configured），邀請紀錄保存寄送狀態與錯誤訊息並寫入 server log；新增列出待加入邀請與重發 API；`SettingsSharedLedgerPage.vue` 補上 Email 邀請輸入、待加入清單、寄送狀態與成功 / 失敗 toast，失敗時可重發。新增 backend `shared-ledger-invitation-email.test.js` 與 frontend source regression 測試。
- (SMB-233) 修復 Web 版 auth token 存 localStorage 的 XSS 竊取風險：refresh token 改由後端 HttpOnly cookie（`X-Straw-Auth-Storage: cookie` + `credentials: include`）管理，access token 僅保留在記憶體，使用者資料改存 sessionStorage 且不再持久化 token；登入 / 註冊 / refresh / logout 端點支援 cookie 模式並自動遷移清除舊版 localStorage session；後端補 `Access-Control-Allow-Credentials`、CORS 允許 `X-Straw-Auth-Storage`；前端 `index.html` 加入 CSP meta。新增 `auth-cookies.test.js`、`auth-session-storage.test.js` 與 source regression 測試。

## v1.3.4
- (SMB-230) Google Drive 帳本同步導入衝突合併機制：新增 base snapshot 快取與三方合併（base / local / remote），pull 時不再直接覆蓋本機未上傳變更；若尚無 base 但本機有 dirty 變更則以雙向合併保留雙方修改。衝突採較新變更（last-write-wins），設定頁顯示衝突筆數與 warning toast。新增 `threeWayMergeSnapshots` 單元測試與 google-drive-ledger-sync source regression 測試；三語 i18n。

## v1.3.3
- (SMB-226) 載具重建：依技術文檔 §3.3.2 補齊載具名稱→交易標籤（`buildCarrierTagsJson` + `importSelectedInvoices` 寫入 `tagsJson`）；Step 3 發票清單與 Step 4 確認預覽新增載具 chip（`carrier-chip` / `preview-carrier`）；新增 `einvoice.step3.carrier_label` 三語 i18n；新增 `test/einvoice-carrier.test.js`（5 案例）與 `einvoice-import.test.js` 載具標籤串接測試（2 案例）；Playwright mobile 驗證 Step3 顯示 2 個「手機條碼」chip、Step4 預覽 2 個載具 pill、無相關 console error

## v1.3.2
- (SMB-215 Restart) 修正 v1.3.1 把「恢復備份」按鈕指到錯誤目的地：Tester 回報「恢復備份需要有自動備份的項目」——v1.3.1 把按鈕 `to` 設為 `/settings/data-management`（只能匯入手動 JSON / CSV 檔），但使用者要的是**自動備份**（Google Drive / WebDAV 登入後一鍵還原）的入口。本次把 `WelcomePage.vue` step 2 與 `PostSetupIntroPage.vue` shared-ledger slide 的「恢復備份」目的地都改為 `/settings/auto-backup`（SettingsAutoBackupPage，含 Google Drive 自動備份面板：使用 Google 登入 → 啟用自動備份 → 立即還原；WebDAV 自動備份面板同理），完全符合 Tester「需要有自動備份的項目」訴求。router meta 把 `allowWithoutSetup: true` 從 `settings-data-management` 移到 `settings-auto-backup`（`settings-google-drive-ledger-sync` 的 v1.3.1 設定保留，因為「帳本同步」按鈕仍指那），讓 0-ledger 使用者從 wizard 進到 auto-backup 不會被 `shouldShowWelcomePage` 攔回。Playwright mobile 412×915 viewport 全程驗證：step 2「恢復備份」連結 `/url: /settings/auto-backup`，點按後 URL 變 `/settings/auto-backup`，畫面顯示「自動備份」標題 + 「Google Drive 自動備份」面板（使用 Google 登入 / 啟用自動備份 checkbox / 立即還原 primary 按鈕）+ 「WebDAV 自動備份」面板。更新 `welcome-page-step2-actions-source.test.js` 為 SMB-215 v1.3.2 invariants：(1) 步驟 2「恢復備份」`to="/settings/auto-backup"` 且**不**指向 data-management；(2) `auto-backup` + `google-drive-ledger-sync` 兩 route 有 `allowWithoutSetup`，`data-management` 已**不再**有；(3) i18n 三語 key 不變。`post-setup-intro-actions-source.test.js` 也同步斷言 shared-ledger 的 restore-backup extraAction `to: '/settings/auto-backup'`，杜絕 data-management 回流

---

## v1.3.1
- (SMB-215 Restart) 修正 v1.2.27 的「恢復備份 / 帳本同步」入口放在錯誤的 surface：v1.2.27 把按鈕加在 `PostSetupIntroPage.vue`（**初始化完成後**的導覽頁 `/welcome/intro`）的 shared-ledger slide，但 issue title「初始化頁面」與 Tester 回報「沒有東西」實際指的是 `WelcomePage.vue` 的 setup wizard 第二頁「建立帳本」（既有的「已有共同帳本？登入並加入」連結那一頁）。本次在 `WelcomePage.vue` step 2 既有 secondary-link 旁邊新增兩顆 `RouterLink`：「恢復備份」→ `/settings/data-management`、「帳本同步」→ `/settings/google-drive-ledger-sync`，僅在 `!hasLedgers` 時顯示（與既有 join_shared_ledger 連結一致），帶 database / cloud-arrow-up FontAwesome 圖示。同時把 `router/index.js` 兩個目的地 route 加上 `meta.allowWithoutSetup: true`，否則 `App.vue` 的 `shouldShowWelcomePage` 會在 `hasLedgers=false / hasAccounts=false` 狀態下立即把使用者攔回 `/welcome`，讓按鈕變成「假入口」。新增 i18n keys `welcome.restore_backup_action` / `welcome.ledger_sync_action` 於三語（zh-TW `恢復備份 / 帳本同步`、en `Restore Backup / Ledger Sync`、ja `バックアップを復元 / 台帳の同期`），順便補回 `welcome.join_shared_ledger` 三語 key（過去只用 inline fallback）。Playwright mobile 412×915 viewport 全程驗證：走完 step 1 → step 2 後三個 secondary-link 真實 render；點「恢復備份」→ 順利進到 `/settings/data-management`（顯示「資料管理」+ 匯入 JSON / CSV 入口，沒被 welcome 攔回）；回 welcome 再點「帳本同步」→ 順利進到 `/settings/google-drive-ledger-sync`（顯示「帳本同步」標題、會員限定說明）。新增 `frontend/test/welcome-page-step2-actions-source.test.js` 共 3 段 SMB-215 v1.3.1 source regression：(1) step 2 含兩個 RouterLink 且都帶 `v-if="!hasLedgers"`；(2) 兩個 route 都帶 `allowWithoutSetup: true`；(3) i18n 兩個 key 三語完整。v1.2.27 在 `PostSetupIntroPage.vue` shared-ledger slide 加的 extraActions 維持不動，兩處入口並存，Tester 無論在哪個畫面都能找到。

---
