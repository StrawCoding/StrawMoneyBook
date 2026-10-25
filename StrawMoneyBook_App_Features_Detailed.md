# StrawMoneyBook App 功能說明（Detailed）

> 本文件依據目前專案程式碼與頁面結構整理，狀態基準為 `2026-08-28`（產品 v1.4.x）。
> 官方 Wiki：https://strawcoding.github.io/StrawMoneyBookWiki/。in-repo 快照：`docs/wiki/`。
> 重點是描述「實際產品能力、使用情境、限制與差異化」，不是單純的檔案索引。
> 如需專案入口與開發指令，請先閱讀 `README.md`；如需檔案對應關係，請搭配 `frontend/StrawMoneyBook_Features_Map.md` 閱讀。

## 1. 產品定位

StrawMoneyBook 是一款以「個人現金流管理」為核心，但不只停留在收入 / 支出記錄的記帳 App。

它把使用者真實會遇到的金流情境一起整合進來，包括：

- 日常記帳
- 多帳本管理
- 預算控管
- 預算剩餘自動轉入存錢罐
- 資產與負債追蹤
- 借貸追蹤
- 報銷與請款流程
- 存錢罐與儲蓄目標
- 訂閱週期管理
- 記帳提醒與連續記帳成就表
- AI / 問答式 / 手動三種記帳方式
- 雲端備份、帳本同步、共同帳本
- Android 小工具與原生能力整合

它的定位比較接近「可長期經營的金流作業工具」，而不是只做快速輸入的輕量記帳器。

## 2. 核心價值

### 2.1 不只記一筆帳，而是管理整段金流流程

StrawMoneyBook 的特色不在單一功能，而在於把同一筆金流後續可能牽涉的流程都串起來：

- 一般消費可直接進入預算與分析
- 可報銷支出可進入報銷流程
- 借出 / 借入可形成待追蹤債權債務
- 暫時存起來的錢可放進存錢罐，不混入可支配餘額
- 請款單可匯入報銷資料並在完成後回寫狀態
- SMB-259 後請款單導入報銷／借出可為每筆已選項目設定「本次請款金額」（預設為待請款／剩餘未收回全額，須 > 0 且 ≤ 可用上限）；請款單建立／編輯表單亦可直接逐筆調整本次請款金額（不必只在導入選取頁設定）；新建草稿 session 分別保存 `importAmountOverrides` / `borrowLoanImportAmountOverrides`；SMB-255 草稿自動同步在來源 pending 下降時只下修（cap）已設定的分批金額，不自動上調至全額；完成請款後來源交易 `reimbursed_minor` 依 claim item 實際金額累計，剩餘可再導入下一張請款單
- SMB-255 / v1.3.35 後草稿請款單會自動同步導入報銷項目：當來源可報銷交易修改 `reimburse_target_minor`、刪除、取消可報銷、直接報銷入帳或 pending 金額變 0 時，`claim-sheet-draft-sync.service.js` 的 `reconcileDraftClaimSheetImportItems` 會只更新 `status='draft'` 請款單內對應的 reimbursement import items（更新 `amount_minor` / 描述或移除幽靈項目）並 `recomputeReimbursementTotal`；`paid` 請款單不受影響；`getReimbursementDetail` 載入草稿時亦會 lazy reconcile 作為安全網
- SMB-247 / v1.3.25 後請款單「導入借出」匯入金額改為剩餘未收回：`listBorrowLoanImportTransactions` 多帶 `loan_paid_minor` 與 `loan_interest_rule_json`，`claim-sheet-import.service.js` 計算 `loan_remaining_minor = 本金 + 預設利息 − 已還金額`，`claimSheetImportedAmountMinor` 與完成請款時寫入 claim item 的金額皆以剩餘未收回為準，不再固定使用 setup 交易原始本金
- SMB-222 Restart / v1.2.48 後請款單「導入借出」清單與已導入借出 claim item 不再顯示交易 UUID：底層 `listBorrowLoanImportTransactions` 多帶 `loans.note / loans.start_date / loans.principal_minor`，前端 `claimSheetImportedTitle` 改為依「往來對象名稱 · 借出備註 → 往來對象 → 借出備註 → 交易備註 → 借出建立日期搭配 i18n → 純 i18n fallback」順序組合，三語 `imported_borrow_loan_item` 翻譯改為「未命名借出 / Untitled lent loan / 名称未設定の貸出」（並同步處理 `imported_reimbursement_item`），完全移除 `t(..., { id: tx.id })` 路徑，使用者再也不會看到 `借出 abc-uuid-1234` 這種系統 ID
- 請款單的導入報銷流程已改為獨立頁面選取，原本建立 / 編輯表單只保留導入按鈕與已選摘要；導入頁可全選或取消全選；SMB-222 Restart / v1.2.44 後請款單導入借出 / 借貸入帳交易已拆出獨立區塊與獨立頁面 (`/claim-sheets/:id/import-borrow-loans` → `ClaimSheetImportBorrowLoanPage.vue`)，不再與導入報銷混在同一份候選列表，建立 / 編輯請款單表單同時顯示「導入報銷」與「導入借出」兩個區塊與兩個專屬按鈕，draft session 也分別保存 `importTxIds` 與 `borrowLoanImportTxIds`；請款單編輯儲存時 borrow_loan 改透過 `buildClaimSheetImportedClaimItem` 正確寫入 `entry_type=income`，不會被誤存為 expense；SMB-222 Restart / v1.2.45 後「導入借入」改為「導入借出」：可導入候選只列出尚未完成的借出（`loans.direction='lend'` 且 `status NOT IN ('settled','void')`、`origin_type='loan_payment'` 的 setup expense 交易，且尚無任何 loan_payment 還款引用該 setup 交易）；完成請款單時會把 borrow_loan 類型 claim items（`source_type='transaction'` 且 `entry_type='income'`）對應的借出整套消除（透過 `clearBorrowLoanClaimSources` 軟刪 loan_payment 來源交易、刪除 loan_payments 還款記錄、軟刪 loans），請款單從 paid 退回 draft 或刪除已 paid 請款單時 `restoreBorrowLoanClaimSources` 會復原這些借出與 setup 交易；繁中 / 英文 / 日文 i18n 改為借出 / lent loan / 貸出，hint 改為「只列出未完成的借出；完成請款單後對應的借出將被消除」；新增請款單時會暫存表單內容再回到原建立流程；SMB-150 後導入頁返回不再依賴瀏覽器歷史，而是固定回到原本的新增 / 編輯請款單流程，避免直接跳離請款單

### 2.2 以帳本為中心，而不是只有單一資料庫

整個 App 幾乎所有功能都以「活動帳本」為上下文：

- 首頁
- 分析
- 資產
- 借貸
- 報銷
- 存錢罐
- 訂閱
- 備份 / 同步

因此可以把個人、家庭、專案、副業等金流完全切開處理。

另外，分類與帳戶的 icon picker 可選圖示以及各頁直接使用的全域 Font Awesome 圖示，目前已收斂為單一註冊來源，集中在前端入口的 `src/main.js` `icons` 陣列維護，避免新增圖示時出現「頁面已使用但未註冊」或「已註冊但 picker 清單不同步」的漂移。

### 2.3 行動端優先，但保留資料治理能力

除了手機上常用的快速輸入與單手操作外，這個專案也有完整的資料維運能力：

- 匯入 / 匯出
- 備份 / 還原
- 修復工具
- 版本更新資訊
- 共同帳本同步

手動執行「重設全部資料」前，資料管理頁會先建立 **durable recovery 備份**（僅 IndexedDB 或可驗證 filesystem／test；**in-process memory 與瀏覽器 download-only 不算**）。若裝置檔案儲存可用則另存一份，否則另觸發瀏覽器下載作 UX（失敗不影響已驗證的 IndexedDB proof）。僅有下載、或 recovery 建立／驗證失敗時，系統會以 `RECOVERY_BACKUP_REQUIRED` 中止操作、**不會**呼叫 `resetDatabase` 清空本機；Google／WebDAV 還原與 JSON 匯入同樣透過 `runConfirmedWipeAfterRecoveryBackup` 強制先取得 verified durable proof 後才 wipe。資料管理頁並提供本機 IndexedDB recovery 的**列出／下載／還原**路徑（模擬重啟後仍可 list／load 取回；外部檔案 copy 失敗時仍可從列表取回）。

smb297 後資料全消失／silent wipe／語意改寫治本：`bootstrap.service` 與 Android `sqlite.initDatabase` **不再**因 schema／`code 1`／FOREIGN KEY 1811 自動 `resetDatabase`／rebuild 本機帳本；失敗改 typed `LOCAL_DB_INTEGRITY` 並提示還原。另以 `data-downgrade-guard` 保全：本機 schema／App 版本地板高於目前二進位時阻擋開啟（`APP_DOWNGRADE_BLOCKED`），避免舊 APK／快取降版造成資料回損。完整 wipe 僅允許明確 UX（重設全部資料、確認後的 JSON 匯入、確認後的 Google／WebDAV 還原、確認後的本機 recovery 還原），且必須 `confirmed`＋合法 `DATA_WIPE_REASON`＋寫入 wipe audit；**recovery 備份必須先成功並回傳 verified durable proof**（`createVerifiedRecoveryBackupBeforeWipe`／`runConfirmedWipeAfterRecoveryBackup`；memory／download-only 不算成功），失敗回 `RECOVERY_BACKUP_REQUIRED` 並中止，禁止 swallow 後繼續 wipe。資料管理頁新增還原指引、本機 recovery 列表與「帳本完整性」掃描／明確修復（倒數確認＋`LEDGER_REPAIR_REASON` audit）；啟動／切帳本僅 scan，**禁止**靜默 `repairLedgerData`。Google Drive／共同帳本 sync replace **強制** `runIntegrityRepair: false`，不得以偽確認在背景改寫帳戶／分類／轉帳／報銷／借貸語意；JSON 匯入預設亦不自動 repair。快照 normalize／orphan FK preserve 改為合成缺失父列（群組／帳戶／分類／預算／銀行連線／借貸等），**禁止**過濾刪減交易與 attachments／loan payments／reimbursement／budget／savings／bank 子列（`droppedChildRows=0`）；健康帳本 normalize 前後交易 id／金額／FK 關聯與子表筆數必須一致。Google Drive 若本機仍有交易而遠端快照為空，阻擋 hard replace（`empty_remote_blocked`）。共同帳本清單為空時說明「伺服器綁定遺失 ≠ 本機 silent wipe」。明確修復仍以 remap／repair account 為主且需使用者明示確認（或倒數確認後的備份還原路徑），禁止以刪光交易修 FK。

smb298 殘餘根因與還原／發版治本：smb297 雖不再 wipe primary，但 Android `plugin-null` 曾切到空的 `straw_money_book_recovery` 當 live DB，造成「資料仍不見」而 primary 仍在。治本改為只重試 primary，失敗才 `LOCAL_DB_INTEGRITY`（禁空 recovery fallback）。空庫但有 IndexedDB recovery 時 Welcome／toast 提示並可進入資料管理還原。`gpr`／`gpr:minor` 強制同步 StrawMoneyBookWeb `app-update.json`＋`api/app-update/play`（Pages→Web-Page／www.strawmb.com）。SavingsJarListPage 修復 `autoSaveAccountOptions` TDZ（Cannot access before initialization）。`playwright:ui-layout` 加 port mutex／獨立 CLI session／`waitForHomeBlocks`／preview 子行程清理，避免並行搶 preview 造成假空白首頁。

官方網站網頁測試版 `https://www.strawmb.com/app/` 連正式營運後端 `https://api.strawmb.com`：GitHub Pages 巢狀 SPA 使用 hash router，production web 的 Google OAuth／共同帳本／載具／銀行 API 不再打到官網同網域。入口為 `https://www.strawmb.com/preview`。`gpr` 會一併發布測試版 SPA。本機 `npm run dev` 也預設連同一營運 API（`frontend/.env.development`）；要打本機後端請用 `.env.development.local` 覆寫。

SMB-190 / v1.2.5 後，資料管理頁手動匯出的全部帳本 JSON 與 CSV 檔名都會加入時間戳，避免在 Android 原生檔案儲存或瀏覽器下載時因固定檔名重複覆蓋，讓多次匯出可以保留各自的檔案版本。SMB-216 / v1.2.29 後，資料管理頁的恢復備份、CSV 匯入與重設資料這類可能超過 3 秒的流程會顯示含百分比的加載動畫與目前動作說明，讓使用者知道系統仍在處理而不是壞掉或卡住。

這讓它更適合長期使用，而不是短期記帳後就難以維護。SMB-220 / v1.2.37 後，Debug 頁面新增 Error Log 紀錄區塊，所有 Vue 元件錯誤、全域 window 錯誤、未處理 Promise 拒絕與 toast 彈窗錯誤訊息都會同步記錄在 in-memory buffer（最多 100 筆），開發者可在設定 → 版本資訊 → Debug 頁面即時查看並一鍵匯出。Error Log 每筆必帶非空 error code：優先使用 `error.code`／`appErrorCode`，其次 `classifyAppError`，再依來源 fallback（例如 `toast_error`／`vue_error`／`window_error`／`unhandled_rejection`／`longtask`），後端 `/api/client-logs` 對舊客戶端缺碼預設 `unknown_error`；Debug 頁一律顯示錯誤碼。SMB-221 / v1.2.40 後，所有設定子頁面的 h2 標題都加入與功能對應的 Font Awesome icon（class="title-icon"），與「關於我們」頁面一致的視覺風格。SMB-250 / v1.3.29 後於設定 → 個人化提供「介面風格」雙模式。現行為**傳統／現代雙 layout**：`traditional` 使用 `apple-ui.css`（Apple HIG：Large Title、Inset Grouped、Segmented Control、list row + chevron）；`modern` 使用 `habitat-ui.css`（Straw Habitat：圓滑色島、分區色彩、實色底欄、無玻璃擬態）。A/B/C/D 主題方案全部可切，與 layout 獨立。未知值預設 `modern`；**不再**把 `traditional` preference 遷移成 modern。**不刪**任何入口或首頁子元件（帳本切換、四段期間篩選、資產卡、預算卡、交易流、FAB、BottomNav）。SMB-254 / v1.3.33 後，設定首頁（`/settings`）的清單項目列高度調小、清單更緊湊：傳統版設定列（`apple-ui.css` 的 `[data-ui-layout='traditional'] .settings-page .setting-group .item-link`）垂直 padding 由 `12px 14px` 改為 `8px 14px`，量測列高由 63px 降至 54px；設定頁（`settings.vue` scoped）列間分隔由 `margin-top/padding-top: 12px` 收斂為 `8px`、描述 `small` 行高 1.35→1.3。傳統版保留每列 `min-height: 44px` 的最小點擊高度，水平 padding 與 safe-area 維持不變，因此縮小高度不影響觸控區域與可讀性。

另外，所有需要輸入資料的彈層已統一為共用 bottom sheet flow，桌面與手機都不再保留另一套輸入型 popover，包含表單 dialog、選單、日期與時間選擇器；`AppDialog` 以及各頁自製輸入 sheet 也都收斂到和快速記帳一致的 shared overlay / bottom-sheet primitives，Android 有底部導覽列 inset 的裝置也會一併吃到底部 safe area，且 sheet 卡片背景會直接延伸到底部，和 `BottomNav` 維持同一個底部基準。

SMB-154 / 0.26.5 後，設定首頁的入口副標、帳號卡未登入提示、登入 / 註冊頁與共同帳本頁使用到的主要介面文案，都已改由正式 i18n key 維護，繁中、英文與日文都有對應文案，不再靠繁中 fallback 或 runtime DOM 翻譯處理這批主要設定流程文字。語言切換（歡迎頁與 `/settings/language`）的三個選項由 `SUPPORTED_LOCALES` 單一清單產生，標籤固定為各語言原名（繁體中文／English／日本語）；`audit:i18n` 直接比對拆檔後的 zh-TW／en／ja 字典，禁止缺 key。日期／金額格式化走 `resolveIntlLocale()`，Android／Wear 原生字串另有 `values-en`／`values-ja`。

前端內部像月份鍵、日期鍵這類共用格式化邏輯，也已收斂到 `src/core/utils/id.js`，避免首頁、分析、日曆、列印頁各自維護相同 helper 後再逐步出現行為漂移。

在互動細節上，Android 返回鍵會優先關閉當前 overlay，再決定是否返回頁面或退出 App；關鍵刪除流程也統一採用自製確認對話框，並額外針對行動裝置補強長按連結與文字選取的防誤觸處理。

各功能頁的返回標題列也統一為帳本同步頁的版型：頁面主 header 直接放在頁面容器下，不包進內容 card / block；左側 chevron 返回、標題置中、右側保留等寬空位；新增 / 主要操作按鈕改放在第一個內容卡的 `panel-head` 右側，和存錢罐頁一致。SMB-178 後借貸、報銷、請款單、訂閱、交易搜尋與相關設定子頁的主 header 已移出內容卡片，借貸、請款單、訂閱項目與帳本設定的主要按鈕也已移到內容卡標題列；電子發票精靈頁也改回共用 `.btn.back-btn` 返回鍵樣式，不再以頁面 scoped CSS 覆寫返回鍵尺寸。記帳頁的 AI / 手動模式切換則固定移到標題列下方，避免寬操作按鈕和置中標題重疊。

同時，像借貸清單與往來對象明細這類會用 query 切換「進行中 / 已結束」的同頁狀態，路由也已補上穩定 `transitionKey`，避免只是切換篩選就觸發整頁淡入淡出動畫。

Android 記帳提醒同步目前也已補強 Capacitor Local Notifications plugin proxy 相容性，載入通知插件時不再把 plugin 物件誤當成 thenable 去呼叫 `.then()`，避免在 Android 端拋出 `LocalNotifications.then() is not implemented` 並中斷提醒初始化。

Google Drive 自動備份在重新登入 / 靜默恢復連線成功後，也會同步清掉先前殘留的 `reauth_required` 自動檢查診斷狀態，不會已經重新授權成功了，設定頁還持續顯示「需要重新授權才能自動備份」。

SMB-213 Restart / v1.2.24 後，Android Google 自動備份的 offline/server auth code 重新授權也會在原生 `MainActivity` 轉送 Capgo SocialLogin 的 Google authorization activity result。Google 授權 PendingIntent 回到 App 後會交給 `SocialLoginPlugin.handleGoogleLoginIntent(...)` 完成登入 promise，避免畫面一直停在「登入中」直到逾時。SMB-213 Restart / v1.2.32 後，自動備份重新登入與手動備份 / 還原的互動式重新授權會要求取得新的長效 refresh token；若 offline exchange 未回傳 refresh token，不再靜默降級成短效 online access token 或沿用舊的失效 refresh token，避免畫面暫時顯示已連線但下一次自動備份又立刻回到「需要重新授權」。SMB-213 Restart / v1.2.33 後，修復後端 Google OAuth exchange / refresh 端點因環境變數未正確載入而回傳 `GOOGLE_EXCHANGE_004 / missing_google_oauth_env` 的問題：`getGoogleOAuthEnv()` 改以 `GOOGLE_AUTH_WEB_CLIENT_ID` 作為 `clientId` 的 fallback，減少需重複設定不同環境變數的情況；`npm start` script 新增 `--env-file-if-exists=/.env`，確保 1Panel 管理的 env 檔在 container 啟動時被載入；伺服器啟動時若 `GOOGLE_OAUTH_CLIENT_SECRET` 等必要 env 未設定，會主動印出警告，避免靜默失效。SMB-213 / v1.2.34 後，api.strawmb.com 使用的 serverless OAuth exchange / refresh copy 也同步支援 `GOOGLE_AUTH_WEB_CLIENT_ID` fallback，不再要求額外重複設定 `GOOGLE_OAUTH_CLIENT_ID`，避免 native 重新授權因 serverless env 命名差異而失敗。SMB-224 / v1.2.46 後，修復 Google 自動備份重新登入時 server auth code exchange 回傳 `GOOGLE_EXCHANGE_005` 的問題：OAuth exchange 端點（backend 與 api.strawmb.com serverless copy）不再從 `GOOGLE_OAUTH_REDIRECT_URI` 環境變數自動帶入 `redirect_uri`，因 Android/iOS offline server auth code 交換不應附帶 redirect_uri，否則 Google 會以 invalid_grant 或 redirect_uri_mismatch 拒絕；前端 `postJson` 也改優先顯示後端 `message`（含 Google error_description）而非機器可讀的 `google_token_exchange_failed`，並將 invalid_grant 類錯誤映射為明確的重新登入提示。SMB-224 Restart / v1.2.47 後，再修復 `GOOGLE_EXCHANGE_005` 在 v1.2.46 部署後仍重現的根因：production env `GOOGLE_OAUTH_CLIENT_SECRET` 被誤設為 client_id 值（結尾為 `.apps.googleusercontent.com`，而非真正的 `GOCSPX-...` web client secret），導致 Google token endpoint 一律回傳 `invalid_client / "The provided client secret is invalid."`；backend 與 api.strawmb.com serverless 的 OAuth exchange / refresh 端點現在會偵測這種「client-id 形狀的 secret」並視為 missing，改回傳 `GOOGLE_EXCHANGE_004 / GOOGLE_REFRESH_004 missing_google_oauth_env`，並在錯誤訊息直接點出該 env 應使用 `GOCSPX-` 開頭的 secret；伺服器啟動時若偵測到此誤設，會額外 `console.error` 一行明確警告；前端 `normalizeGoogleAuthError` 也將 `missing_google_oauth_env / invalid_client / "client secret is invalid"` 類錯誤映射為「Google 自動備份後端設定錯誤，請通知管理員」，避免一般使用者誤以為是自己的 Google 帳號問題。

自動備份排程現在也會主動偵測 Google 授權失效（SMB-110 修正）：若用戶已設定自動備份（`autoEnabled` 或有綁定帳號），但靜默取 token 失敗導致 `connected: false`，不再只寫入 `skipped/not_connected`，而是改寫為 `error/reauth_required`，使設定頁能顯示明確的「需要重新授權」警示並提示用戶操作，不再讓自動備份靜默失效。

SMB-142 重建後，自動備份設定頁會在背景自動偵測 / 自動備份完成後即時重讀最近一次 auto-check 狀態與時間，不再因為頁面只在初次載入時抓一次 state 而長時間停留在「尚未執行自動偵測」；手動備份、背景 due check 與資料變更後備份都會先經過同一個 provider runner，回傳 `completed / skipped / error` 統一結果，並以帳本 + provider 為 lock key 避免同時執行互相覆蓋狀態；runtime 事件也會帶上 `ledgerId / provider / mode / status / reason / checkedAt`，讓設定頁能依目前帳本準確重讀；SMB-147 後，Google 自動備份即使在非原生平台被略過，也會保存 `platform_unsupported` 偵測結果並在設定頁明確顯示；Android 靜默恢復未連線時也會繼續跑 due diagnostics，讓 `not_connected / reauth_required / not_due` 等狀態確實落地，不會誤回到「尚未執行自動偵測」；若使用者正在輸入 WebDAV 密碼但尚未儲存，背景同步也不會把該欄位清空。手機 App 啟動、回前景與帳本切換時的 Google 備份恢復只做靜默授權，不會由背景流程自動彈出互動式 Google 登入。SMB-181 後，手動備份失敗時設定頁的錯誤 toast 改顯示原始 `error.message`（可讀的翻譯錯誤訊息）而非 reason code（如 `backup_failed`）；`buildProviderRunResult` 加入 `errorDetail` 欄位，UI 改用 `result.errorDetail` 建立錯誤，避免 `errorMessage()` 把 reason code 誤當使用者可讀文字顯示。SMB-186 / v1.2.3 後，使用者在自動備份頁明確重新登入 Google 成功時，會清除過期的 `reauth_required` 自動檢查診斷；背景靜默恢復仍保留最近一次實際自動檢查結果。SMB-186 / v1.2.7 後修復兩個造成頻繁需重新授權的根本原因：(1) native 平台可透過明確 OAuth 後端設定啟用 server auth code flow，不再落回 online mode（無 refresh token，access token ~55 分鐘到期即需手動重新授權）；(2) `resolveGoogleProfileForConnect` 在 silent token 失敗但 profile 有快取時，不觸發新的 `googleSignIn` 而直接使用快取 profile，造成 `connected: true` 存入 state 卻沒有有效 token，下次自動備份立即失敗。SMB-191 / v1.2.9 後，Google 自動備份的首次互動登入會先明確使用 Android Credential Manager bottom UI 並關閉已授權帳號過濾，讓 SocialLogin plugin 遇到 `NoCredentialException` 時能自動 fallback 到標準 Google 登入，而不是直接以「Google Sign-In failed」結束登入流程。SMB-192 / v1.2.11 後，自動備份設定頁的初次載入、帳本切換與背景事件刷新只做靜默 Google session 恢復，不再自動開啟互動登入；需要重新授權時由狀態提示保留錯誤，使用者按下登入 / 重新登入才啟動 Google 互動流程，避免設定面板因背景登入逾時或反覆彈出登入錯誤而卡住。SMB-192 / v1.2.12 後，native server auth code 的 exchange / refresh 預設改走 `https://api.strawmb.com`，不再從 `VITE_PRIVACY_POLICY_URL` 或官網靜態 host 推導 OAuth API；後端 route table 也註冊 `/api/google/oauth/*`，讓 API 主機可處理授權碼交換與 refresh token 更新，避免正式 App 打到 `strawmb.com` / `www.strawmb.com` 靜態網站而收到 405。SMB-213 / v1.2.18 後，`resolveServerAuthCodeFlowEnabled` 在明確 env 判斷之後補回以 `GOOGLE_OAUTH_DEFAULT_ORIGIN`（`https://api.strawmb.com`）為 fallback 的 `isAbsoluteHttpUrl` 檢查，讓 native 平台在未設定 `VITE_GOOGLE_OAUTH_API_ORIGIN` 等額外 env 時，預設仍能啟用 server auth code flow（長效 refresh token），不再因 fallback 至 online mode（~55 分鐘 access token）而頻繁要求重新授權。SMB-213 Restart / v1.2.21 後，修復 Android 上 Credential Manager bottom UI（`style: 'bottom'`）與 server auth code flow（`mode: 'offline'`）不相容的問題：Credential Manager 設計用於 ID token 認證，無法在 Android 回傳 `serverAuthCode`，導致 exchange 失敗、fallback 觸發第二個互動登入對話框，使用者若不與第二個對話框互動，即在「登入中...」狀態卡滿 150 秒才出現錯誤。修復方式：`googleSignIn` 中第一次登入嘗試改為依模式動態選擇 UI style：server auth code mode 使用 `style: 'standard'`（傳統 Google 登入對話框，可靠地回傳 serverAuthCode）；online mode 仍使用 `style: 'bottom'`（保留 SMB-191 的 NoCredentialException graceful fallback 行為）。

從維護角度來看，前端已採用 View / Store / Service / Repository 分層，資料層則以 Capacitor + SQLite（含 Web / WASM）維持一致模型，讓功能擴充與跨平台維護成本更可控。

帳戶資料載入也會以請求序號與活動帳本再次比對，快速切換帳本時會丟棄較晚回來的舊請求結果，避免資產與帳戶選單短暫顯示前一個帳本的資料。

這條分層在 SMB-130 後又進一步收斂：`core/services/bootstrap.service.js` 現在只保留資料庫初始化與 recover，`ui/services/app-bootstrap.service.js` 接手 Pinia 與啟動鏈，`ui/services/app-runtime.service.js` 接手背景排程、網址恢復、Android back 與同步/備份 runtime side effects，而 `ui/composables/useAppShellRuntime.js` 則把 App shell 的 route transition、高度鎖定、安全鎖 lifecycle 與更新提示從 `App.vue` 抽離。

交易資料流也已統一從頁面抽離：分析頁、交易搜尋、日曆、交易明細、交易編輯與帳戶明細都不再直接查 `transaction.repo.js`，而是透過 `core/services/transaction-query.service.js` 取得 `all / year / month / day / account / detail-related` 查詢結果；分析頁的分類/帳戶彙總、圓餅圖、長條圖與日別 breakdown 集中在 `core/utils/analysis-breakdown.js`，交易搜尋頁的 filter、批量選取、sheet 狀態與結果摘要則集中在 `ui/composables/useTransactionSearchPage.js`。SMB-211 後，交易搜尋的 SQL 關鍵字條件會同時比對借貸交易的顯示標籤、借貸方向與往來對象，使用者可直接輸入「借出」、「借入」、「歸還 / 還款」或「收回 / 收回借款」搜尋對應借貸交易，而不是只能用底層 `loan_payment` origin type 或備註文字命中。SMB-219 / v1.2.28 後，交易編輯頁與首頁交易編輯 sheet 在改選分類時會同步套用分類預設的報銷、紀錄預算與紀錄收支設定；載入既有交易時則保留該交易原本已儲存的記帳旗標，避免開啟編輯畫面就被分類預設覆蓋。

SMB-155 後，帳戶明細與交易搜尋不再一次載入完整交易歷史，而是以 300 筆為一頁做 SQL 分頁；交易搜尋的日期與關鍵字篩選會先下推到查詢層再取當頁資料，帳戶明細則會額外查詢分頁前交易金額，用來校正每筆交易後餘額，避免第 2 頁以後餘額從錯誤基準開始計算。

SMB-189 / v1.2.5 後，帳本 scoped store 載入前會先執行帳本完整性掃描。smb297 起改為 **scan-only**：偵測異常只寫入可見狀態／toast，**不再**自動 remap 帳戶、清空分類或解除轉帳群組；破壞性修復僅能在資料管理頁明確確認後執行（含 audit）。

會員邏輯也已把 domain 與導頁 side effect 分開：`core/services/membership.service.js` 只保留 entitlement、sync、snapshot 與 limit error 判斷，真正的會員限制導頁改由 `ui/services/membership-navigation.service.js` 處理，避免 core 層再反向依賴 UI router。帳號 Google 登入與 Google 備份也已共用前端 Web Client ID 解析，帳號頁在缺少設定時仍會顯示 Google 區塊與設定提示，不會讓 Google 登入入口整段消失。共同帳本 backend 端則把 `auth` 與 `shared-ledgers` 路由拆成模組化目錄，並由 `backend/src/server.js` 的 route table 分派，`backend/src/collab/http.js` 提供共用 request parsing、method/body guard 與 route error serialization。SMB-232 後，`backend/src/collab/store.js` 的 `updateStore` 不再每次 mutation 全量 upsert 所有 users / shared_ledgers / referrals 並全表掃描比對刪除：載入時以 id → 序列化快照建立 baseline，寫回時只 upsert 新增或實際變更的 record、只刪除實際被移除的 record，並仍包在單一 SQLite transaction 內保持原子性，降低帳本量大時的寫入放大與記憶體成長（mutator API 不變、呼叫端零改動）。

共同帳本快照推送會檢查用戶端帶上的 `baseVersion`，包含初始 `version=0` 邊界；SMB-187 / v1.2.4 後共同帳本快照在套用 tombstone 與合併遠端 / 本機資料後，會先處理缺少必備父資料的孤兒子列：smb297 起改以**合成缺失父列**（資料保全群組／帳戶／分類／預算／銀行連線／借貸等）保留交易金額、id、FK 關聯與子表筆數，避免為修 FK 靜默丟帳或刪減 attachments／loan payments／reimbursement／budget／savings／bank 子列；無法合成的缺失交易目標（如 `paid_tx_id`）可清空可空引用，但**不**刪除子列。替換本機帳本前也會先保留原本本機快照，若遠端快照匯入仍失敗會嘗試復原本機帳本；smb296 後一般 JSON 匯入與 Google Drive sanitize 也統一在寫入前走同一套 FK preserve；smb297 後 Google Drive／共同帳本 sync replace **不**自動 `repairLedgerData`（`runIntegrityRepair: false`），tombstone 父列復活改 bottom-up（交易→帳戶／分類→群組），帳戶／分類刪除會檢查含 soft-deleted 交易與其他 RESTRICT 引用並在硬刪會觸發 1811 時改 soft-delete，DB wipe／ledger purge 維持 child-first 刪除且 `PRAGMA foreign_keys = ON`（禁止 OFF，含 runMigrations 註冊的 009／026 transactions rebuild：先卸離子表 CASCADE／SET NULL 引用再重建），repair 需明確確認且含 soft-deleted orphan，SQLite 寫入層將 FOREIGN KEY 轉成 typed 錯誤與可理解提示（同步失敗狀態可見）；smb297 後 bootstrap／Android init **禁止**因 schema／FK 自動 wipe，完整清空只走明確確認 UX＋recovery 備份＋wipe audit，啟動禁 silent repair，Google Drive 另阻擋空遠端 hard replace；密碼登入在鎖定期間會直接回覆鎖定狀態，不再重複累加失敗次數或延長鎖定；忘記密碼若臨時密碼 Email 寄送失敗，會回滾臨時密碼寫入，保留原密碼可用。

另外，新帳本建立後會立即完成預算模組初始化並可正常載入空月預算，不會因預算項目查詢的欄位歧義中斷 onboarding 或帳本切換流程。

SMB-215 / v1.2.27 後，初始設定後導覽頁（`PostSetupIntroPage`，`/welcome/intro`）的共同帳本步驟會在原本「前往共同帳本」之外，另外提供「恢復備份」與「帳本同步」快速按鈕。進階同步主入口文案指向底部導覽「功能 → 進階功能」，不再寫「設定」或「首頁右上角」。SMB-215 Restart / v1.3.1 後再加強：初始化 setup wizard 本身（`WelcomePage`）的第二頁「建立帳本」也會在「已有共同帳本？登入並加入」連結旁，再加上「恢復備份」與「帳本同步」兩顆 secondary-link 按鈕（僅在 `!hasLedgers` 時顯示，帶 database / cloud-arrow-up FontAwesome 圖示）。SMB-215 Restart / v1.3.2 後再修正按鈕目的地：「恢復備份」改指 `/settings/auto-backup`（自動備份頁，含 Google Drive / WebDAV 登入後**立即還原**入口；Tester 反饋「需要有自動備份的項目」），不再指手動 JSON / CSV 匯入頁；「帳本同步」維持 `/settings/google-drive-ledger-sync`。同步把這兩個目的地 route 加上 `meta.allowWithoutSetup: true`，讓使用者在「還沒有帳本」狀態下點按時不會被 `App.vue` 的 welcome guard 攔回。這樣初始化頁面真的能 onboard「換新裝置、想從自動備份還原」的使用者，從 setup wizard 第二頁一鍵進入自動備份還原流程。

Android 發版目前也已把版本碼策略收斂成由語意版號自動推導的單調遞增規則，並保留一段 Play Store 歷史版本碼安全區間，避免 `0.x.y` 這類版本名稱在新版發佈時反而低於舊的商店版本碼；若 release 產物存在 `mapping.txt`，Play 上傳流程也會一起帶上去模糊化檔，降低 Crash / ANR 排查成本。`npm run gpr` 推送版本 tag 後，GitHub Actions 會建置 AAB、建立 GitHub Release，並透過 Fastlane 發布到 Google Play **測試軌道**；軌道由 `frontend/android/play-testing-channel.json` 的 `channel` 決定（`internal` → phone=`internal`／Wear=`wear:internal`；`closed` → phone=`alpha`／Wear=`wear:WearOS`；禁 `aab_paths` 合軌；Console 須先啟用板型規格 Wear OS 專屬測試群組）。可選 GitHub Actions 變數／env `PLAY_TESTING_CHANNEL` 或 `PLAY_CLOSED_TESTING_TRACK`／`PLAY_WEAR_CLOSED_TESTING_TRACK` 覆寫。SMB-183 後 `gpr` 在 bump 前先執行 `notes:check` 確認專案根目錄的 `release-notes.pending.md` 檔案存在；pending notes 為空時只提示但仍允許發版，patch 發版成功後會封存既有 notes，空 notes 不會建立空白版本區塊，minor 發版則執行 `notes:clear` 清空暫存檔並 push。GitHub Actions 建立 GitHub Release 時也會把暫存檔內容加入 release body，Fastlane 同步填入 Google Play changelog；發佈失敗時暫存檔不會被清空，確保下次發版紀錄不遺失。

另外，CI 的 Android release build 現在也已補上 `frontend/android/gradlew` 的可執行權限，避免 `./gradlew bundleRelease` 在 checkout 後因權限不足直接中斷，讓 bundleRelease 的驗證可以真正跑到 Gradle 階段。CI concurrency 只會取消 PR 的舊 run，`main` push 會排隊跑完，避免發版 commit 與清空 release notes commit 互相產生取消 annotation。Google Play 封閉測試上傳也會針對「Play edit 被外部變更」這類暫時性衝突重開 edit 有限次重試，避免 AAB 已建好卻因 Play Console 或其他發版流程同時修改而直接中斷。

VS Code workspace 目前會透過 `java.import.exclusions` 與 `java.project.excludedPaths` 排除 `frontend/android/**` 的一般 Java 專案掃描，避免 Red Hat Java / JDT LS 在未載入 Android Gradle classpath 時，對 `android.*`、Capacitor、JUnit、Tesseract 與 Android resource 產生大量誤報；Android 原生程式碼檢查仍以 `frontend/android` 的 Gradle task 與 Android Studio 為準。

### 2.4 官方網站品牌搜尋詞同步

官方網站首頁目前已同步補齊品牌與功能搜尋詞，包含：

- StrawMoneyBook
- 稻草AI記帳
- 稻草記帳
- AI記帳
- 對話記帳
- 自動記帳

這些關鍵字會同時出現在首頁 SEO metadata 與首屏文案，讓品牌搜尋、功能搜尋與品牌加功能搜尋更容易命中官網入口。

另外，官網頁面結構目前也已同步重整為一致的網站體驗：

- 首頁改為 icon / symbol 導向的掃讀式結構：首屏只保留一句主要定位，再依序呈現 3 個重點、4 個主要場景與下載 / 預先體驗 CTA
- 首屏不再堆滿多個等權重下載按鈕；Android 為主下載 CTA，iOS 依是否有有效連結顯示狀態或入口
- 手機版官網導覽已改為折疊選單，避免首屏被大量錨點連結擠壓
- 首頁與次頁已補上 icon / symbol 輔助掃讀，降低單靠長段落理解資訊的成本
- 官網保留雙主題切換，但色彩、surface、按鈕、文件頁與邀請頁已收斂到同一套 design tokens
- `/preview` 頁會先說明預先體驗用途與期待流程，再提供外開 Google Form 與內嵌表單
- `/open/shared-ledger` 仍保留共同帳本邀請 deep link、Web redirect 與 Play Store fallback 邏輯，但視覺與操作節奏已和首頁一致
- 服務條款與隱私權政策已改為共用 legal document shell，官網次頁不再各自維護不同閱讀樣式；官網也為 `/terms-of-service` 與 `/privacy-policy` 保留靜態直連 HTML，讓 App 商店或搜尋引擎直接驗證法律文件 URL 時可取得有效頁面而不是 SPA fallback 404

## 3. 主要功能模組

### 3.1 首頁總覽

**首頁**（`src/ui/views/home.vue`）提供：

- 期間 chrome：帳本頂列切換、期間大標與上一期／下一期箭頭、全部 / 年 / 月 / 日 pill（不再把這些塞進一張帳本管理卡）
- 當期收支摘要（`HomeAssetSummaryCard`：收入／支出區塊背景與數字色跟隨主題 `--home-*-card-*` Light／Dark token；淺色模式使用淺綠／淺紅底與深綠／深紅數字，禁止沿用深色硬編碼底；現代介面風格下切換主題後仍可辨識收入／支出語意）
- 預算摘要（在收支卡上方）
- 交易清單
- 浮動快速記帳按鈕（FAB）

問候「今天過得怎樣」與帳本切換收在 `home-hello-block`，帳本是內容寬晶片，不再占滿期間 chrome 頂列。現代 layout 預算簡表只改背景為 `--card`，去掉金洗橄欖底；圓環、數字、左側金線與滑動維持原樣。

期間篩選邏輯由 `useHomePeriodFilter` composable 管理。發薪週期帳本在月模式下，期間標題顯示本期起訖，箭頭切上一期／下一期；曆月模式才顯示「年／月」。這是顯示與導覽，不改 `budget.store` 語意。

另外，首頁交易流在全部 / 年 / 月 / 日範圍皆改為 SQL 分頁載入，每頁最多 300 筆，並提供上一頁 / 下一頁控制；badge 顯示該範圍總筆數。收支摘要卡改由單次 SQL 彙總（`summarizeHomeAssetTotalsByScope`，語意對齊退款淨額、`include_in_analysis`、排除 `loan_payment`），不再分頁掃完全部交易。App 啟動／切換帳本時先完成帳戶、分類與目前預算期間（critical path），完整性掃描與借貸／報銷／附加範本／recent 於背景延遲載入，讓首頁更快可互動；期間快速切換會以請求序號丟棄過期結果。交易明細／編輯改只載入關聯交易（轉帳群組、退款、報銷、借貸同組），分析「全部」範圍改分段查詢並讓出主執行緒。需要跨頁瀏覽或完整歷史篩選時，仍可使用交易搜尋、分析與報表頁。

首頁交易流若目前範圍沒有任何資料，現在會顯示明確空狀態與「立即記帳」入口，不再只剩一行靜態文字；空狀態文案透過 i18n 維護，source test 會同時檢查元件 key 與繁中內容，避免國際化後誤判功能消失；預算簡表左右滑動的切頁閾值也已提高，降低垂直捲動時誤切月均 / 當日可用的機率。

`playwright:ui-layout` 會 bypass onboarding 進入 app-shell 首頁，確認預設為現代 Habitat layout（`data-ui-layout=modern`）、設定 → 個人化可切傳統／現代且會寫入 localStorage、兩種 layout 下首頁區塊／FAB／BottomNav 仍在；強制 Light 主題後驗證收入／支出 block 可見、可讀、版面完整，並抽樣確認 Dark 主題未回歸。

功能列表分為「一般功能」與「進階功能」兩區：一般功能含預算項目（`/budget` 顯示頁）、預算設定（`/budget/settings`）、借貸、報銷、請款單、存錢罐、有價證券、信用卡、訂閱、交易搜尋；進階功能（`feature_list.advanced`）含共同帳本、帳本同步、Drive 備份選檔／舊版還原（smb299 → `/settings/auto-backup#drive-appdata-browser`）、銀行同步（feature flag 閘控）、載具同步、手錶連線（`/settings/wear-companion`）。列上圖示必須在 `fa-icon-registry.js` 註冊（預算設定 `fa-sliders` 曾漏註冊會成空框）。預算項目入口搭配圖示直接導向預算顯示頁；設定入口進期間／項目／池／存款管理。設定頁主清單不再列出共同帳本／帳本同步／銀行同步／載具同步／手錶連線等進階同步入口（深度連結／舊 bookmark 仍可開到同一 route）；自動備份仍在設定頁，並可從進階進入 Drive 選檔還原錨點。smb299 進階列加長後，功能列以 `scroll-margin-bottom`（約 BottomNav 高度）避免末列被固定底欄遮擋；`playwright:ui-layout` 點擊進階入口前會置中捲動並確認列在 nav 上方。

### 信用卡消費制度 P0（smb301）

權威契約 v1.1：`statement_close_day` 當日全天屬本期，`period_end_exclusive=(D+1) 00:00` 才 close；歸期只讀 `posted_at`（`occurred_at` 服務預算／日曆），且以帳本時區解讀帶 `Z`／offset 的瞬間，不用裝置 process timezone；`closing_balance_minor` close 後不可變；還款必經 `credit_repayment_allocations`（`paid`=SUM）；正式 `payment_due_day`＋每期 `due_on`（reminder 僅通知）；雙腿=`transactions`＋`transaction_postings`（禁中介 credit-accrual 帳戶）；merge unit=`credit_card_bundle`。UI：`/credit-cards`（可新增信用卡、不需選母分類；無獨立刷卡表單）、功能頁入口、資產摘要欠款、帳戶明細信用區塊；刷卡＝FAB／快速記帳選信用卡帳戶（createExpense→刷卡雙腿；選單獨立「信用卡」區）、首頁卡可開關預設關。Rollover 於啟動／回前景／信用卡頁補跑且冪等。

正式路徑補齊：交易明細一般退款對信用卡帳戶走 `createCreditRefundAdjustment`，調整分錄強制寫入當期 **open** statement posting（`clampPostedAtIntoOpenPeriod`，即使呼叫端帶 closed 期日期也不改 closing）；closed 帳單交易經批次分類／批次欄位與一般編輯一律硬拒絕；**僅允許純 `occurred_at` 校正**（v1.1：不影響歸期；改 `posted_at` 拒絕）。正式編輯入口 `updateManualTransaction` 必須以 `findTransactionRecordById` 載入完整列（含 `posted_at`），經 `assertUpdateManualCreditMutationAllowed`（內部 `diffCreditManualTransactionChanges`）閘門——未提供 `postedAt` 時不得把 `occurredAt` 誤判為歸期變更——再以 `buildUpdateManualTransactionFields`（不含 `postedAt`）寫入；`updateTransactionById` 不 SET `posted_at`；校正後 `statement_id`／`posted_at`／`closing_balance_minor` 不變。回歸以 `smb301-credit-card-formal-edit-entry` harness **實際呼叫** `updateManualTransaction`＋repository 路徑（非只串 helper）證明；gate／field-builder 另有單元測試。還款 allocation 必須同卡且 ≤ 帳單 remaining；額度警示／利用率以實際卡債（各期 remaining 加總）計算，不以帳戶 raw balance 冒充。

### 3.2 交易記帳

目前支援三種記帳模式：

- AI 自動記帳
- 手動快速新增
- 問答記帳

三種模式共用 `BookkeepingPage` 容器，隱藏 BottomNav（`hideBottomNav`）以免擋住計算機，但品牌頂欄（logo + StrawMoneyBook）與一般 tab 頁相同仍顯示。頂部仍保留與一般 tab 頁等價的 status-bar／瀏海／`safe-area-inset-top` 預留，品牌列、標題、返回與模式切換不得貼齊螢幕頂端或被系統 inset 遮住。其他全螢幕頁（例如交易編輯）仍走 `hideAppChrome`，不會為了補空白而把 BottomNav 或品牌頂欄重新顯示。

帳戶／分類選擇器（含首頁編輯 sheet、問答記帳、借貸／報銷含代收與變更入帳、訂閱／存錢罐／銀行對應、載具／電子發票預設、信用卡還款來源、有價證券交割帳戶）一律走 `CustomSelect` 依母分類／帳戶群組呈現；空值以 `__none__` sentinel（元件會過濾空字串）；表單輸入／選擇底色統一走 `--input-bg`（並保留 `--surface`／`--surface-soft` 別名以免歷史樣式掉底）。

支援的交易型態包含：

- 支出
- 收入
- 轉帳
- 調整

交易資料不只有金額與日期，還可包含：

- 帳戶
- 分類
- 備註
- 附加項目
- 是否納入預算
- 是否納入分析
- 是否可報銷

轉帳情境也支援跨幣別匯率處理，不是只做同幣別搬移。

交易編輯頁保留調整交易的正負金額，負調整不會被轉成正數；跨幣別轉帳若使用手動匯率，無效匯率會在送出前阻擋。SMB-217 / v1.2.30 後，單筆交易編輯頁的金額欄位也改用與手動記帳一致的 `AmountCalculatorInput`，可直接用加減乘除計算後套用金額。計算機倒退鍵使用獨立 `calc-back-btn`，不得套用全域頁面返回 `.back-btn`（否則會疊 chevron + ⌫、格子被壓成 40px）。

借貸模組現在也支援在借貸明細中調整「建立入帳帳戶」，會直接更新當初建立借入 / 借出時產生的那筆初始交易帳戶，而不會誤改後續還款 / 收款紀錄。SMB-225 / v1.2.51 後（v1.2.49 放錯頁面、v1.2.50 mobile 被全域 iOS-nav grid 隱藏，兩種情境均已修正），借出借入主頁點進某對象的「對象明細」頁（同時也是有「匯出 CSV」按鈕的那頁，`LoanCounterpartyDetailPage`），會在頁首與資訊區之間獨立呈現「新增該對象借出」與「新增該對象借入」兩顆 primary 按鈕（desktop 並排、mobile 直向滿寬），不受頁首 iOS 風 nav grid 排版影響；點擊後開啟既有「新增借貸」 sheet，但借貸方向會依按鈕鎖定為 lend 或 borrow，對象名稱自動帶入當前對象，避免使用者誤選方向。

### 3.3 AI 自動記帳

AI 記帳支援自然語句輸入，例如一句話中同時帶入：

- 金額
- 時間
- 帳戶
- 分類
- 報銷關鍵字
- 轉帳語意

目前 AI 記帳還具備以下能力：

- 多行輸入時可批次建立，每行一筆
- 可在解析後人工微調再儲存
- 有警示機制，例如沒找到分類、帳戶不足、轉帳帳戶不足
- v1.4.23 起與手動記帳共用金額／信用卡錯誤對應；解析後自動儲存會保留交易 ID，不再在成功後清掉 ID 而誤以為沒存入
- v1.4.24 起 AI／手動／問答記帳成功後一律返回首頁（還原離開前捲動），不再導向交易編輯頁
- 支援語音輸入
- 支援多語言輸入情境
- 盡量自動判斷分類，避免把已識別內容重複塞進備註
- 語音再解析時，若這次只補到金額 / 類型而沒有新的備註內容，會保留使用者原本已填好的備註，不會被語音流程清空
- 若缺少可用分類，可直接引導使用者前往分類管理補齊
- 金額可直接輸入加減乘除四則運算（含 `+ - * /`、`× ÷`、運算優先序、空白與萬/千/百單位展開），例如 `120+20`、`100+50*2`、`1.5*2萬`、`2千+500`；這類公式不會再誤觸日期/時間解析而把交易日期改亂，也不會把算式符號殘留到備註欄位。求值與手動快速新增計算機共用 `core/utils/amount-expression.js`，避免兩套結果漂移
- 已被用來對應分類、帳戶、自動識別（auto-fill）關鍵字或其他保留識別詞的字詞不會再寫入交易備註；備註只保留剩餘自由文字。使用者明確以「備註／note／memo」標註的內容會保留，即使內含保留詞
- 1.0.3 / SMB-163 後，AI 記帳會把目前帳本的附加項目模板一起納入文字解析；例如使用者已建立折價券、優惠、手續費等模板時，輸入文字中的對應名稱與金額會自動拆成附加項目，且不會再殘留到備註或被誤當成主交易金額
- 1.0.3 / SMB-162 後，AI 記帳與手動新增 / 編輯交易都允許主金額經附加項目完整抵消後成為 0 元；只有附加後淨額為負數才會被前端阻擋

免費版 AI 記帳每日有次數限制，會員可解除限制。

### 3.4 問答記帳

問答記帳適合不想一次填完表單、但也不想完全交給 AI 的使用者。

流程會逐步詢問：

- 類型
- 金額
- 帳戶
- 分類
- 時間
- 備註與附加選項

最後才進入審核與建立，能降低漏填與誤填。

### 3.5 交易搜尋與交易明細

交易除了首頁列表外，也有獨立搜尋與明細頁：

- 交易搜尋
- 交易搜尋支援批量選取後統一調整分類、備註、可報銷、是否納入預算與是否納入收支分析；若選到不適用的交易型態，會在結果摘要明確提示略過原因
- 交易日曆
- 單筆交易詳情
- 單筆交易編輯
- smb292 後自交易編輯（或首頁編輯 sheet）刪除成功會直接回到首頁交易流，並還原刪除前首頁捲動位置（列表變短時 clamp 到有效範圍）；不會停在已刪除項目的詳情／空白頁，詳情頁若載入不到該筆交易亦導回首頁

這讓使用者可以處理「回頭查帳」「找某筆交易」「修正舊資料」等場景，而不必只依賴首頁列表。

交易明細頁的退款流程目前也已補強為：

- 建立退款時可直接選擇退款退回的帳戶
- SMB-149 後建立退款時可指定扣除金額，支援部分退款；首頁、預算、分析與列印報表會以原交易扣除退款金額後的淨額計算
- 退款帳戶限制為一般帳戶，且需與原交易帳戶同幣別，避免沒有匯率語意的跨幣退款
- 退款交易本身不計入預算與收支分析
- 已建立全額退款的原始收入 / 支出交易會從預算與收支統計中歸零，部分退款則只扣除退款金額
- 同一筆原始交易不可重複建立多筆退款，避免重複沖銷

## 4. 財務管理能力

### 4.1 預算管理

預算模組不是只有每月總額，而是落到分類層級的執行管理。

目前可做的事情包括：

- 每月預算總覽
- 帳本可選曆月預算或發薪週期預算
- 分類預算項目管理
- 已用 / 剩餘檢視
- 保留金額檢視
- 複製上月預算
- 超支判讀
- 預算剩餘額自動存入存錢罐
- SMB-260 / v1.3.45 後新增「共同預算池」：可命名並手動設定池總額，綁定多個分類預算（一項最多一池）；首頁 / 月預算總額採 2B 公式（各池 amount + 未入池項目 resolved_amount，入池分類子預算不重複計入）；分類 / 池 / 月總三層各自判斷超支（3C）；池可啟用池層預算存款（`budget_container_month` 月底結算 = max(0, 池總額 − 綁定分類當月支出)），並與分類預算存款互斥；v1.3.48 日池可在池表單直接多選分類，綁定分類不需子預算金額，首頁日模式納入日池日額；其後月池／日池新增滾動日均：今日可花 = 剩餘池額 ÷ 剩餘天數（含今天），超支縮減後續日均、有剩加回池；池設定可選 `surplus_mode=roll`（滾動回池）或 `save`（轉存錢罐，沿用池層預算存款且與滾動互斥）；SMB-268 後新增共同預算池與一般分類預算項目可選「套用至月份」跨月建立（inclusive，含跨年），服務層仍 fan-out 成各月份獨立 budget/container/item，不新增跨月資料欄位；月池金額維持每月金額語意，日池金額維持每日費率並依各月天數計入，一般項目保留金額模式、日期日均規則、預算存款與未入池 / 同名共同池對應，既有共同預算池與既有分類預算項目編輯仍只改當月，且跨月建立前會檢查所有目標月份同名池、同分類項目與缺少目標月共同池等衝突並阻擋 partial write；複製上月、匯出 / 匯入與共同帳本 snapshot 皆含 `budget_containers`
- SMB-269 後，每個帳本可在設定中選擇「曆月」或「發薪週期」預算。曆月是既有預設，既有月預算與歷史資料保留原本 `YYYY-MM` 語意；發薪週期以帳本設定的每月固定發薪日為錨，發薪日當天（含）開始，到下一個發薪日前一天（含）結束，29 / 30 / 31 遇到短月時使用該月最後一天，正確涵蓋二月、閏年與跨年。預算資料層新增通用期間 key、起訖日與 mode，不把跨月週期拆成多筆月預算；交易也不搬移，而是依帳本時區下的實際發生日期落入目前預算期間，服務層會用帳本時區把期間起訖轉成 UTC 查詢範圍，不受 CI runner 或裝置 process timezone 影響。一般分類預算與共同預算池都支援發薪週期；固定額不跨月拆帳，日均項目與日池依該週期實際天數計算，指定日曆日規則只抓週期範圍內符合的日期。預算頁與首頁預算卡會顯示目前週期起訖、上一期 / 下一期與下次發薪日；交易清單、日曆與分析頁仍維持曆月查帳預設。
- SMB-271 後，發薪週期不再只藏在帳本詳細設定：新增或編輯一般分類預算項目、以及新增或編輯共同預算池時，表單內都有「目前帳本預算期間」區塊，可直接選曆月 / 發薪週期並設定每月發薪日。UI 會明確提醒這是目前帳本的預算期間設定，切換會影響該帳本預算頁與首頁預算卡，不是只有單一項目或單一池改變；資料層仍沿用帳本層 `budget_period_mode` / `budget_pay_day`，不把每個預算項目改成互不相容的獨立週期，也不搬移既有曆月或發薪週期資料。新建項目 / 共同池時若同時切換週期，系統會先套用新帳本週期再建立；編輯既有項目 / 共同池時則先保存目前期間的 row，再套用帳本週期並重新載入目前預算期間，避免舊資料被意外搬期。預算設定頁（`/budget/settings`）另有帳本層切換（`budget-page-period-settings`），不必先開 sheet。
- SMB-272 後，App 啟動、重啟或 reload 若遇到既有發薪週期狀態（例如預算 store 的 `monthKey` 為 `pay:YYYY-MM-DD`）不會再把它當成首頁曆月交易篩選，也不會把非法月份送進 `toISOString()` / `Intl.DateTimeFormat` 造成 `Invalid time value`。首頁月份篩選只接受 `YYYY-MM`；預算載入能正規解析 persisted pay-cycle key；交易查詢 repo 對非法年 / 月 / 日 key 回空結果而非拋錯。Debug Error Log 仍保留 message、stack、source、route、component/info 與**必填 error code**，方便追查啟動期 route 尚未完成時的錯誤。
- SMB-273 後，發薪週期會在發薪日邊界自動 rollover：發薪日前一天仍屬舊期，發薪日當天 00:00 起（含）會重新解析為新期。App 首次啟動、完整重啟、頁面 reload、Android 從背景回前景、web/app shell focus 與 visibility 回可見都會重新以帳本時區下的今天載入目前預算期間，首頁預算卡與預算頁不會停在上一期，也不需要使用者手動按上一期 / 下一期。固定額、已花費 / 剩餘、日均 weekday / monthday、共同日池與預算存款結算仍依解析後的實際週期起訖日計算，既有曆月模式與歷史發薪週期資料不搬移。
- SMB-274 後，app-shell 同時觸發 focus 與 visibility reload 時，若兩個預算快照請求同時建立同一期資料，後到請求會讀回先完成建立的期間，而不會留下 SQLite `budgets.ledger_id, budgets.month_key` 唯一鍵 runtime error。其他資料庫錯誤仍正常回報。
- SMB-275 後，預算期間的「今天」一律以帳本時區解析，不再依裝置 process timezone 或 persisted `pay:*` / 上次瀏覽月份推斷。`resolveCurrentBudgetPeriodForLedger()` 成為 cold launch、reload、Android resume、web focus / visibility 與預算頁進入時的唯一入口；發薪週期帳本的首頁月份篩選只影響交易清單，不會再把曆月 key 或月初日期覆寫成錯誤預算期間。lifecycle reload 成功後會廣播 `app:budget-period-sync`，首頁期間篩選與預算頁同步回到帳本時區的今天，曆月帳本仍預設目前曆月。補強跨時區、跨月、跨年、29/30/31 短月 Node regression，並延續 `playwright:budget-pay-cycle` app-shell 證據。
- SMB-276 後，更改每月發薪日或切換曆月 / 發薪週期模式時，系統會先以舊帳本設定解析「今天」所在的目前期間並載入其預算結構，套用新設定後再解析新目前期間；若新舊 period key 不同且新期尚無使用者設定內容（無項目、無共同池、無整期預算存款設定），會自動將舊期的分類項目金額與日均規則、共同池與綁定、整期預算存款設定 carry-forward 到新期，已花費依新期日期範圍重算，交易與歷史期間資料不搬移也不覆寫。帳本詳細設定頁、預算項目 sheet、共同池 sheet 三條入口皆走同一 `applyLedgerBudgetPeriodSettings` 流程，避免改發薪日後預算頁跳到空殼。
- SMB-261 / v1.3.50：`budget.repo.js` 補上 `normalizeBudgetSaveEnabled`，修復 `/budget` 儲存預算存款或切換共同預算池存款開關時 `normalizeBudgetSaveEnabled is not defined` 連續 toast 報錯；三模組（repo / service / save.service）布林正規化邏輯已對齊
- SMB-151 後，預算項目的「日期」分配已改用與首頁查看範圍相同的 `HomeRangePicker` 日期選擇器，並在預算項目情境啟用日曆複選：使用者可在一致的日期 bottom sheet 直接點選多個分配日，系統再轉成每月日號規則，不再只是 1~31 的純數字格或另一套自製月曆，降低選錯分配日期的機率
- v1.4.20 後，預算頁摘要區下方新增「每日花費統計」表：依目前預算期間列出每日日預算（對齊首頁日模式：未入池日均項目 + 共同池今日可花）、當日支出、差額與累計支出；預設顯示至今天為止，可收合。v1.5.2 後此表改為顯示頁的列表視圖，預設改月曆。
- v1.5.2 後，預算「看」與「改」拆開：`/budget` 是只讀顯示頁（期間摘要、月曆每日列入預算的支出、點日明細、分類總表含 Icon）；`/budget/settings` 才是期間模式、複製上月、項目／共同池／預算存款 CRUD。共用日池子項在分類總表顯示該分類整期已用與佔日池百分比進度條，總額／剩餘不列入計算。首頁預算卡「查看」仍進顯示頁；功能列表另有預算設定。發薪週期月曆仍是曆月格，本期以外日子淡化不可點。交易日曆維持曆月，不塞預算剩餘。

此外，分類預算不只支援固定月額，還支援更進階的日均規則：

- 依星期規則計算
- 依每月指定日期計算
- 自動算出當月發生次數與已用次數

這種設計比單純「某分類本月 3000 元」更適合餐費、通勤、週期性小額支出；在發薪週期模式下，同一套規則會用該週期的實際日期範圍計算，而不是硬套曆月天數。

預算頁的互動也已改成 detail-first：

- 分類預算列整列可點擊，先開唯讀詳情，再從詳情進入編輯或刪除
- 詳情會直接顯示分類、預算模式、金額、已用 / 剩餘、日均規則與預算存款摘要
- 項目上的預算存款摘要改成同一行顯示 `日結轉 / 月底結轉` 與 `A -> B` 來源 / 目標，不再拆成兩段堆疊
- 「整月總額預算存款」主卡片現在先顯示摘要與狀態，點進去先看詳情，再進入設定 sheet

另外，月預算摘要與首頁預算簡表現在都新增「保留金額」：

- 只計算 `daily_average` 項目與共同預算日池，不把固定月額算進去
- 以目前檢視月份或發薪週期為基準，依帳本時區即時計算尚未過去規則日 / 剩餘日的預留額
- 月模式 / 期間模式顯示整個期間剩餘規則日與日池日額的保留金額（含當日）
- 首頁日模式則只顯示「今天之後」尚未到來的日均保留金額，不把今天已生效額度算進去

預算模組現在也能把「真正沒花掉的預算」直接轉進存錢罐，而且分成兩條規則線：

- 分類項目別預算存款：`daily_average` 項目在每個已結束日做日結轉，固定額項目在預算期間結束後結轉
- 共同預算池預算存款：池層在預算期間結束後以 `budget_container_month` 類型結算，金額為池總額減去綁定分類該期間支出加總
- 整期總額預算存款：期間結束後把沒有啟用項目別預算存款的分類剩餘額加總後，轉進指定存錢罐（會排除已啟用池層存款的池內分類）

這個流程的幾個重要特性是：

- 一律以帳本時區判斷，不用裝置目前所在時區
- 日結轉只補到昨天，固定額 / 池 / 整期結轉只補到上一個已完整結束的曆月或發薪週期
- 來源帳戶與目標存錢罐會檢查是否同幣別、是否誤選同帳戶、是否選到無效帳戶
- 來源帳戶與目標存錢罐的選擇器沿用快速新增的分組帳戶 bottom sheet，避免不同頁面出現不同的選帳體驗
- 同月份若同分類有多筆 budget item 且其中任一筆啟用項目別預算存款，會直接標記衝突並跳過，避免重複轉帳
- 若剩餘額小於等於 0，會記錄為已檢查但不產生轉帳
- 補跑策略支援 `manual` 與 `delta`：
  - `manual`：首次結算後鎖定，不自動重算
  - `delta`：若歷史交易變動造成應存金額改變，會補差額或反向回沖

因此，預算模組不只是「看還剩多少」，而是能把預算紀律直接轉成實際儲蓄動作，並保留結算紀錄。

**(v1.0.9)**：預算頁頂部新增 `header.row` 包含標題與 `RouterLink.btn.back-btn` 返回首頁（`/`），對齊全域返回列樣式。

### 4.2 分析與報表

分析頁支援：

- 全部 / 年 / 月區間分析
- 收入與支出雙視角（同頁並列圖示化圓餅左 + 長條右）
- 大數字摘要（收入／支出／結餘）
- 分類占比（圖例與長條旁顯示分類 icon，不合併「其他」）
- 支出分類分析會納入正向附加項目，將手續費、服務費等附加金額拆成獨立分析列，主分類金額會扣除該附加金額以維持總支出一致
- 預算達成小卡片（有預算時顯示）
- 帳戶彙總／占比（置於分類之後）
- 細項頁（`/analysis/category`：SQL 依分類／附加項目載入列資料與類型合計，不再把「全部」範圍整本帳本掃進主執行緒再篩選）
- 分析頁右上角一鍵直接匯出 PDF（快捷主路徑）
- 分析頁「交易報表」入口可進入完整報表頁 `/analysis/print`
- `/analysis/print` 交易報表匯出頁：期間客製化（全部／年／月／日／自訂）、螢幕預覽、PDF／CSV；匯出成功後顯示「開啟檔案」（`analysis_print.open_link`／`openFileUrl`），失敗不假顯示；`hideAppChrome` 隱藏 BottomNav，頁內提供返回分析
- 圓餅圖可直接點擊查看目前最大分類 / 帳戶明細，並提供 hover / press 回饋
- 圓餅圖尺寸會隨較窄螢幕縮放，避免固定 220px 在小裝置失衡
- 互動分析頁完整跟隨 App Dark／Light mode（背景、文字、卡片、圖表軌道／文字、期間篩選與 BottomNav 共存）

報表輸出除了 CSV，也支援分析頁一鍵 PDF（html2canvas + jsPDF，檔名 `交易報表_YYYY-MM.pdf`）：抬頭含帳本／期間／匯出時間／幣別／篩選；明細含日期、類型、分類+icon、帳戶+icon、金額、備註、標籤；全彩淺色列印友善、含頁碼、無浮水印。分析頁右上角可一鍵直接下載／分享；完整客製化期間、預覽與 CSV 仍走 `/analysis/print`。App 為 Dark mode（含系統跟隨深色、手動深色）時，互動分析頁 `/analysis` 完整深色適配；PDF／offscreen 報表本體與 raster 仍強制淺色（白／淺底、深色文字、淺色圖表軌道），不受 App 深色 CSS 變數或 `prefers-color-scheme` 影響。`/analysis/print` 的 chrome／控制列跟隨 App 深色，報表預覽本體仍淺色。PDF 匯出前會固定 A4 寬度並套用 `data-print-layout="a4"` 桌面多欄排版（大數字三欄、圖表雙欄、預算卡雙欄），再以等比切片分頁（避開圖表／卡片／明細列中切斷並預留頁碼頁尾空白），避免窄視窗 mobile 堆疊、末頁被拉伸，或區塊／圖表／文字被裁切。適合：

- 月結
- 對帳
- 匯出給他人檢查
- 留存報表

### 4.3 資產與負債

資產頁不只顯示帳戶餘額，而是有明確的財務拆分：

- 總資產（摘要區滿寬；外幣帳戶依匯率 snapshot 換算至帳本幣別後加總）
- 可支配資產／負債（同一列）
- 借出／借入（同一列）
- 有價證券（可選計入總資產；摘要區**有價證券左／信用卡右並排**，`assets-securities-entry`／`assets-securities-amount`：顯示含未交割持倉，無時價／只記資金回退成本；總資產只加已確認交割）

其中「可支配資產」已考慮代收與暫收款不應算成可自由使用金額，因此比一般簡單加總更接近真實狀態。

有價證券為獨立模組（非一般銀行帳戶）：資產頁入口 `/assets/securities`（`data-testid=assets-securities-entry` → `securities-page`）。v2 P1：每個交割帳戶＝獨立投資組合（同代碼可跨交割戶各有持倉）；標的綁 `settlement_account_id`（**交割帳戶來源＝選舉既有資產帳戶或新建證券戶，無需先標記；帳戶詳情／資產帳戶管理不再提供「作為證券交割帳戶」開關；證券建立 sheet 無「標記為交割帳戶」步驟；`listSettlementAccounts`／候選清單不以 `is_settlement=1` 過濾卡死，選用即成立；`is_settlement` 欄位僅相容／遷移惰性保留**）；流水含 `settle_at`／`settlement_status`（scheduled｜confirmed｜cancelled），預設交易日 T+2 10:00（跳過六日）；App 啟動／回前景／證券頁載入補跑到期自動入帳；本金以 adjustment 不計收支、已實現損益進系統分類「投資損益」（可改名不可刪）；精簡資金／完整持倉雙模式（完整持倉賣出必須選擇要平倉的買入交易，1:1 對應、允許部分賣出，剩餘股數／成本由已連結未取消賣出派生，最後一筆吃剩餘本金；成交金額為毛額，手續費 from_proceeds 才從回收扣；只記資金賣出可選對應買入，依該筆買入剩餘成本帶本金並允許部分平倉，最後一筆吃剩餘成本，不選則仍手動填本金／回收；已排程未入帳買入可賣；舊賣出 `source_buy_tx_id` 為空仍走平均成本、不做歷史回填；已有對應賣出的買入不可刪或縮到小於已賣股數／已對應成本）；未實現可切市值估價／只認成本（無手動時價回退平均成本、只記資金顯示投入本金；資產頁證券卡含未交割持倉，總資產只計已確認以免與交割戶現金雙計）；標的（名稱／代碼／類型）與流水可編刪，交割可改期／取消／提前確認（提前確認以按下當下時間入帳，不用原排程 T+2；到期自動入帳仍用排程時間）；已確認刪除或取消經 `withTransaction` 真原子回滾現金腿＋損益腿＋交割狀態（sql.js 實庫證 300→320／280、確認／取消／流水刪除／標的刪除中途失敗不殘留、雙交割戶同代碼獨立入帳）。手續費選填（併入成本或從回收扣）。交割入帳的本金 adjustment／投資損益與證券明細買賣列皆顯示 FontAwesome icon（本金／損益 `fa-chart-line`，流水買下／賣上趨勢）；系統分類「投資損益」缺 icon 時會回填。不做封存、配息、分割、多幣、美股專模、券商 API、即時行情。`playwright:ui-layout` 以 SPA 入口驗收列表頁（禁 welcome 假陽性），並檢查 padding／BottomNav／safe-area、資產摘要「借出／借入同行、有價證券左／信用卡右並排（信用卡不進母分類）」，以及證券建立正式 UI「CustomSelect **依帳戶母分類分組**選 `is_settlement=0` 帳戶→按儲存即可存、無 mark 步驟、不走 store.create 捷徑」。

資產頁現在會把群組金額直接顯示在各帳戶群組列上：

- 每個群組標題列直接顯示群組金額
- 不再額外拆一塊「群組統計」卡片，避免同頁重複摘要
- 群組金額不受單一帳戶「是否納入資產統計」開關影響，和總資產 / 可支配 / 負債各自反映不同管理目的
- SMB-159 / SMB-160 後帳戶可另外設定是否納入群組統計，且群組金額會以目前帳本幣別為目標，依匯率 snapshot 換算外幣帳戶餘額後加總

SMB-212 / v1.2.19 後，分類明細頁新增「預設記帳設定」區塊，可針對各分類分別設定「預設紀錄收支」（`default_include_in_analysis`）、「預設紀錄預算」（`default_include_in_budget`）與「預設報銷」（`default_is_reimbursable`）三個開關；使用者在快速記帳（手動新增）選取該分類時，交易表單會自動套用對應的預設值；現有分類預設值與舊行為一致（紀錄收支開、紀錄預算開、報銷關）。

### 4.4 帳戶與帳戶群組

帳戶管理支援：

- 多帳戶
- 帳戶群組
- 是否納入資產總額
- 是否納入群組統計
- 帳戶 icon
- 是否納入資產統計
- 帳戶幣別設定

這讓使用者可以把現金、銀行、信用卡、電子錢包、儲值型帳戶等拆開管理。

## 5. 進階金流情境

### 5.1 借貸管理

借貸不是靠備註手記，而是獨立模組。

可支援：

- 借出
- 借入
- 往來對象追蹤
- 還款
- 作廢
- 借貸明細檢視

這可以把「一般支出」與「暫時借款」明確拆開，避免分析失真。

v1.2.6 後，若建立借貸時已設定「預設利息」，單筆新增 / 編輯還款會檢查還款後總額不可超過本金加預設利息目標總額。

v1.2.22（SMB-214）後，支援利息功能：新增 / 編輯還款時若輸入金額超過剩餘本金，超出部分自動計為利息並建立對應的利息交易（分類「借貸利息」，借出方向為利息收入、借入方向為利息支出）；還款表單會即時顯示「超出本金部分 X 元將計為利息」預覽；若借貸已設定預設利息，上限仍為本金加預設利息，不允許超額。

v1.2.15（SMB-210）後，借出 / 借入建立與所有還款（含利息）產生的交易，預設 `include_in_budget = 0`、`include_in_analysis = 0`，不計入收支分析與預算統計，避免債權債務移轉扭曲月度收支；使用者仍可於交易明細頁手動開啟計入。

### 5.2 報銷管理

報銷模組處理的是「先墊付，後回收」的情境。

現有能力包含：

- 建立可報銷支出
- 待報銷清單
- 已報銷管理
- 報銷入帳
- 代收 / 抵扣
- 報銷抵扣使用紀錄
- 已完成請款單匯入的報銷項目會回寫到報銷清單與資產未報銷總額，不會繼續留在待報銷
- 自訂報銷金額（SMB-237 / v1.3.11）

SMB-237 / v1.3.11 後，報銷清單未報銷項目可點「報銷金額」開啟底部設定面板，輸入實際要報銷（請款）的金額或一鍵重設為原始支出。設定值存於交易表 `reimburse_target_minor` 欄位（migration 036，未設定為 NULL）；一旦設定，匯出 CSV（新增「報銷金額」欄位）、請款單導入金額（`claimSheetImportedAmountMinor` → `reimbursementPendingMinor`）以及報銷待處理 / 已報銷金額計算都改以設定金額為基準（`reimbursementClaimableMinor`），未設定時則維持以原始支出（扣除附加項目）計算的舊行為，已報銷金額仍會被設定金額上限約束。

特別重要的是：代收金額不會直接被當作自由可支配收入。
SMB-148 後，代收管理頁會保留「已部分抵扣但仍有可用餘額」的代收，方便繼續選用剩餘額；只有完全未抵扣的代收能直接刪除，已有抵扣紀錄的項目需先到抵扣紀錄移除關聯。

### 5.3 請款單

請款單模組比單純報銷再多一步，適合正式整理請款內容。

它可以：

- 建立請款單
- 編輯請款項目
- 匯入報銷項目
- 完成請款
- 同一張請款單分次入帳，每次依本次金額 FIFO 回寫
- 檢視請款單細節

這讓使用者能把零散的報銷彙整成真正可提交的請款資料。請款單完成後，匯入的原報銷交易會被視為已報銷，報銷清單、資產頁未報銷金額與狀態同步邏輯都會採用同一個已完成請款單來源；若請款單還原後再次完成，先前軟刪的入帳交易也會釋放冪等鍵，避免同一張請款單重新入帳時撞到唯一鍵。SMB-255 / v1.3.35 後，草稿請款單內已導入的報銷項目會在來源交易變更時自動同步，不需使用者手動重新儲存請款單。

SMB-259 後，導入報銷／借出選取頁可為每筆已選項目設定「本次請款金額」（預設為待請款／剩餘未收回全額，須 > 0 且 ≤ 可用上限），不必一次請完；請款單建立／編輯表單亦列出已導入項目並可直接編輯本次請款金額；新建草稿 session 分別保存 `importAmountOverrides` 與 `borrowLoanImportAmountOverrides`；草稿自動同步在來源 pending 下降時只下修已設定的分批金額，不自動上調至全額；完成請款後來源交易 `reimbursed_minor` 依 claim item 實際金額累計，剩餘可再導入下一張請款單。

v1.5.8 後同一張請款單可多次入帳：入帳畫面填「本次入帳金額」（預設剩餘未收），每次只按這次金額 FIFO（項目 `created_at`）回寫 `reimbursement_items.settled_minor`、建立 `reimbursement_payments`／allocations、來源交易 `reimbursed_minor` 改看已回寫金額（不必等整張 `paid`），借出收回與代收也只結清這次分配到的切片；剩餘 > 0 時狀態維持進行中／收款中，剩餘歸零才標 `paid`。還原或刪除已入帳請款單會一併清掉分次紀錄與對應入帳／還款。

### 5.4 存錢罐

存錢罐是獨立的儲蓄容器，不等於一般帳戶。

支援：

- 建立存錢罐
- 存入
- 提取
- 目標金額
- 無上限模式
- 是否納入資產
- 帳戶群組歸類

其設計目的是把「已決定先存起來的錢」和「日常可花的錢」切開。

免費版存錢罐數量有限，會員可解除限制。

存錢罐自動存入會依帳本時區判斷排程日期與建立交易時間；v1.2.6 後非 App 預設時區的帳本在跨日邊界不會提早或延後觸發自動存入。

### 5.5 訂閱追蹤

訂閱模組用來管理週期性支出，例如影音服務、雲端服務、會員費。

支援：

- 訂閱名稱
- 週期單位與週期值
- 扣款日
- 對應帳戶
- 對應分類
- 暫停
- 下次扣款日推算
- 今日到期自動建立支出交易

訂閱扣款日以當天開始為扣款時間點；一進入扣款日就會視為本期已到期，列表中的「下次扣款」也會推進到下一個週期，不會等到該日結束後才更新。排程日期會以純日期和 App 預設時區正規化，避免在 UTC / CI 執行環境中把台北時間午夜誤判成前一天。v1.2.6 後，自動扣款 runner 會再依目前帳本時區判斷「今天」是否到期，非預設時區帳本在跨日邊界不會誤扣或漏扣。

App 開啟、回到前景、切換帳本與儲存訂閱項目後，會檢查目前帳本中「今天到期」且未暫停、金額與帳戶 / 分類完整的訂閱項目，並建立一筆 `recurring` 來源的支出交易。每個訂閱每個扣款日使用固定冪等鍵，避免同一天重複開啟 App 或儲存項目造成重複扣款；非今日到期項目不會被回溯補扣。

這比每月手動新增一筆相同支出更容易維護。

## 6. 協作、同步與資料安全

### 6.1 多帳本

帳本是資料隔離的核心。會員可使用多帳本，免費版有限制。

多帳本的好處包括：

- 家庭帳與個人帳分開
- 工作專案帳與私人消費分開
- 測試帳與正式帳分開

### 6.2 共同帳本

共同帳本是會員功能，支援多人協作。

目前流程包含：

- 建立共同帳本
- 產生共享連結
- 使用 Email 邀請（SMB-234 / v1.3.6 後，寄送結果會明確回傳 sent / failed / not_configured 狀態；設定頁會顯示成功或失敗 toast，待加入清單可看重發狀態，失敗時可重發邀請）
- 接受邀請後下載到本機
- 自動同步開關
- 取消共享

這代表它不是單純把資料丟上雲端，而是有共享身分與同步關係的設計。後端唯一資料源 `collab-store.sqlite` 以 `npm run backup:collab`（`backend/src/collab/backup-store.js`）做線上 SQLite backup，輸出 `.server-data/backups/collab-store-<UTC>.sqlite` 並保留最近 14 份；頻率、環境變數與還原演練見 `docs/backup-strategy.md`，發版清單見 `docs/release-checklist.md`。

本機帳本硬刪除交易／信用卡 posting／預算池／證券／帳單列時，`deleted_log` 需留下 tombstone 供共同帳本合併。migration 026／045 以 DROP+RENAME 重建 `transactions` 後曾遺失 `trg_deleted_log_transactions`；047 補回該觸發器並補齊 018 之後新增、已列入 snapshot 的表。048 在父交易軟刪時同步軟刪 `transaction_postings`（FK ON DELETE CASCADE 對 `deleted_at` 無效）。sql.js 測試路徑以 BEGIN＋SAVEPOINT 包 migration 檔（COMPAT-001）；Capacitor／jeep-sqlite 連線禁止 SQL BEGIN／SAVEPOINT，否則網頁會卡在「資料載入中」。CI 先 `prepare:android:release` 再跑 Android／Wear JVM 單元測試。

SMB-188 / v1.2.4 後，PostSetupIntroPage 新增了「共同帳本」專屬步驟，讓首次設定的使用者能在導覽中直接了解並前往相關設定。

SMB-229 / v1.3.9 後，共享帳本導入角色權限系統，區分 Owner / Admin / Member / Viewer 四種角色，並以集中式權限矩陣（`backend/src/collab/store-shared-ledgers.js` 的 `getSharedLedgerPermissions`）作為前後端共用的單一事實來源：

- Owner：全部權限，可上傳、邀請、調整成員角色、轉移所有權、刪除帳本。
- Admin：可上傳快照、Email 邀請與重發、調整 Member/Viewer 角色（不可動其他 Admin/Owner，亦不可建立 Admin）。
- Member：可上傳快照，但不可邀請成員。
- Viewer：唯讀，只能下載（pull）最新快照，不能上傳變更或邀請。

後端每個敏感 endpoint 都依角色檢查：`handleSnapshotPush` 禁止 Viewer 上傳（回 403 `shared_ledger_forbidden`）、`handleInviteByEmail` / `handleResendInvitation` 禁止 Member 與 Viewer 邀請；新增 `POST /api/shared-ledgers/:id/members/:userId/role`（改角色，受 `canAssignMemberRole` 治理）與 `POST /api/shared-ledgers/:id/transfer`（轉移所有權：目標升為 Owner，原 Owner 降為 Admin）。帳本 detail 回傳成員清單（`buildSharedLedgerMemberList`），summary 附帶 `permissions`。前端 `SettingsSharedLedgerPage.vue` 依 `permissions` 顯示/隱藏分享連結與 Email 邀請，新增「成員與角色」管理區（角色下拉、轉移所有權確認對話框）與 Viewer 唯讀提示；背景自動同步對 Viewer 跳過上傳，若被遠端降級為 Viewer，dirty 同步遇 403 會清除佇列避免重試風暴。

SMB-277 後再補強共同帳本可用性：

- 會員登入狀態：冷啟動／回前景靜默 refresh；失敗時保留 profile 並在帳號頁與共同帳本頁標「需重新登入」，禁止誤顯示未登入；背景同步在需重新登入時暫停。
- HTTPS 共享連結為主路徑：產生／複製／系統分享皆強制 `https://www.strawmb.com/open/shared-ledger?...`；Owner/Admin 可 `POST /invite-code/rotate` 產生新連結；Email 邀請保留為次要路徑。
- 同步狀態 UI：顯示上次同步時間、版本、錯誤與重試；Viewer 自動同步文案改為「自動下載最新資料」。
- 交易編輯者標註：migration 040 為每筆交易保存 `created_by_*` / `updated_by_*`（user id + 顯示名快照）；新建／編輯／批量更新寫入目前登入者；共同帳本清單與詳情顯示建立者／最後編輯者；單人非共享帳本僅在有異於自己時顯示。

SMB-279 再修會員登入狀態與帳本同步回歸：

- `needs-reauth` 寫入 `localStorage`，process death／冷啟動不再把「有 profile、無 access token」誤顯示成 Session 有效。
- `canUseApi`／`isSharedLedgerAuthenticated` 改以實際 access token 為準；cookie mode 只負責 auth restore，不能單獨當成可同步。
- 冷啟動、回前景與 `visibilitychange` 先 restore session，再跑共同帳本／Google Drive 背景同步。
- 同步 gate（需重新登入／會員資格／離線／session 恢復中）寫入可見 `last_sync_status=paused_*` 與錯誤文案，帳號／共同帳本頁顯示「Session 恢復中」或「同步暫停」。

smb288 再修帳號／會員登入 Session（smb277／smb279 之後仍可見的回歸）：

- Web profile 仍只放 `sessionStorage`（降低 XSS 持久化面），另以 `straw.shared_ledger_auth_hint.v1`（localStorage）記住曾登入；tab 關閉後冷啟動仍觸發 cookie 靜默 restore，帳號／共同帳本／設定頁顯示「Session 恢復中」而非閃未登入表單。
- `ensureSharedLedgerSessionReady`／同步路徑不再因 cookie mode 恒 true 對匿名使用者每輪打 `/api/auth/refresh`；僅 hint／profile／native refresh／deferred retry／一次 force probe 才 restore。
- `scheduleActiveSharedLedgerAutoSync` 與 sync gate 寫入可見 `paused_reauth`／`paused_membership`／`paused_offline`／`paused_session`（離線優先），禁止 silently no-op。
- token 過期／靜默 refresh 失敗仍保留 profile + hint 並標「需重新登入」；CORS／SameSite／`X-Straw-Native-Client` 合約維持（本階未改 backend 產品碼）。

smb306 修會員登入 Session「已過期／需重新登入」掉線：refresh 已在伺服器 rotate 成功但客戶端逾時／回應遺失時，重送舊 refresh token 不再立刻 family revoke。後端 60 秒 grace 內沿 `replaced_by_token_id` 走到 live family head 再 rotate；grace 過後仍 `refresh_token_reuse_detected`，且 family revoke 必須在 SQLite transaction commit 後才丟錯（避免 better-sqlite3 throw 回滾導致撤銷沒寫入）。前端 `refreshGeneration` 丟棄過期 refresh 回應，避免遲到的舊 token 覆寫較新 rotation。`SHARED_LEDGER_REFRESH_ROTATION_GRACE_MS` 可覆寫 grace（預設 60000）。

SMB-281 修復「無法取消共用帳本」：

- Owner「取消共享」會刪除遠端共同帳本並清本機 binding；成員／Viewer「不再共享」只結束自己的成員關係，本機資料保留。
- 會員資格過期時建立／邀請／同步仍鎖定，但設定頁會顯示本機共同帳本綁定與解除入口；後端 `DELETE /api/shared-ledgers/:id` 放行會員閘門，避免卡在無法離開。
- 遠端已刪除或不存在時回 `already_gone`／前端仍清本機 meta；needs-reauth／session 恢復中不可靜默失敗，改顯示明確 toast；確認對話框 busy 結束後可再操作。

smb290 治本共享帳本／同步資料完整性：

- 移除會把帳戶與全部相關交易綁成一組的 `account_coherence`（遠端只改帳戶欄位時不再抹掉本機未同步交易）。
- `pullSharedLedgerToLocal`／已綁定下載改以 base snapshot 三方合併或 dirty 雙向合併，禁止 hard-replace 覆蓋未推送本機變更；合併後若仍有本機獨有變更會保持 dirty 並由編輯者推送。
- 父列 tombstone 若子列較新，會從 payload 復活父列，避免 FK prune 連鎖丟帳。
- 衝突採可重現 last-write／prefer 規則，並寫入可見 `last_sync_status=conflict_resolved`、`last_conflict_count`、`last_merge_log`；共同帳本頁狀態列與重試 toast 會提示。
- 背景 poll 在 detail 請求期間若本機變 dirty，改走 push／merge，不硬拉遠端。

### 6.3 Google Drive 帳本同步

這個功能和「備份」不同。

帳本同步的特性是：

- 以帳本為單位開啟
- 資料異動後即時同步到 Google Drive `appDataFolder`
- 在其他裝置可拉回最新版本
- 只有選定帳本會同步
- SMB-218 / v1.2.26 後，拉回遠端快照前會先確認快照內的 `ledger_id` 與目前帳本一致；若不一致會停止同步，避免錯帳本覆蓋本機資料。替換本機帳本前也會先建立本機 JSON 快照，若遠端匯入失敗會嘗試復原原帳本與本機同步設定，降低拉回異常資料造成資料遺失的風險
- SMB-230 / v1.3.4 後，Google Drive 帳本同步導入與共同帳本相同的三方合併（base / local / remote）：每次 push 會保存 base snapshot，pull 時若本機與遠端同時有變更會自動合併而非直接覆蓋；若尚無 base 但本機有未上傳變更，會先以雙向合併保留雙方修改。衝突時採較新變更（last-write-wins），設定頁會顯示衝突筆數提示與 warning toast
- SMB-236 / v1.3.8 後，共同帳本與 Google Drive 快照合併不再對關聯資料列各自 last-write-wins：`snapshot-merge.js` 以 merge unit（帳戶連帶交易、轉帳雙腿、借貸還款、請款與預支 bundle）偵測跨表混用，衝突時整組採用較新一方並記錄於 `buildMergeLog`；雙向合併與三方合併都會回報衝突筆數，避免例如本機新增交易但遠端更新期初餘額時被靜默合併成不一致狀態
- SMB-235 / v1.3.7 後，Google Drive 帳本同步會記住每個帳本綁定的 Google 帳號 email；若瀏覽器或裝置上的 Google 登入帳號與綁定帳號不同，push/pull 與背景同步都會停止並記錄帳號切換 log，不再靜默推送到錯誤帳號。設定頁會顯示綁定帳號與待確認切換提示，手動同步或啟用時需確認是否改綁定；背景偵測到切換時也會顯示 warning toast 引導使用者到帳本同步頁處理

適合跨裝置持續作業，而不是只做災難復原。

開啟 App 時（含從背景恢復前景），`app-runtime.service.js` 會同時觸發共同帳本與 Google Drive 帳本同步的背景同步，無需手動操作。

SMB-188 / v1.2.4 後，PostSetupIntroPage 新增了「帳本同步（Google Drive）」專屬步驟，讓首次設定的使用者能在導覽中直接了解並前往相關設定。

### 6.4 自動備份與還原

備份模組支援兩條路線：

- Google Drive appDataFolder
- WebDAV

可做的事情包括：

- 連線
- 啟用自動備份
- 設定備份間隔
- 資料變更時自動備份
- 立即備份
- 立即還原
- **smb299**：Drive appDataFolder 列檔／選檔還原／revision 舊版還原（預覽帳本名稱、交易月份分佈、有效筆數；顯示較舊／較新與月份覆蓋警告；**預覽失敗或未通過正式 importer 結構＋資料列 INSERT／CHECK enum 閘門（非僅摘要／非僅 ledger_id）不得進入確認／wipe**；正式還原路徑先驗證可匯入再 durable recovery，recovery 失敗或下載不可匯入時中止不清空本機；**wipe 後若 import 仍失敗則先再 wipe 清除部分匯入殘留，再以 durable recovery 回滾至 wipe 前原狀**（sql.js 實庫回歸驗證最終列＝wipe 前快照，非原本地＋殘缺雲端），禁止 silent wipe）。同閘門亦套用至 Google／WebDAV「立即還原」與資料管理 JSON／本機 recovery 還原（wipe 前拒絕缺 ledger_id／空帳本殼／未知欄位／缺必要欄位／不合 CHECK enum 如 `type=not_a_valid_type` 等不可匯入內容）。

這是偏向保底、留存、災難復原的機制，和即時同步是不同層次的需求。

另外，Google 自動備份登入流程也已補強為在 App 啟動與回前景時嘗試靜默恢復，並優先沿用上一次備份使用的帳號，降低背景切到錯誤 Google 帳號的風險；若靜默恢復失敗，背景流程只會寫入需重新授權狀態，互動式登入保留給使用者在自動備份頁手動操作。

立即備份流程目前也會先進入自動備份 provider runner，由 runner 先確認設定保存成功才執行實際備份；若 WebDAV / Google 尚未連線、設定更新失敗，或同一帳本同一 provider 已有備份執行中，不會繼續用舊設定觸發另一個備份，避免使用者看到連線或保存錯誤後又收到另一個備份失敗結果。

另外，背景排程、資料變更後的自動備份與 Google 靜默恢復後補跑的 due check，現在都會透過 provider runner 執行並在完成後逐 provider 通知設定頁重讀狀態，因此「最近偵測」與「自動偵測」描述會即時更新，而不是要離開頁面再回來才看得到；手機背景恢復不會觸發 Google 互動登入彈窗，避免使用者只是在開 App 或切帳本時被授權流程打斷。

### 6.5 匯入 / 匯出 / 修復

資料管理頁除了備份，還包含：

- 匯入
- 匯出
- 重設
- 一致性修復

對長期使用者來說，這些能力很關鍵，因為真正的記帳工具不能只會新增資料，不會維護資料。

## 7. 帳號、會員與商業化設計

### 7.1 帳號系統

目前帳號系統支援：

- Email 註冊
- Email 登入
- Google 登入 / 綁定
- 個人資料管理
- 頭像
- 登出
- 忘記密碼
- 臨時密碼
- 強制改密碼流程

這表示帳號系統不只是 demo 登入，而是有基礎帳務保護與恢復流程。

SMB-233 / v1.3.5 後，共同帳本帳號 session 不再把 refresh token 或 access token 寫入 `localStorage`：Web / Capacitor 客戶端改以 `X-Straw-Auth-Storage: cookie` 搭配 `credentials: include` 讓後端以 HttpOnly cookie 管理 refresh token rotation，access token 僅保留在 JS 記憶體，使用者資料改存 `sessionStorage`（`straw.shared_ledger_user.v2`）；頁面重載或 App 重啟時會先嘗試以 cookie 靜默 refresh 再恢復 Bearer session。後端 `auth-cookies.js` 會在 cookie 模式下省略 JSON 內的 `refresh_token`，並於 logout 清除 cookie；`http.js` 也補上 `Access-Control-Allow-Credentials` 與 CSP meta（前端 `index.html`）降低 XSS 外洩風險。既有 `straw.shared_ledger_session` localStorage / sessionStorage 舊資料會在首次讀取時自動遷移並清除 token 欄位。SMB-238 / v1.3.12 後修復帳號頁 Google 登入準備階段在 Capacitor `https://localhost` 連線正式 API 時的 `shared_ledger_network_error`：只有登入 / refresh / logout 等明確 `useAuthStorage: true` 的請求才附帶 cookie auth header 與 `credentials: include`，`POST /api/auth/google/prepare`（login 用途）不再誤帶 credentials 觸發 CORS 與 `Access-Control-Allow-Origin: *` 不相容；後端收到 cookie auth 時改反射實際 Origin 並附 credentials header，匿名跨域仍維持 `*`；帳號頁也會捕捉 prepare 失敗並顯示 toast。SMB-238 / v1.3.13 進一步修復實際登入提交 `POST /api/auth/google`（`useAuthStorage: true`）的跨域 CORS preflight：瀏覽器送出的 `OPTIONS` preflight 不會攜帶實際 `X-Straw-Auth-Storage` header，而是改用 `Access-Control-Request-Headers` 通告，導致後端 `wantsCredentialedCors()` 在 preflight 偵測不到 cookie auth、於 `ALLOW_ALL_ORIGINS=*` 時回 wildcard `Access-Control-Allow-Origin: *`，瀏覽器因 credentialed 請求收到 wildcard ACAO 而拒絕 preflight（Failed to fetch）。修正後 `wantsCredentialedCors()` 在 preflight 改檢查 `Access-Control-Request-Headers` 是否包含 `x-straw-auth-storage`，使 preflight 與實際請求都反射實際 Origin 並附 `Access-Control-Allow-Credentials: true`，匿名 preflight 仍維持 `*`。SMB-238 / v1.3.14 修復 Capacitor `https://localhost` 登入後會員自動被登出：`auth-cookies.js` 的 `shouldUseCrossSiteCookie()` 改以請求 Origin 與 API `Host` 是否相同決定 refresh cookie 的 `SameSite` 政策（跨站如 localhost → api.strawmb.com 使用 `SameSite=None; Secure`），避免 refresh 時瀏覽器不帶 HttpOnly cookie 而 `clearSession()`；`readPersistedAuthSession` 在 cookie 模式下即使 access token 僅存記憶體、重載後暫缺 token，仍保留 sessionStorage 使用者資料供靜默 refresh 恢復 session。SMB-239 / v1.3.18 後再修復 Android / iOS 冷啟動後會員登入狀態無法保持：Capacitor WebView 在 process 結束後會清空 `sessionStorage`，v1.3.14 的 sessionStorage 使用者快取無法跨 App 重啟保留，設定 / 會員頁在靜默 cookie refresh 完成前會誤顯示未登入；`auth-session-storage.js` 改為在 native 平台把使用者 profile（不含 token）存進 `localStorage`，Web 仍只用 `sessionStorage`；`refreshSharedLedgerSession()` 在 cookie 模式且 access token 已從記憶體清空時，改委派 `restoreSharedLedgerSession({ force: true })` 以 HttpOnly refresh cookie 恢復 session，不再直接回傳 null。SMB-243 / v1.3.22 修復跨站 API 回應 `Cross-Origin-Resource-Policy: same-site` 仍阻擋 Capacitor 讀取回應，改為跨站請求回 `cross-origin`。SMB-244 / v1.3.23 修復 SMB-242 新增 `X-Straw-Native-Client` 後 CORS `Access-Control-Allow-Headers` 未列入此標頭，Android/iOS credentialed 預檢被拒絕而 Google 登入仍 Failed to fetch。

### 7.2 會員權益

會員頁目前反映的權益包含：

- 共同帳本
- 銀行同步
- Google Drive 帳本同步
- 多帳本
- AI 記帳次數解除限制
- 存錢罐數量解除限制
- 帳戶數量解除限制
- 借貸數量解除限制
- 報銷數量解除限制
- 訂閱項目解除限制

另外還有首次付費會員 3 天免費試用機制。

### 7.3 Google Play 會員流程

Android 端已有 Google Play 會員整合：

- 月費方案
- 終身方案
- 恢復購買
- 開啟訂閱管理
- 促銷碼兌換
- 會員權益同步

因此會員並非單純本地旗標，而是有商店流程與狀態同步。後端 Google Play 會員同步會依有效的未來到期時間建立會員 grant，並用同一份 grant 判斷共同帳本會員權限；測試資料需使用相對未來到期日，避免固定日期過期後造成 CI 誤判。

### 7.4 邀請碼 / 推薦制度

後端已具備推薦碼與會員獎勵邏輯，作為會員成長與使用者擴散機制的一部分。

### 7.5 關於頁與聯絡入口

設定中的「關於我們」頁目前集中提供：

- 官方網站
- Facebook
- Instagram
- Threads
- Email
- 隱私權政策

這代表產品的品牌資訊、客服聯繫與社群追蹤已經有固定入口，不需要讓使用者自行到外部搜尋。

### 7.6 記帳提醒與連續記帳成就

設定中的「記帳提醒」頁目前提供：

- 透過自製時間選擇器設定每日固定時間提醒
- 提醒開關
- 目前連續記帳天數
- 最長連續記帳天數
- 累計記帳日
- 設定儲存與原生提醒同步拆開處理，先完成本地設定落盤，再於背景同步通知，避免手機上長時間卡在儲存中
- 原生通知插件、帳本讀取或提醒同步若逾時，會直接返回錯誤，不會讓畫面長時間停在儲存中
- 提醒同步採序列化執行，並對全帳本背景同步做去重，避免前景儲存與背景刷新同時重複呼叫原生通知橋接
- Android 13 會檢查通知權限，Android 12+ 會額外檢查 exact alarm 設定；若通知權限已開但精準提醒未開，頁面會明確顯示風險狀態與導向系統設定入口
- 提醒狀態已明確區分為未啟用、通知權限未開、精準提醒未完整啟用、已啟用每日提醒，不再把「設定已存下」誤當成「排程已可靠完成」
- 排程呼叫已加上 `repeats: true`，確保提醒每日重複觸發；未加此旗標時 Capacitor Local Notifications 只會在下一個符合時間點觸發一次即停止（SMB-116 修正）

這代表產品不只支援事後查帳，也開始支援持續使用的養成型提醒與成就回饋。

## 8. 平台與原生整合能力

### 8.1 Android 原生整合

專案使用 Capacitor，並已有多個 Android 原生插件整合：

- 安全鎖
- Google Identity
- 語音輸入
- 檔案開啟
- Home Widget
- 銀行自動化
- Wear OS companion Stage A（電話端 MessageClient `/smb/v1/*`、nearby-first、SQLCipher 單一連線擁有者）
- Wear OS companion Stage B（獨立 `:wear` Compose UI／Tile／Room outbox、雙 AAB、`standalone=false`、進階「手錶連線」）
- Wear OS 完整記帳 scope B（錶上八種帳務型別、編輯／刪除、多帳本切換、資產／預算摘要、重複上一筆、錶端範本、rotary 捲動、語音備註）

這代表產品規劃不是純 Web 包裝，而是有實際利用原生能力。

另外，Android AAB 發版版本碼現在由 `frontend/android/app/build.gradle` 依最終 `versionName` 自動推導，規則為 `major * 1,000,000 + minor * 1,000 + patch`，例如 `0.24.32 -> 24032`；CI 若需要仍可用 `CI_VERSION_CODE` 覆蓋。這樣 Play 發版 workflow 就算沒額外塞版本碼，也不會再掉回固定值導致重複版號。Fastlane internal lane 也會辨識 Google Play edit conflict 並重新建立上傳 edit 重試，其他非暫時性 Play API 錯誤仍會直接失敗。

Android 記帳提醒 manifest 目前也已補上 `POST_NOTIFICATIONS` 與 `SCHEDULE_EXACT_ALARM`，並透過 Capacitor Local Notifications 的 exact alarm 檢查 / 跳轉 API 引導使用者完成系統層設定。

### 8.2 Android 小工具

目前 Android 小工具已包含多種型態：

- 月摘要小工具
- 圓餅圖小工具
- 長條圖小工具
- 快速記帳小工具
- AI 記帳小工具

這些小工具可把常用資訊與入口直接放到桌面，提升高頻使用效率。

### 8.3 安全鎖與敏感設定保護

設定中已有安全鎖功能，另外敏感設定也有加密儲存設計。

對記帳 App 來說，這有兩個價值：

- 防止他人直接看到財務資料
- 保護同步、備份等敏感設定資訊

### 8.4 後端部署與 native 依賴安裝（SMB-256 / v1.3.37）

後端部署腳本 `backend/package.json` 的 `deploy:copy` 會先把後端原始碼 rsync 到 `/mnt/data/Data/serviceApps/StrawMB`，再呼叫 `backend/scripts/deploy-production-install.mjs` 安裝 production 依賴。關鍵在於 native binding（`better-sqlite3`）是綁定 Node ABI 與 glibc 的：若直接在部署主機 Node 上 `npm install`，編出的 binding 會對應主機的 ABI / glibc，與 StrawMB 容器執行的 Node（目前 `1panel/node:25.8.0`，ABI 141）不符，部署 / 重啟窗口期間後端載入 binding 就會噴 `Module did not self-register` / `NODE_MODULE_VERSION` mismatch / `ERR_DLOPEN_FAILED`（穩態時容器啟動會自行重新 `npm install` 而恢復，但窗口期會短暫崩潰）。

治本作法是 `deploy-production-install.mjs` 在與 StrawMB 完全相同的容器 image 內安裝 native 依賴：它從 `/opt/1panel/runtime/node/StrawMB/.env` 讀取 `NODE_VERSION` / `CODE_DIR` / `CONTAINER_PACKAGE_URL`，以 `docker run --rm` 掛載部署目錄到對應的 `1panel/node:<NODE_VERSION>` image 內執行 `npm install`，安裝後再於同一 image 內驗證 `require('better-sqlite3')` 可載入並查詢；docker 不可用時直接中止而非退回 host install。如此一來 deploy:copy 產出的 binding 與容器執行階段的 ABI / glibc 一致，部署窗口不再出現 self-register 錯誤。

### 8.5 Wear OS companion（Stage A + B + 完整記帳 scope B）

手錶是電話帳本的 companion，不是第二本帳。唯一真相為電話 SQLite `straw_money_book`（檔名 `straw_money_bookSQLite.db`，Capacitor Community SQLCipher、目前 `no-encryption`）。Wear 訊息只走 MessageClient 的 `/smb/v1/*` 白名單路徑（scope B 後完整清單見 §8.5.1）；nearby-first（`Node.isNearby()`）是應用層策略，不是「封包絕不經過 Google relay」的保證。帳務禁止 DataClient / DataItem（官方會持久化並可能雲端備份）。身份只用 `idempotencyKey`（UUID），`external_ref_id='wear:'+idempotencyKey`，另以 `wear_applied` UNIQUE 做 effectively-once；`origin_type='wear'` 軟刪須保留冪等鍵。`syncEpoch` 在首次建庫／重裝／wipe／restore 後旋轉。ListenerService 在沒有 Activity／WebView 時仍可 INSERT。

Stage B：獨立 Gradle 模組 `frontend/android/wear`（同一 `applicationId`、獨立 Wear AAB、`versionCode = 100_000_000 + phoneCode`、`standalone=false`、禁 `wearApp`；Wear Compose **≥ 1.5.6／現 1.6.2**，避免 `targetSdk≥35` 讀 `reduce_motion` 啟動閃退）。手錶 Compose 快記／近期／outbox、Glance Tile、Room outbox；電話功能頁進階「手錶連線」顯示 nearby 節點與 sync 狀態。Play 上架採 phone／Wear 分軌（測試軌道由 `play-testing-channel.json` 的 `internal`｜`closed` 決定；正式 `production`+`wear:production`）。真機配對驗收需實體 Wear 裝置（CI 以單元測試 + 雙 AAB dry-run + Playwright 進階入口為準）。

#### 8.5.1 完整記帳 scope B

`protocolVersion` 維持 **1**，改以「同一版本同時更新兩端」的方式擴充路徑與型別（單一常數來源三份實作必須同版對齊，由 `frontend/test/wear-companion-scope-b.test.js` 的 lockstep 測試把關）：

| 面向 | 內容 |
| --- | --- |
| 路徑 | `/smb/v1/hello`、`tx/create`、**`tx/update`**、**`tx/delete`**、`tx/ack`、**`ledger/set`**、`snapshot/request`、`snapshot/payload` |
| 型別 | `expense`、`income`、`transfer`、`adjustment`、`credit_spend`、`credit_repay`、`credit_refund`、`loan` |
| outbox op | `create`｜`update`｜`delete` |
| 常數來源 | JS `src/core/services/wear-protocol.js`／Kotlin `protocol/WearPaths.kt`（含 `WearTxTypes`／`WearTxOps`）／Java `wear/WearCompanionConstants.java` |

**欄位與型別條件**：`amount`／`account`／`category`／`time`／`note`／`tags`（陣列→`tagsJson`）為共同欄位，另有 `toAccountId`／`peerAccountId`、`sourceAccountId`、選用 `addons`、`loanDirection`（`lend`｜`borrow`）、`counterpartyName`、`targetTxId`。`expense`／`income`／`credit_spend` 必填分類；`transfer` 必填且不得同帳戶的 `toAccountId`；`credit_repay` 必填 `sourceAccountId`（還款資金來源，亦不得同卡）；`adjustment` 允許帶正負號但禁 0；`loan` 必填方向與對方名稱。標籤上限 12 個、每個 40 字，備註截斷 200 字。

**雙引擎**：WebView 活著時走 JS `wear-transaction.service.js`，直接復用手機既有 domain service（`createExpense`／`createIncome`／`createTransfer`／`createAdjustment`／`createCreditRepayment`／`createCreditRefundAdjustment`／`createLoanWithOptionalTransaction`／`updateManualTransaction`／`deleteManualTransaction`），語意與手機手動記帳完全一致；WebView 未啟動時由 Java `WearTransactionEngine` 以等價 SQL 落帳（轉帳雙腿 + `transfer_group_id`、刷卡雙 posting、還款 FIFO 沖銷、退款寫入當期 open statement、借貸開帳建立 loan 列 + 開帳交易）。兩條路徑皆以 `wear_applied` UNIQUE 保證 effectively-once，`origin_type='wear'` 軟刪仍保留冪等鍵。注意 `updateManualTransaction` 不會寫 `tags_json`，JS 端另以 `writeTagsJson` 補寫（信用卡消費／退款自有標籤格式，不覆蓋）。

**編輯／刪除範圍**：`validateTxUpdatePayload` 只接受 `expense`／`income`／`adjustment` 且**拒絕改型別**——轉帳雙腿、信用卡 posting、借貸列的跨型別重構仍由手機負責，避免手錶以殘缺欄位破壞多列結構。刪除為 soft delete。

**多帳本**：`/smb/v1/ledger/set` 由 `WearActiveLedgerStore.setWatchLedgerId()` 獨立保存手錶偏好帳本，`getEffectiveLedgerId()` 優先採手錶選擇、未設定才回退手機作用帳本；手錶切帳本不會改動手機 UI 正在瀏覽的帳本。

**snapshot 擴充**：`assetsTotalMinor`（`include_in_assets` 帳戶合計）、`budgetRemainingMinor`（依帳本曆月／發薪週期解析目前期間）、`ledgers[]`、`accounts`／`categories`（以 `usage_count`／`last_used_at` 推導 recent／favorite 旗標供選擇器分組）、`loans` 摘要、含全部 B 型別的 `recentTxs`。

**手錶端**：Room outbox 升級 **v2**（新增 `op`／`peerAccountId`／`sourceAccountId`／`tagsJson`／`extrasJson`／`targetTxId`），採 `Migration(1, 2)` 加欄位並帶 `NOT NULL DEFAULT`，升級不清除未同步草稿（禁 `fallbackToDestructiveMigration`）。UI 提供首頁（今日支出／總資產／預算剩餘／帳本 chip／待同步筆數）、型別選擇、記帳表單（數字盤、帳戶／分類／對方帳戶選擇器、**可報銷開關（僅支出；選分類依 `default_is_reimbursable` 預填，可手動覆寫）**、時間、備註、標籤）、近期清單與明細（編輯／刪除）、帳本切換、範本、重複上一筆；rotary 錶冠捲動以 `onRotaryScrollEvent` 實作，語音備註走 `RecognizerIntent` 並在無語音服務時安全降級（不閃退）。錶端範本存 `SharedPreferences`（含 `isReimbursable`），不依賴手機表。companion 寫入時支出可報銷列會帶 `is_reimbursable=1`、`reimbursement_state='pending'`（與手機 Quick Add 一致），出現在手機報銷清單。原生 `WearTransactionEngine` 的 UPDATE／DELETE 會同步 SMB-255 草稿請款單：取消可報銷或刪除來源交易時移除 draft import items 並重算總額（paid 請款單不受影響）；JS 路徑則復用 `updateManualTransaction`／`deleteManualTransaction` 既有 reconcile。

**驗收**：`node --test`（`wear-companion-stage-a/-stage-b/-scope-b`／`wear-companion-smb303-reimbursable`）＋ `:wear:compileReleaseKotlin`／`:app:compileReleaseJavaWithJavac`／`:app:testReleaseUnitTest`（含 Robolectric `WearTransactionEngineReimbursableUpdateTest`：正式 `applyTxUpdateOnDb` 開／關可報銷＋draft sync、`applyTxDeleteOnDb` 清 draft）／instrumented 同語意。真機記帳仍需實體 Wear 裝置配對驗收。

## 9. 銀行同步

### 9.1 銀行同步現況

銀行同步已改為可透過環境變數 `VITE_BANK_SYNC_FEATURE_ENABLED` 啟用的會員功能：

- 屬於會員功能（`assertCanUseBankSync()`）
- 目前支援 **Android App 本地同步**：**華南銀行**（`hua_nan_bank_tw`）唯一 active provider；非 Open Banking。**第一銀行已自 Architecture B 模組化恢復中移除**（不得再列為支援產品段落）。
- SMB-278：`isBankSyncFeatureEnabled()` 只依 feature flag 控制設定入口與路由可視性；原生自動化另由 `isBankSyncNativeAutomationAvailable()` 閘控。Web／非 Android 進入 `/settings/bank-sync` 會顯示支援矩陣與可用性診斷（資格→平台→自動化／API→憑證→captcha→同步→審核），並提供單一 recovery CTA（例如取得 Android App），**不再因 provider 空列表靜默 redirect 回設定**
- SMB-280：`bank_sync_credentials_missing` 僅在 Android 原生自動化可用且尚未建立銀行連線時出現；Web／非 Android 不得誤用此碼（改為 `bank_sync_android_only`／支援矩陣）。原生 vault 改 `commit()` 寫入，同步／中斷以 `provider_connection_id` 對齊讀回，避免建立憑證後仍顯示無憑證或 legacy reconnect；legacy vault 缺失走 credentials 階段 +「重新連結銀行」CTA
- smb294：重新驗證載具／銀行同步可用性；原生 vault 同步／中斷改傳 **distinct** local DB id + `provider_connection_id` 候選（`buildNativeVaultLookupIds`），避免兩邊傳同一值導致備援永不觸發、誤報憑證缺失；Playwright `carrier-sync`／`bank-sync` 補強錯誤碼分流、recovery CTA
- smb306：模組化恢復（僅華南）— `BankAutomationRuntime`（connect 先 markSuccess 再 snapshot；sync=`SYNCING_TRANSACTIONS`；captcha/abort 同狀態機）、`providers/huanan`、H1 結構錨點、Playwright **真實 UI** 建立連線表單→帳戶對應→手動同步→待匯入勾選匯入→交易搜尋 ledger（Web 僅對 native 邊界裝 fixture，不直接呼叫 runFormal*）
- Architecture B watermark／checkpoint：前端 dual-write `lastSyncAt`／`last_sync_at` 與 `lookbackDays`／`lookback_days`；原生 `readLastSyncWatermark` 採 **`lastSyncAt` > `last_sync_at`**；帳號層級 checkpoint（migration 046）；`PARTIAL_SUCCESS` 時**不得**推進假 `coveredThrough`／`lastSyncAt`
- Architecture B Provider Registry：僅註冊華南；通用 `connectBank`/`syncBank`／`submitCaptcha`／`abortBank`；淘汰 remote scrape／Playwright bank provider；建立頁依 schema 動態欄位
- 華南 H2：表單已凍（`InqMain`／「明細」、`#acct1`、`inqtype`+民國年 select、`doSubmit`、3 月切窗）；結果表依表頭映射日期（含民國年）／摘要／支出／存入。Android 寫去識別化 `h1_probe`／`h2_probe` 與 observe-only intercept。H1 另掃 `InqMain` 之 `acct=`。未解析可驗證交易列 → `partial` + `hua_nan_transaction_query_partial`（有列則 ok）
- smb304：修復 Android／Web 初始化因 migration 046 誤用 `#` 註解導致 SQLite `unrecognized token: "#"`、帳本無法開啓；改為 SQLite 安全註解，並在 `splitSqlStatements` 剝除 hash 行註解＋回歸測試，既有帳本可安全套用 046（勿重設資料）
- 稽核續修：CSV 與原生自動化交易 id 不同時，同帳戶同日同額會標 `possible_duplicate_of` 且審核匯入預設跳過；單一銀行連線同步走 process-wide `runtimeJobs` 合併，避免重入；SQLite `busy_timeout=5000`。CI 另跑預算跨月／發薪週期 Playwright（獨立 job）
- 已移除 Sandbox / Mock 生產路徑；舊測試連線會在 UI 標示為已停用
- 建立連線改為引導式流程：選擇銀行（僅華南）→ 登入（OCR captcha → SEMI_MANUAL／`submitCaptcha`）→ 帳戶對應 → 首次同步 → 待匯入審核
- 匯入前會進入待匯入清單，需手動審核後才寫入記帳交易
- 多銀行 Provider 接口保留（registry stub 可擴充），**第一銀行不得註冊為 active provider**

所以這不是完全未做，而是已建流程、以會員 + Android **華南銀行**為主的受控功能（第一銀行已移除）。

### 9.2 載具同步（v1.3.17 起…；smb307 Android WebView 模組化重建）

- 會員限定功能：`/settings/carrier-sync` 設定頁拉取財政部載具發票，pending 佇列審核後匯入
- **smb307（Android 權威路徑）**：模組化重建 `CarrierAutomationPlugin` / `CarrierAutomationActivity` / `NatGovEInvoiceAutomation`（provider `nat_gov_einvoice_tw`）；`carrier-sync.service.js` 經 `carrier-sync-orchestrator.js` 在 Android 走 native WebView，Web 保留 backend Playwright scrape fallback；captcha OCR 共用 `CaptchaSolver.validateCaptchaCandidate`，失敗 → `einvoice_captcha_required` + UI 半自動；cancel dialog 呼叫 `abortCarrier` 釋放 WebView session
- SMB-278：可用性診斷面板（資格→平台→**runtime**→API health→憑證→captcha→同步→審核）；Android runtime OK 時 health 探測回 `android_native_runtime_authoritative`
- SMB-280：載具 health／scrape 在 cookie-auth 模式下一律附帶 `X-Straw-Auth-Storage`（及 native client header），後端 CORS 對 Cookie／native client 亦視為 credentialed，消除 `credentials:include` + `ACAO:*` 造成的誤報 `einvoice_network_failed`；同步失敗會以 `code: message` 寫入 lastError 供可用性面板分流
- smb294：重新驗證載具同步可用性路徑（設定入口→可用性診斷→憑證→captcha→同步→審核／匯入）；確認 prod `GET /api/einvoice/health` 與財政部 portal contract-check；Playwright 覆蓋會員錯誤碼分流、recovery CTA 與 seeded review list
- v1.3.19 修正：財政部平台登入憑證為「手機號碼 + 密碼」（09 開頭 10 碼 + 至少 4 位密碼），非手機條碼 `/XXXXXXX` 與查詢碼；後端 Playwright 改走官方 `accounts/login` 後再查詢發票
- v1.3.30（SMB-251）治本改寫：財政部 2026-06 新版 Vue SPA + OAuth2 後，Playwright provider 不再解析 DOM 表格或截圖驗證碼；改為 (1) 以 JSON API `service-mc.einvoice.nat.gov.tw/act/login/api/act002i/captcha` 取得 `{token,image}` 並在 session 保存 token；(2) 登入使用實測選擇器 `#mobile_phone` / `#password` / `#captcha` / `#submitBtn`（全 env 可覆寫）；(3) 查詢以 `page.on('response')` 攔截官方 JSON API 並交 `normalizeInvoiceList`，DOM 解析降為備援；(4) 跨月 + 62 天視窗自動切分查詢；(5) 新增 `backend/scripts/einvoice-portal-contract-check.mjs` 合約自檢腳本。登入 / 查詢 URL、選擇器、API pattern 皆可透過 `EINVOICE_PORTAL_*` / `EINVOICE_SCRAPE_SELECTORS_JSON` 覆寫
- v1.3.31（SMB-253）P2 防打地鼠：合約自檢接 cron / CI（`sync-contract-check-run.mjs`、`sync-contract-check-cron.sh`、`.github/workflows/sync-contract-check.yml`）；失敗時告警至 `log.wastebase.xyz/issues/SMB-253` 並節流 Plane comment；失敗分類碼（portal_changed / captcha / auth / timeout）累計統計；**銀行 first-bank contract-check 已自 smb306 移除**，runner／測試不再 import 缺失腳本，僅保留載具 portal 探測
- v1.3.40（SMB-258）修復財政部登入頁 Cloudflare bot challenge 阻擋 headless Playwright 導致載具同步 `Failed to fetch` / `einvoice_portal_changed`：`playwright-cli.json` 加入真實 Chrome UA、`AutomationControlled` 關閉與 `playwright-portal-init.js` 反偵測腳本；`portal-cloudflare.js` 共用等待 challenge 完成後再探測 `#mobile_phone` 等選擇器；逾時回 `einvoice_cloudflare_timeout`（504）。前端 `scrape-api.js` 將 fetch 網路層 `Failed to fetch` 映射為 `einvoice.error.network_failed` 三語 i18n，不再露出原生錯誤字串
- SMB-265 後可靠性與安全邊界補強：Playwright CLI timeout 會自動大於 Cloudflare / selector wait（至少多 15 秒），確保 Cloudflare challenge 逾時穩定回 `einvoice_cloudflare_timeout` / HTTP 504；captcha dialog 關閉、submit 失敗、頁面卸載、查詢完成、取消與 TTL purge 都會釋放後端 scrape / Playwright session；`einvoice_captcha_required` 會保留為 `captcha_required` 狀態，不再被一般 catch 覆寫成 `error`；後端 `/api/einvoice/*` 除 `X-Straw-Client-Key` 外，必須通過既有共同帳本 auth session 與會員 grant 驗證，並加上 user / IP / session rate limit 與每使用者一個進行中 scrape session 的併發限制。若本機仍保存舊版「手機條碼 / 查詢碼」憑證，設定頁會清楚提示重新輸入財政部平台手機號碼與密碼，不會靜默沿用舊格式

## 10. 使用者輪廓

StrawMoneyBook 特別適合以下人群：

- 想把日常花費、資產與預算一起管理的人
- 有家庭帳、工作帳、副業帳分流需求的人
- 常有代墊、報銷、請款流程的人
- 有借貸往來，需要追蹤應收應付的人
- 想把儲蓄資金和可支配餘額分開的人
- 需要跨裝置同步、備份與資料治理能力的人

## 11. 與一般記帳 App 的差異

若只看表面，StrawMoneyBook 和一般記帳 App 都有：

- 收入 / 支出
- 分析圖表
- 帳戶與分類

真正的差異在下面幾點：

### 11.1 它把「情境」做成正式流程

不是把借貸、報銷、請款塞進備註，而是做成有狀態、有關聯、有後續處理的模組。

### 11.2 它重視帳本隔離與同步

不是只有本機單帳本，而是有：

- 多帳本
- 共同帳本
- Google Drive 帳本同步
- 備份 / 還原

### 11.3 它同時兼顧快與準

輸入端有：

- AI 記帳
- 語音輸入
- 快速新增
- 問答記帳

治理端有：

- 修復
- 匯出
- 還原
- 同步

這讓它不只適合快速記錄，也適合長期經營資料品質。

## 12. 目前已確認的限制與邊界

以下內容在文件中必須明講，避免誤導：

- 銀行同步已有頁面與流程，但屬於受控功能，不應描述成全面對外開放
- 多數進階同步能力屬會員功能
- 免費版有帳本、帳戶、借貸、報銷、存錢罐、訂閱、AI 記帳次數等限制
- 文件描述以目前程式碼為準，不代表所有流程都已完成商業化上架或全面開通

## 13. 一句話總結

StrawMoneyBook 的核心特色，不是「可以記帳」而已，而是把個人與協作金流中的預算、借貸、報銷、請款、儲蓄、同步與資料治理整合成一套可以長期使用的 App。

## 15. UI 設計系統（Design System）

### global.css Design Tokens（`src/ui/assets/css/global.css`）

共享 radius / typography token 由 source test 鎖定；目前 `--radius-sm` / `--radius-md` / `--radius-lg` 維持 10px / 12px / 16px，`--text-xs` 維持 12px，避免卡片、按鈕與細字尺寸在批量 UI 調整時漂移。

**間距 Token（Spacing Scale）**
`--space-1` (4px) ～ `--space-12` (48px)，供元件直接引用，取代各元件內的硬編碼 padding/gap 值。

**語意字型 Token（Semantic Font Sizes）**
- `--font-caption: 10px`　徽章、輔助標籤
- `--font-label: 12px`　次要標籤
- `--font-body-sm: 13px`　次要內文
- `--font-body: 15px`　主要內文
- `--font-title: 18px`　卡片標題
- `--font-heading: 22px`　頁面標題
- `--font-display: 28px`　金額顯示

**按鈕系統（Button Variants）**
- `.btn.primary`（既有）：主要 CTA，amber gradient
- `.btn.danger`（既有）：破壞性操作
- `.btn.secondary`：次要操作，透明底 + 邊框
- `.btn.ghost`：最低優先度操作，無邊框
- `.btn.ok`：成功/確認用綠色變體

**Card 變體（Card Variants）**
- `.card`（既有）：標準卡片
- `.card--soft`：較暗的次要卡片
- `.card--elevated`：帶陰影的浮層卡片
- `.card--accent`：左側 primary 色邊框，用於重要資訊
- `.card--ok`：左側綠色邊框，用於成功狀態
- `.card--danger`：左側紅色邊框，用於警示

**Skeleton 載入系統**
- `.skeleton`：shimmer 動畫底層，搭配 `background-size: 200%` 左右掃光
- `.skeleton--text` / `.skeleton--text-sm`：文字行佔位
- `.skeleton--icon`：圖示方塊佔位
- `.skeleton--amount`：金額佔位
- `.skeleton-row` / `.skeleton-block`：佈局容器

**Input 狀態樣式**
- `.input--error` / `.select--error` / `.textarea--error`：錯誤紅色邊框 + glow
- `.input--success` 等：成功綠色邊框 + glow
- `.field-hint`：說明文字容器，搭配 `--error` / `--ok` / `--muted` modifier

**無障礙（WCAG）**
- `--muted` 從 `#8888a0` 提升至 `#9999b4`，確保深色背景上的對比度達 WCAG AA 標準

### 通用元件

**EmptyState.vue**（`src/ui/components/common/EmptyState.vue`）

通用空狀態展示元件，props：
- `icon`（FontAwesome icon）：圖示
- `title`：主標題
- `description`：說明文字
- `compact`（Boolean）：精簡版，padding 更小

## 14. 本文件整理依據

本文件內容主要根據下列現有資源與程式碼結構彙整：

- `README.md`
- `frontend/StrawMoneyBook_Features_Map.md`
- `frontend/src/ui/router/index.js`
- `frontend/src/ui/views/`
- `frontend/src/core/services/`
- `frontend/src/ui/services/`
- `backend/src/routes/`
- `frontend/android/app/src/main/java/com/strawcoding/strawmoneybook/`

補充維護約束：

- `frontend/src/ui/services/i18n.service.js` 的手動覆蓋字典優先於 generated 文案；同一物件不可保留重複 key，且 `RUNTIME_EN_TEXT` / `RUNTIME_EN_REPLACEMENTS` 若有相同 key，應只保留 `RUNTIME_EN_TEXT`
- 根目錄 `.gitignore` 已統一維護 Node、Vite/Playwright、環境檔、後端 `.server-data`、Android/Capacitor 產物、Python 暫存與本機工具快取，避免生成物與敏感設定被誤加入版本控制。

---

## 電子發票匯入（E-Invoice Import）

**版本**：v1.0.6（SMB-165）；Android 原生插件 v1.0.8（SMB-168）；平台挑戰偵測 v1.0.9（SMB-170）；官方網址校正 v1.0.9（SMB-173）；帳密 IV 修正 v1.0.13（SMB-174）；自動化流程可見化 + 失敗診斷分類 v1.0.15（SMB-174 Restart）；驗證碼讀取與載具清單資料偵測修正 v1.0.16（SMB-179）；載具流程四大問題修復 v1.0.17；查詢頁穩定修復 v1.0.18（SMB-180）；UI 問題審查修復 v1.0.22（SMB-165 審查）；載具計畫重設計 v1.2.14（SMB-209）；刪除舊 WebView 方案並改接官方 API proxy v1.2.16（SMB-209 Restart）；手機條碼符號字元修復 v1.2.20（SMB-209 Restart）；Step1 行內驗證錯誤訊息 + normalizeBarcode 空白修正 v1.2.23（SMB-209 Restart）；Step1 清除已儲存載具資料 v1.2.25（SMB-209 Restart）；載具名稱顯示與匯入交易標籤重建 v1.3.3（SMB-226）
**狀態**：前端匯入計畫已重新設計為命名階段與狀態機，並停用舊 Android WebView 自動化入口；查詢改由 StrawMoneyBook backend `/api/einvoice/query-invoices` 代理財政部電子發票官方 API。Step 1 手機條碼驗證接受財政部條碼可用字元（`/` 後 7 碼可為英數字或 `+ . -`），避免合法條碼因前端驗證過窄而無法點擊下一步；backend `cardNo` 驗證同步放寬，避免前後端規則不一致。查詢可取消、重試，失敗 / 逾時 / 取消都有明確回饋，晚回的舊查詢結果會被丟棄，避免新舊邏輯並存；backend 端需設定 `EINVOICE_APP_ID`、`EINVOICE_API_KEY`、`EINVOICE_CLIENT_SHARED_KEY`，前端則以 `VITE_EINVOICE_CLIENT_SHARED_KEY` 送出 `X-Straw-Client-Key`，並有電子發票專用 rate limit、日期 / 查詢碼驗證與過多頁數防截斷。

### 功能說明
透過「載具設定 → 查詢條件 → 查詢發票 → 確認匯入」命名階段，讓使用者輸入手機條碼與查詢碼、設定日期區間、查詢並選取發票後批量匯入至 StrawMoneyBook 帳本。查詢端不再依賴驗證碼 OCR 或嵌入式 WebView，而是由 backend 以 `cardNo / cardEncrypt / startDate / endDate` 呼叫財政部電子發票 API。

### 資料庫
- `einvoice_credentials`：加密儲存手機條碼與查詢碼（AES-256-GCM + PBKDF2），條碼與查詢碼各自保存對應 IV，避免記住載具資料後無法正確還原
- `einvoice_invoice_imports`：發票匯入記錄，`invoice_number` UNIQUE 防止重複匯入

### 精靈步驟
1. **載具設定**：輸入手機條碼 / 查詢碼，可勾選「記住載具資料（加密儲存）」；若載入既有儲存資料，使用者可直接清除本機加密載具資料並重新輸入，符合技術文檔要求的清除已儲存帳號能力；手機條碼格式為 `/` 開頭接 7 位英數字或 `+ . -` 符號，前端下一步與 backend proxy 使用相同格式守門；輸入格式不合時顯示行內錯誤訊息（格式錯誤、查詢碼過短）說明原因，`normalizeBarcode` 自動去除內部空白並補前綴 `/`；表單區塊使用自然高度排列，避免手機畫面出現過多空白
2. **查詢條件**：日期區間（預設最近 62 天，與 backend 單次查詢上限一致，避免預設值直接觸發 `date_range_too_large`）；返回修改時會清除下游查詢結果與選取狀態。舊方案的發票狀態、買方統編、品名關鍵字篩選已移除，避免前端保留官方 WebView 查詢頁欄位假象
3. **查詢發票**：以狀態機顯示 running / done / failed / cancelled / timeout；查詢中可取消，失敗、逾時與取消可重試或回到查詢條件；`scrapeGeneration` token 防止已取消或舊查詢的晚回結果覆蓋新資料
4. **確認匯入**：預覽待匯入清單，選填同步建立支出交易，確認後寫入資料庫

### 安全設計
- 帳密絕不以明文儲存，以 AES-256-GCM + PBKDF2（100,000 迭代）加密
- 加密金鑰衍生自裝置 UUID（localStorage 綁定，首次產生後固定）
- 每次加密使用隨機 12-byte IV

### 載具 Android 原生自動化（SMB-168～SMB-180 舊巨石碼；SMB-209 刪除；smb307 模組化重建）
- SMB-209 刪除舊 `EInvoiceAutomation*` 巨石碼；smb307 以 Architecture B 分層**模組化重建**（非 cherry-pick）：`CarrierAutomationPlugin` / `CarrierAutomationActivity` / `NatGovEInvoiceAutomation` / `CarrierSyncContract` / `CarrierPortalConfig`
- Android 生產路徑：`carrier-sync-orchestrator.js` → `native-automation.js` → Capacitor plugin → WebView 登入財政部 portal + JSON intercept + pending 審核匯入
- Web fallback：仍可用 backend Playwright scrape API（`scrape-api.js`），文件化為非 Android 驗收主路徑
- Captcha：共用 `core/CaptchaSolver`（Tesseract + `validateCaptchaCandidate`）；OCR 失敗 → `einvoice_captcha_required`；禁止 mock 永遠 PASS（JVM fixture 測試覆蓋）

- **v1.2.13（SMB-165 匯入交易建立）**：Step 4 新增可選的「同步建立支出交易」區塊；使用者可在確認匯入前選取記帳帳戶與支出分類，選取後每筆匯入發票將依發票金額（×100 換算 amountMinor）與日期自動建立 `einvoice` 來源的支出交易，並將交易 ID 寫入 `einvoice_invoice_imports.transaction_id`；未選帳戶 / 分類時維持舊行為（僅儲存匯入紀錄，transaction_id 為 null）；i18n 同步新增 `einvoice.step4.create_tx_label` 等 7 個三語 key；新增 5 個單元測試覆蓋交易建立路徑（transactionId 正確、createExpense 失敗進入 failed、amountMinor 換算、重複發票不呼叫 createExpense）。
- **v1.3.3（SMB-226 載具重建）**：依技術文檔 §3.3.2 補齊「載具名稱 → 標籤（tag）」：`buildCarrierTagsJson()` 將 `carrierName` 轉成 `transactions.tags_json` 相容的 JSON 陣列字串，匯入並同步建立支出交易時寫入 `tagsJson`；Step 3 發票卡片與 Step 4 確認預覽新增載具 chip（`carrier-chip` / `preview-carrier`），讓使用者可辨識每筆發票所屬載具；新增 `einvoice.step3.carrier_label` 三語 i18n；新增 `test/einvoice-carrier.test.js` 與 `einvoice-import.test.js` 載具標籤串接測試；Playwright 驗證 Step3/Step4 載具 UI 正確渲染。

- **v1.0.24（載具流程穩定性修復）**：
  - **[Bug 修復] 匯入失敗訊息消失**：`EInvoiceStep4Confirm.vue` 原本在 catch 中設定 `store.errorMessage` 並跳回 Step3，但 Step3 的 `onMounted` 立即清空 `store.errorMessage = ''`，導致使用者看不到任何錯誤提示。改為在 Step4 使用本地 `importError` ref，錯誤顯示於 Step4 原地（確認按鈕下方紅色提示文字），不再轉跳 Step3。
  - **[Bug 修復] 抓取並發 race condition**：`EInvoiceStep3Select.vue` 的 `onMounted` 新增 `if (store.isScraping) return` 守衛，避免使用者快速來回切換步驟時觸發多個並發 scrape 請求，防止 `invoiceList` 被非預期覆蓋與 `isScraping` 提前重置。
  - **[防呆] Step4 匯入防重複點擊**：`handleImport` 起始加入 `if (store.isImporting) return` JS 層守衛（原本只靠 `:disabled` 屬性，React/Vue tick 之前可能重複觸發）；「上一步」按鈕在匯入中也改為 `disabled`。
  - **[可觀測性] 補充 debug log**：`backend.js`（憑證儲存/載入/抓取/匯入各階段）、`EInvoiceStep3Select.vue`（抓取開始/完成/失敗）、`EInvoiceStep4Confirm.vue`（匯入開始/完成/失敗）均補上 `console.log` / `console.error`，log 不輸出手機號碼完整內容（僅前 4 碼）、密碼、token 等敏感資料。
  - **[測試] 新增 `test/einvoice-import.test.js`**：10 個單元測試案例，覆蓋空清單、全新匯入、去重跳過、全部重複、單筆 DB 失敗、全部失敗、混合情境、transactionId 固定為 null、merchantName 為 null、去重基準 Set 正確性；`node --test test/*.test.js` 382/382 通過。

### 入口
- `功能列表` 頁面（FeatureListPage.vue）→「進階功能」→「載具同步」（`/settings/carrier-sync`）
- 電子發票匯入精靈路由：`/einvoice-import`（由載具同步流程進入，非設定頁主清單）
- 精靈頁頂部返回按鈕使用全域 Font Awesome `fa-chevron-left` 註冊圖示；密碼欄顯示切換使用 `fa-eye` / `fa-eye-slash` 註冊圖示，避免頁面載入時出現空按鈕。
- **SMB-167 (v1.0.9)**：Step 1 step-footer 補上「上一步」按鈕（原本只有「下一步」），與 Step 2–4 雙按鈕 pattern 對齊；點擊執行 `store.reset()` + `router.back()` 退出 wizard，與精靈頂部返回按鈕行為一致。
