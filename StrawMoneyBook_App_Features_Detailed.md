# StrawMoneyBook App 功能說明（Detailed）

> 本文件依據目前專案程式碼與頁面結構整理，狀態基準為 `2026-04-18`。
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

手動執行「重設全部資料」前，資料管理頁會先嘗試匯出全部帳本 recovery JSON；若裝置檔案儲存不可用則退回瀏覽器下載，若 recovery 建立失敗則寫入 console 記錄並保留原本重設流程，避免因備份功能異常讓使用者完全無法重設。

SMB-190 / v1.2.5 後，資料管理頁手動匯出的全部帳本 JSON 與 CSV 檔名都會加入時間戳，避免在 Android 原生檔案儲存或瀏覽器下載時因固定檔名重複覆蓋，讓多次匯出可以保留各自的檔案版本。SMB-216 / v1.2.29 後，資料管理頁的恢復備份、CSV 匯入與重設資料這類可能超過 3 秒的流程會顯示含百分比的加載動畫與目前動作說明，讓使用者知道系統仍在處理而不是壞掉或卡住。

這讓它更適合長期使用，而不是短期記帳後就難以維護。SMB-220 / v1.2.37 後，Debug 頁面新增 Error Log 紀錄區塊，所有 Vue 元件錯誤、全域 window 錯誤、未處理 Promise 拒絕與 toast 彈窗錯誤訊息都會同步記錄在 in-memory buffer（最多 100 筆），開發者可在設定 → 版本資訊 → Debug 頁面即時查看並一鍵匯出。SMB-221 / v1.2.40 後，所有設定子頁面的 h2 標題都加入與功能對應的 Font Awesome icon（class="title-icon"），與「關於我們」頁面一致的視覺風格。SMB-250 / v1.3.29 後，設定 → 個人化新增「介面風格」：傳統版維持 v1.3.28 的 5 tab + FAB + 首頁全部區塊；現代版以 Apple HIG 視覺語言（`apple-ui.css`：Large Title、Inset Grouped、Segmented Control、list row + chevron）重構層級，但**不刪**任何入口或首頁子元件（帳本切換、四段期間篩選、資產卡、預算卡、交易流、FAB）；與配色主題獨立，預設為現代。SMB-254 / v1.3.33 後，設定首頁（`/settings`）的清單項目列高度調小、清單更緊湊：現代版設定列（`apple-ui.css` 的 `[data-ui-layout='modern'] .settings-page .setting-group .item-link`）垂直 padding 由 `12px 14px` 改為 `8px 14px`，量測列高由 63px 降至 54px；傳統版（`settings.vue` scoped）列間分隔由 `margin-top/padding-top: 12px` 收斂為 `8px`、描述 `small` 行高 1.35→1.3。兩種版型皆保留每列 `min-height: 44px` 的最小點擊高度，水平 padding 與 safe-area 維持不變，因此縮小高度不影響觸控區域與可讀性。

另外，所有需要輸入資料的彈層已統一為共用 bottom sheet flow，桌面與手機都不再保留另一套輸入型 popover，包含表單 dialog、選單、日期與時間選擇器；`AppDialog` 以及各頁自製輸入 sheet 也都收斂到和快速記帳一致的 shared overlay / bottom-sheet primitives，Android 有底部導覽列 inset 的裝置也會一併吃到底部 safe area，且 sheet 卡片背景會直接延伸到底部，和 `BottomNav` 維持同一個底部基準。

SMB-154 / 0.26.5 後，設定首頁的入口副標、帳號卡未登入提示、登入 / 註冊頁與共同帳本頁使用到的主要介面文案，都已改由正式 i18n key 維護，繁中、英文與日文都有對應文案，不再靠繁中 fallback 或 runtime DOM 翻譯處理這批主要設定流程文字。

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

SMB-189 / v1.2.5 後，帳本 scoped store 載入前會先執行帳本完整性掃描與自動修復。除了既有報銷總額、報銷已付款狀態與借貸狀態修復，也會把交易遺失帳戶或 peer 帳戶指到隱藏的資料修復帳戶、清空遺失分類引用，並解除無法成對或金額不平衡的轉帳群組，避免壞資料持續阻斷帳本載入或後續查詢。

會員邏輯也已把 domain 與導頁 side effect 分開：`core/services/membership.service.js` 只保留 entitlement、sync、snapshot 與 limit error 判斷，真正的會員限制導頁改由 `ui/services/membership-navigation.service.js` 處理，避免 core 層再反向依賴 UI router。帳號 Google 登入與 Google 備份也已共用前端 Web Client ID 解析，帳號頁在缺少設定時仍會顯示 Google 區塊與設定提示，不會讓 Google 登入入口整段消失。共同帳本 backend 端則把 `auth` 與 `shared-ledgers` 路由拆成模組化目錄，並由 `backend/src/server.js` 的 route table 分派，`backend/src/collab/http.js` 提供共用 request parsing、method/body guard 與 route error serialization。SMB-232 後，`backend/src/collab/store.js` 的 `updateStore` 不再每次 mutation 全量 upsert 所有 users / shared_ledgers / referrals 並全表掃描比對刪除：載入時以 id → 序列化快照建立 baseline，寫回時只 upsert 新增或實際變更的 record、只刪除實際被移除的 record，並仍包在單一 SQLite transaction 內保持原子性，降低帳本量大時的寫入放大與記憶體成長（mutator API 不變、呼叫端零改動）。

共同帳本快照推送會檢查用戶端帶上的 `baseVersion`，包含初始 `version=0` 邊界；SMB-187 / v1.2.4 後共同帳本快照在套用 tombstone 與合併遠端 / 本機資料後，會先修剪缺少必備父資料的孤兒子列，並把可為 NULL 的失效引用清空，避免拉取、接受邀請或連結加入時因 SQLite foreign key constraint failed 中斷；替換本機帳本前也會先保留原本本機快照，若遠端快照匯入仍失敗會嘗試復原本機帳本，降低資料被清空後中斷的風險；密碼登入在鎖定期間會直接回覆鎖定狀態，不再重複累加失敗次數或延長鎖定；忘記密碼若臨時密碼 Email 寄送失敗，會回滾臨時密碼寫入，保留原密碼可用。

另外，新帳本建立後會立即完成預算模組初始化並可正常載入空月預算，不會因預算項目查詢的欄位歧義中斷 onboarding 或帳本切換流程。

SMB-215 / v1.2.27 後，初始設定後導覽頁（`PostSetupIntroPage`，`/welcome/intro`）的共同帳本步驟會在原本「前往共同帳本」之外，另外提供「恢復備份」與「帳本同步」快速按鈕。SMB-215 Restart / v1.3.1 後再加強：初始化 setup wizard 本身（`WelcomePage`）的第二頁「建立帳本」也會在「已有共同帳本？登入並加入」連結旁，再加上「恢復備份」與「帳本同步」兩顆 secondary-link 按鈕（僅在 `!hasLedgers` 時顯示，帶 database / cloud-arrow-up FontAwesome 圖示）。SMB-215 Restart / v1.3.2 後再修正按鈕目的地：「恢復備份」改指 `/settings/auto-backup`（自動備份頁，含 Google Drive / WebDAV 登入後**立即還原**入口；Tester 反饋「需要有自動備份的項目」），不再指手動 JSON / CSV 匯入頁；「帳本同步」維持 `/settings/google-drive-ledger-sync`。同步把這兩個目的地 route 加上 `meta.allowWithoutSetup: true`，讓使用者在「還沒有帳本」狀態下點按時不會被 `App.vue` 的 welcome guard 攔回。這樣初始化頁面真的能 onboard「換新裝置、想從自動備份還原」的使用者，從 setup wizard 第二頁一鍵進入自動備份還原流程。

Android 發版目前也已把版本碼策略收斂成由語意版號自動推導的單調遞增規則，並保留一段 Play Store 歷史版本碼安全區間，避免 `0.x.y` 這類版本名稱在新版發佈時反而低於舊的商店版本碼；若 release 產物存在 `mapping.txt`，Play 上傳流程也會一起帶上去模糊化檔，降低 Crash / ANR 排查成本。`npm run gpr` 推送版本 tag 後，GitHub Actions 會建置 AAB、建立 GitHub Release，並透過 Fastlane 發布到 Google Play 封閉測試 track；預設 track 是 `alpha`，也可用 GitHub Actions 變數 `PLAY_CLOSED_TESTING_TRACK` 指向其他封閉測試 track。SMB-183 後 `gpr` 在 bump 前先執行 `notes:check` 確認專案根目錄的 `release-notes.pending.md` 檔案存在；pending notes 為空時只提示但仍允許發版，patch 發版成功後會封存既有 notes，空 notes 不會建立空白版本區塊，minor 發版則執行 `notes:clear` 清空暫存檔並 push。GitHub Actions 建立 GitHub Release 時也會把暫存檔內容加入 release body，Fastlane 同步填入 Google Play changelog；發佈失敗時暫存檔不會被清空，確保下次發版紀錄不遺失。

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

- 帳本切換
- 全部 / 年 / 月 / 日 範圍切換
- 當期收支摘要（`HomeAssetSummaryCard`：收入／支出區塊背景與數字色跟隨主題 `--home-*-card-*` Light／Dark token；淺色模式使用淺綠／淺紅底與深綠／深紅數字，禁止沿用深色硬編碼底；傳統／現代介面風格共用，切換主題後仍可辨識收入／支出語意）
- 預算摘要
- 交易清單
- 浮動快速記帳按鈕（FAB）

期間篩選邏輯由 `useHomePeriodFilter` composable 管理。

另外，首頁交易流在全部 / 年 / 月 / 日範圍皆改為 SQL 分頁載入，每頁最多 300 筆，並提供上一頁 / 下一頁控制；badge 顯示該範圍總筆數。收支摘要卡改由分批彙總計算，不再依賴一次載入整段期間全部交易。需要跨頁瀏覽或完整歷史篩選時，仍可使用交易搜尋、分析與報表頁。

首頁交易流若目前範圍沒有任何資料，現在會顯示明確空狀態與「立即記帳」入口，不再只剩一行靜態文字；空狀態文案透過 i18n 維護，source test 會同時檢查元件 key 與繁中內容，避免國際化後誤判功能消失；預算簡表左右滑動的切頁閾值也已提高，降低垂直捲動時誤切月均 / 當日可用的機率。

`playwright:ui-layout` 會 bypass onboarding 進入 app-shell 首頁，強制 Light 主題後驗證收入／支出 block 可見、可讀、版面完整，並抽樣確認 Dark 主題未回歸；傳統／現代切換不得刪除 FAB 或任何既有首頁區塊。

功能列表已加入預算項目入口，搭配圖示直接導向預算管理頁，讓使用者不只從底部導覽或首頁預算簡表進入預算設定。

### 3.2 交易記帳

目前支援三種記帳模式：

- AI 自動記帳
- 手動快速新增
- 問答記帳

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

交易編輯頁保留調整交易的正負金額，負調整不會被轉成正數；跨幣別轉帳若使用手動匯率，無效匯率會在送出前阻擋。SMB-217 / v1.2.30 後，單筆交易編輯頁的金額欄位也改用與手動記帳一致的 `AmountCalculatorInput`，可直接用加減乘除計算後套用金額。

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
- 支援語音輸入
- 支援多語言輸入情境
- 盡量自動判斷分類，避免把已識別內容重複塞進備註
- 語音再解析時，若這次只補到金額 / 類型而沒有新的備註內容，會保留使用者原本已填好的備註，不會被語音流程清空
- 若缺少可用分類，可直接引導使用者前往分類管理補齊
- 金額可直接輸入加減公式，例如 `120+20`、`120-20`；這類公式不會再誤觸日期/時間解析而把交易日期改亂，也不會把 `+`、`*` 等算式殘留到備註欄位
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
- SMB-260 / v1.3.45 後新增「共同預算池」：可命名並手動設定池總額，綁定多個分類預算（一項最多一池）；首頁 / 月預算總額採 2B 公式（各池 amount + 未入池項目 resolved_amount，入池分類子預算不重複計入）；分類 / 池 / 月總三層各自判斷超支（3C）；池可啟用池層預算存款（`budget_container_month` 月底結算 = max(0, 池總額 − 綁定分類當月支出)），並與分類預算存款互斥；v1.3.48 日池可在池表單直接多選分類，綁定分類不需子預算金額，首頁日模式納入日池日額；SMB-268 後新增共同預算池與一般分類預算項目可選「套用至月份」跨月建立（inclusive，含跨年），服務層仍 fan-out 成各月份獨立 budget/container/item，不新增跨月資料欄位；月池金額維持每月金額語意，日池金額維持每日費率並依各月天數計入，一般項目保留金額模式、日期日均規則、預算存款與未入池 / 同名共同池對應，既有共同預算池與既有分類預算項目編輯仍只改當月，且跨月建立前會檢查所有目標月份同名池、同分類項目與缺少目標月共同池等衝突並阻擋 partial write；複製上月、匯出 / 匯入與共同帳本 snapshot 皆含 `budget_containers`
- SMB-269 後，每個帳本可在設定中選擇「曆月」或「發薪週期」預算。曆月是既有預設，既有月預算與歷史資料保留原本 `YYYY-MM` 語意；發薪週期以帳本設定的每月固定發薪日為錨，發薪日當天（含）開始，到下一個發薪日前一天（含）結束，29 / 30 / 31 遇到短月時使用該月最後一天，正確涵蓋二月、閏年與跨年。預算資料層新增通用期間 key、起訖日與 mode，不把跨月週期拆成多筆月預算；交易也不搬移，而是依帳本時區下的實際發生日期落入目前預算期間，服務層會用帳本時區把期間起訖轉成 UTC 查詢範圍，不受 CI runner 或裝置 process timezone 影響。一般分類預算與共同預算池都支援發薪週期；固定額不跨月拆帳，日均項目與日池依該週期實際天數計算，指定日曆日規則只抓週期範圍內符合的日期。預算頁與首頁預算卡會顯示目前週期起訖、上一期 / 下一期與下次發薪日；交易清單、日曆與分析頁仍維持曆月查帳預設。
- SMB-271 後，發薪週期不再只藏在帳本詳細設定：新增或編輯一般分類預算項目、以及新增或編輯共同預算池時，表單內都有「目前帳本預算期間」區塊，可直接選曆月 / 發薪週期並設定每月發薪日。UI 會明確提醒這是目前帳本的預算期間設定，切換會影響該帳本預算頁與首頁預算卡，不是只有單一項目或單一池改變；資料層仍沿用帳本層 `budget_period_mode` / `budget_pay_day`，不把每個預算項目改成互不相容的獨立週期，也不搬移既有曆月或發薪週期資料。新建項目 / 共同池時若同時切換週期，系統會先套用新帳本週期再建立；編輯既有項目 / 共同池時則先保存目前期間的 row，再套用帳本週期並重新載入目前預算期間，避免舊資料被意外搬期。
- SMB-272 後，App 啟動、重啟或 reload 若遇到既有發薪週期狀態（例如預算 store 的 `monthKey` 為 `pay:YYYY-MM-DD`）不會再把它當成首頁曆月交易篩選，也不會把非法月份送進 `toISOString()` / `Intl.DateTimeFormat` 造成 `Invalid time value`。首頁月份篩選只接受 `YYYY-MM`；預算載入能正規解析 persisted pay-cycle key；交易查詢 repo 對非法年 / 月 / 日 key 回空結果而非拋錯。Debug Error Log 仍保留 message、stack、source、route 與 component/info，方便追查啟動期 route 尚未完成時的錯誤。
- SMB-273 後，發薪週期會在發薪日邊界自動 rollover：發薪日前一天仍屬舊期，發薪日當天 00:00 起（含）會重新解析為新期。App 首次啟動、完整重啟、頁面 reload、Android 從背景回前景、web/app shell focus 與 visibility 回可見都會重新以帳本時區下的今天載入目前預算期間，首頁預算卡與預算頁不會停在上一期，也不需要使用者手動按上一期 / 下一期。固定額、已花費 / 剩餘、日均 weekday / monthday、共同日池與預算存款結算仍依解析後的實際週期起訖日計算，既有曆月模式與歷史發薪週期資料不搬移。
- SMB-274 後，app-shell 同時觸發 focus 與 visibility reload 時，若兩個預算快照請求同時建立同一期資料，後到請求會讀回先完成建立的期間，而不會留下 SQLite `budgets.ledger_id, budgets.month_key` 唯一鍵 runtime error。其他資料庫錯誤仍正常回報。
- SMB-275 後，預算期間的「今天」一律以帳本時區解析，不再依裝置 process timezone 或 persisted `pay:*` / 上次瀏覽月份推斷。`resolveCurrentBudgetPeriodForLedger()` 成為 cold launch、reload、Android resume、web focus / visibility 與預算頁進入時的唯一入口；發薪週期帳本的首頁月份篩選只影響交易清單，不會再把曆月 key 或月初日期覆寫成錯誤預算期間。lifecycle reload 成功後會廣播 `app:budget-period-sync`，首頁期間篩選與預算頁同步回到帳本時區的今天，曆月帳本仍預設目前曆月。補強跨時區、跨月、跨年、29/30/31 短月 Node regression，並延續 `playwright:budget-pay-cycle` app-shell 證據。
- SMB-276 後，更改每月發薪日或切換曆月 / 發薪週期模式時，系統會先以舊帳本設定解析「今天」所在的目前期間並載入其預算結構，套用新設定後再解析新目前期間；若新舊 period key 不同且新期尚無使用者設定內容（無項目、無共同池、無整期預算存款設定），會自動將舊期的分類項目金額與日均規則、共同池與綁定、整期預算存款設定 carry-forward 到新期，已花費依新期日期範圍重算，交易與歷史期間資料不搬移也不覆寫。帳本詳細設定頁、預算項目 sheet、共同池 sheet 三條入口皆走同一 `applyLedgerBudgetPeriodSettings` 流程，避免改發薪日後預算頁跳到空殼。
- SMB-261 / v1.3.50：`budget.repo.js` 補上 `normalizeBudgetSaveEnabled`，修復 `/budget` 儲存預算存款或切換共同預算池存款開關時 `normalizeBudgetSaveEnabled is not defined` 連續 toast 報錯；三模組（repo / service / save.service）布林正規化邏輯已對齊
- SMB-151 後，預算項目的「日期」分配已改用與首頁查看範圍相同的 `HomeRangePicker` 日期選擇器，並在預算項目情境啟用日曆複選：使用者可在一致的日期 bottom sheet 直接點選多個分配日，系統再轉成每月日號規則，不再只是 1~31 的純數字格或另一套自製月曆，降低選錯分配日期的機率

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
- 細項頁
- 分析頁右上角一鍵直接匯出 PDF（主路徑，不經報表預覽頁）
- `/analysis/print` 僅保留進階／除錯（螢幕預覽 + PDF／CSV，與分析頁同一套圖示化資訊架構）
- 圓餅圖可直接點擊查看目前最大分類 / 帳戶明細，並提供 hover / press 回饋
- 圓餅圖尺寸會隨較窄螢幕縮放，避免固定 220px 在小裝置失衡
- 互動分析頁完整跟隨 App Dark／Light mode（背景、文字、卡片、圖表軌道／文字、期間篩選與 BottomNav 共存）

報表輸出除了 CSV，也支援分析頁一鍵 PDF（html2canvas + jsPDF，檔名 `交易報表_YYYY-MM.pdf`）：抬頭含帳本／期間／匯出時間／幣別／篩選；明細含日期、類型、分類+icon、帳戶+icon、金額、備註、標籤；全彩淺色列印友善、含頁碼、無浮水印。主 UX 按匯出即直接下載／分享，不必先進入 `/analysis/print` 預覽。App 為 Dark mode（含系統跟隨深色、手動深色）時，互動分析頁 `/analysis` 完整深色適配；PDF／offscreen 報表本體與 raster 仍強制淺色（白／淺底、深色文字、淺色圖表軌道），不受 App 深色 CSS 變數或 `prefers-color-scheme` 影響。進階 `/analysis/print` 的 chrome／控制列跟隨 App 深色，報表預覽本體仍淺色。PDF 匯出前會固定 A4 寬度並套用 `data-print-layout="a4"` 桌面多欄排版（大數字三欄、圖表雙欄、預算卡雙欄），再以等比切片分頁（避開圖表／卡片／明細列中切斷並預留頁碼頁尾空白），避免窄視窗 mobile 堆疊、末頁被拉伸，或區塊／圖表／文字被裁切。適合：

- 月結
- 對帳
- 匯出給他人檢查
- 留存報表

### 4.3 資產與負債

資產頁不只顯示帳戶餘額，而是有明確的財務拆分：

- 總資產
- 可支配資產
- 負債
- 借出
- 借入

其中「可支配資產」已考慮代收與暫收款不應算成可自由使用金額，因此比一般簡單加總更接近真實狀態。

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
- 檢視請款單細節

這讓使用者能把零散的報銷彙整成真正可提交的請款資料。請款單完成後，匯入的原報銷交易會被視為已報銷，報銷清單、資產頁未報銷金額與狀態同步邏輯都會採用同一個已完成請款單來源；若請款單還原後再次完成，先前軟刪的入帳交易也會釋放冪等鍵，避免同一張請款單重新入帳時撞到唯一鍵。SMB-255 / v1.3.35 後，草稿請款單內已導入的報銷項目會在來源交易變更時自動同步，不需使用者手動重新儲存請款單。

SMB-259 後，導入報銷／借出選取頁可為每筆已選項目設定「本次請款金額」（預設為待請款／剩餘未收回全額，須 > 0 且 ≤ 可用上限），不必一次請完；請款單建立／編輯表單亦列出已導入項目並可直接編輯本次請款金額；新建草稿 session 分別保存 `importAmountOverrides` 與 `borrowLoanImportAmountOverrides`；草稿自動同步在來源 pending 下降時只下修已設定的分批金額，不自動上調至全額；完成請款後來源交易 `reimbursed_minor` 依 claim item 實際金額累計，剩餘可再導入下一張請款單。

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

這代表它不是單純把資料丟上雲端，而是有共享身分與同步關係的設計。

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

## 9. 銀行同步

### 9.1 銀行同步現況

銀行同步已改為可透過環境變數 `VITE_BANK_SYNC_FEATURE_ENABLED` 啟用的會員功能：

- 屬於會員功能（`assertCanUseBankSync()`）
- 目前支援 **Android App 第一銀行本地同步**（非 Open Banking）
- SMB-278：`isBankSyncFeatureEnabled()` 只依 feature flag 控制設定入口與路由可視性；原生自動化另由 `isBankSyncNativeAutomationAvailable()` 閘控。Web／非 Android 進入 `/settings/bank-sync` 會顯示支援矩陣與可用性診斷（資格→平台→自動化／API→憑證→captcha→同步→審核），並提供單一 recovery CTA（例如取得 Android App），**不再因 provider 空列表靜默 redirect 回設定**
- SMB-280：`bank_sync_credentials_missing` 僅在 Android 原生自動化可用且尚未建立銀行連線時出現；Web／非 Android 不得誤用此碼（改為 `bank_sync_android_only`／支援矩陣）。原生 vault 改 `commit()` 寫入，同步／中斷以 `provider_connection_id` 對齊讀回，避免建立憑證後仍顯示無憑證或 legacy reconnect；legacy vault 缺失走 credentials 階段 +「重新連結銀行」CTA
- 已移除 Sandbox / Mock 生產路徑；舊測試連線會在 UI 標示為已停用
- 建立連線改為引導式流程：選擇銀行 → 登入 → 帳戶對應 → 首次同步
- 第一銀行驗證碼 OCR 全失敗時（v1.3.19），建立連線頁會顯示驗證碼圖與手動輸入框，使用者輸入 4 碼後可重試；若已先手動填寫則跳過 OCR
- v1.3.20（SMB-241）：Android 銀行自動化 WebView 強制 1280px 桌面 viewport 與登入頁 DOM 探測，避免載入行動版登入頁導致驗證碼過小或 OCR 失敗；canvas 擷取過小時改以 cookie 直接下載驗證碼圖
- v1.3.32（SMB-252）P1 銀行同步硬化：Android `FirstBankAutomation` 以 `shouldInterceptRequest` 優先攔截交易 JSON（DOM `table.CnbTable` 降備援）、OCR 信心門檻 + 全失敗回圖手填、frame 合約自檢（`#code_verify` /「我的帳戶」）；銀行連線頁新增「匯入銀行帳單 CSV」退路（`bank-statement-csv.js` → 待匯入審核管線）
- v1.3.34（SMB-252 Restart）修復 v1.3.32 desktop 硬化的回歸：桌面登入頁探測 `buildDesktopLoginPageProbeScript()` 原把「頁面文字含手機版 / Mobile Bank」當成 `mobileHint` 並列入 `ready` 攔阻條件，導致第一銀行**電腦版**登入頁（`index103.html`，文字本身就含指向行動銀行 App 的「Mobile Bank」連結）被誤判為手機版而中止（`first_bank_login_page_mismatch`）。治本：`ready` 只依功能錨點（`hasLoginForm` / `hasCaptchaImage` / `hasCaptchaLoginArea` / `hasVrfyCode`）；`mobileHint` 改為依版面結構（行動版 `viewport` `width=device-width` + 缺少 desktop 錨點）推斷的**非攔阻診斷欄位**，不再用頁面文字判斷
- v1.3.36（SMB-252 Restart）修復「登入送出/驗證碼」階段失敗（v1.3.34 修好誤判手機版後，實機 trace 顯示送出後仍停在登入頁→退回 OCR 第 2~5 次空轉→`first_bank_login_failed`）。根因（已比對線上 `index103.html` 真實表單）：`doLogin()` 讀取 `type="hidden"` 的 `#loginCustId`（真值欄位），`#loginCustIdFake` 僅為可見代理、由 `attachIdBehavior` 遮罩事件不可靠同步；`buildSubmitLoginScript` 過去只設 `*Fake` 欄位 `.value`，隱藏 `#loginCustId` 可能為空 → `doLogin()` 跳 `alert` 中止 → 從未真正送出。治本：(1) 直接寫入 `doLogin()` 真正讀取的隱藏/實名欄位 `loginCustId`/`loginCustIdRptSeq`/`usrId`/`pwd`/`vrfyCode`（`setFieldByName`）；(2) 送出改 `clickArea()`→備援 `doLogin()`，不再假設只有 `clickArea()`；(3) 攔截 `window.alert()` 並新增 `buildLoginResponseDiagnosticsScript` / `captureLoginResponseDiagnostics`，把 alert／訊息回覆頁／欄位驗證文字寫入 debug trace（`summarizeLoginFailure` 取代籠統訊息）；(4) `waitForLoginSuccess` 偵測 alert/錯誤對話框即提早歸因，不再空等 15 秒。屬 Android 原生修復，已重建 APK（versionName 1.3.36）始能 ship 至裝置；需真機/模擬器以真實 i-Bank 憑證實測
- SMB-266 後第一銀行 Android WebView 同步入口與交易查詢再硬化：登入後 frame / 帳戶總覽不再只依賴「我的帳戶」中文文字，而是優先使用 URL / function (`openIt`) / ID (`overview-account`、`tab1`) / table (`table.CnbTable`) 等 structural anchors，中文與英文文案僅作備援；交易 JSON 攔截只 replay 安全 GET，POST 候選請求因 WebView 無法提供 request body 會直接放行，避免以空 body 重送破壞原始銀行請求，資料仍可由 DOM fallback 解析；合約自檢同步加入 frame structural predicates，失敗分類補上 `portal_changed` / `retry` / `reconnect`，`debugHint` / `debugLastStep` 會提示可檢查的錨點與 POST fallback 狀態
- 匯入前會進入待匯入清單，需手動審核後才寫入記帳交易
- 多銀行 Provider 接口保留（`VITE_BANK_SYNC_PROVIDERS_JSON`），後續可擴充

所以這不是完全未做，而是已建流程、以會員 + Android 第一銀行為主的受控功能。

### 9.2 載具同步（v1.3.17 起，v1.3.19 憑證格式修正，v1.3.30 SPA 治本改寫，v1.3.40 Cloudflare 挑戰修復，SMB-265 可靠性硬化，SMB-278 可用性診斷）

- 會員限定功能：`/settings/carrier-sync` 設定頁透過 backend scrape API 拉取財政部載具發票，pending 佇列審核後匯入
- SMB-278：設定頁新增可用性診斷面板（資格→平台→API health→憑證→captcha→同步→審核／匯入），顯示去識別化錯誤碼與單一 recovery CTA；captcha 支援刷新、取消（cancel session）與到期提示；新增 `GET /api/einvoice/health`（health 200 僅代表服務可連線，**不可**當成財政部登入成功）；補回 `playwright:carrier-sync` 並要求 bypass onboarding 進入有 BottomNav 的 app-shell
- SMB-280：載具 health／scrape 在 cookie-auth 模式下一律附帶 `X-Straw-Auth-Storage`（及 native client header），後端 CORS 對 Cookie／native client 亦視為 credentialed，消除 `credentials:include` + `ACAO:*` 造成的誤報 `einvoice_network_failed`；同步失敗會以 `code: message` 寫入 lastError 供可用性面板分流
- v1.3.19 修正：財政部平台登入憑證為「手機號碼 + 密碼」（09 開頭 10 碼 + 至少 4 位密碼），非手機條碼 `/XXXXXXX` 與查詢碼；後端 Playwright 改走官方 `accounts/login` 後再查詢發票
- v1.3.30（SMB-251）治本改寫：財政部 2026-06 新版 Vue SPA + OAuth2 後，Playwright provider 不再解析 DOM 表格或截圖驗證碼；改為 (1) 以 JSON API `service-mc.einvoice.nat.gov.tw/act/login/api/act002i/captcha` 取得 `{token,image}` 並在 session 保存 token；(2) 登入使用實測選擇器 `#mobile_phone` / `#password` / `#captcha` / `#submitBtn`（全 env 可覆寫）；(3) 查詢以 `page.on('response')` 攔截官方 JSON API 並交 `normalizeInvoiceList`，DOM 解析降為備援；(4) 跨月 + 62 天視窗自動切分查詢；(5) 新增 `backend/scripts/einvoice-portal-contract-check.mjs` 合約自檢腳本。登入 / 查詢 URL、選擇器、API pattern 皆可透過 `EINVOICE_PORTAL_*` / `EINVOICE_SCRAPE_SELECTORS_JSON` 覆寫
- v1.3.31（SMB-253）P2 防打地鼠：合約自檢接 cron / CI（`sync-contract-check-run.mjs`、`sync-contract-check-cron.sh`、`.github/workflows/sync-contract-check.yml`）；失敗時告警至 `log.wastebase.xyz/issues/SMB-253` 並節流 Plane comment；失敗分類碼（portal_changed / captcha / auth / timeout）累計統計；第一銀行登入頁錨點（`#code_verify`、`captchaLoginArea`、`vrfyCode` 等）由 `first-bank-portal-contract-check.mjs` 定期探測
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

### 舊 Android 原生自動化（SMB-168～SMB-180；SMB-209 已刪除）
- SMB-209 以「刪除重來」為前提移除電子發票 Android WebView / OCR 自動化方案：不再註冊 `EInvoiceAutomation` Capacitor 插件、不再宣告電子發票 Activity，並刪除相關 Java 實作、Java 測試與登入模擬腳本。
- `src/services/einvoice/native-automation.js` 僅保留 no-op stub，固定回傳不支援並指向 backend API 流程；產品查詢路徑不再含官方網頁登入、CAPTCHA OCR、手動驗證碼 fallback 或舊查詢頁 DOM 解析。
- 新查詢路徑：frontend `scrapeEInvoiceList()` → backend `/api/einvoice/query-invoices` → 財政部電子發票 API；使用手機條碼 `cardNo`、查詢碼 `cardEncrypt`、日期區間與 `onlyWinningInv` 查詢，回傳標準化發票清單。
- Debug trace 改記錄遮罩後的手機條碼 `maskedCarrierBarcode`，不再保存或顯示舊手機號碼 / 密碼欄位。

- **v1.2.13（SMB-165 匯入交易建立）**：Step 4 新增可選的「同步建立支出交易」區塊；使用者可在確認匯入前選取記帳帳戶與支出分類，選取後每筆匯入發票將依發票金額（×100 換算 amountMinor）與日期自動建立 `einvoice` 來源的支出交易，並將交易 ID 寫入 `einvoice_invoice_imports.transaction_id`；未選帳戶 / 分類時維持舊行為（僅儲存匯入紀錄，transaction_id 為 null）；i18n 同步新增 `einvoice.step4.create_tx_label` 等 7 個三語 key；新增 5 個單元測試覆蓋交易建立路徑（transactionId 正確、createExpense 失敗進入 failed、amountMinor 換算、重複發票不呼叫 createExpense）。
- **v1.3.3（SMB-226 載具重建）**：依技術文檔 §3.3.2 補齊「載具名稱 → 標籤（tag）」：`buildCarrierTagsJson()` 將 `carrierName` 轉成 `transactions.tags_json` 相容的 JSON 陣列字串，匯入並同步建立支出交易時寫入 `tagsJson`；Step 3 發票卡片與 Step 4 確認預覽新增載具 chip（`carrier-chip` / `preview-carrier`），讓使用者可辨識每筆發票所屬載具；新增 `einvoice.step3.carrier_label` 三語 i18n；新增 `test/einvoice-carrier.test.js` 與 `einvoice-import.test.js` 載具標籤串接測試；Playwright 驗證 Step3/Step4 載具 UI 正確渲染。

- **v1.0.24（載具流程穩定性修復）**：
  - **[Bug 修復] 匯入失敗訊息消失**：`EInvoiceStep4Confirm.vue` 原本在 catch 中設定 `store.errorMessage` 並跳回 Step3，但 Step3 的 `onMounted` 立即清空 `store.errorMessage = ''`，導致使用者看不到任何錯誤提示。改為在 Step4 使用本地 `importError` ref，錯誤顯示於 Step4 原地（確認按鈕下方紅色提示文字），不再轉跳 Step3。
  - **[Bug 修復] 抓取並發 race condition**：`EInvoiceStep3Select.vue` 的 `onMounted` 新增 `if (store.isScraping) return` 守衛，避免使用者快速來回切換步驟時觸發多個並發 scrape 請求，防止 `invoiceList` 被非預期覆蓋與 `isScraping` 提前重置。
  - **[防呆] Step4 匯入防重複點擊**：`handleImport` 起始加入 `if (store.isImporting) return` JS 層守衛（原本只靠 `:disabled` 屬性，React/Vue tick 之前可能重複觸發）；「上一步」按鈕在匯入中也改為 `disabled`。
  - **[可觀測性] 補充 debug log**：`backend.js`（憑證儲存/載入/抓取/匯入各階段）、`EInvoiceStep3Select.vue`（抓取開始/完成/失敗）、`EInvoiceStep4Confirm.vue`（匯入開始/完成/失敗）均補上 `console.log` / `console.error`，log 不輸出手機號碼完整內容（僅前 4 碼）、密碼、token 等敏感資料。
  - **[測試] 新增 `test/einvoice-import.test.js`**：10 個單元測試案例，覆蓋空清單、全新匯入、去重跳過、全部重複、單筆 DB 失敗、全部失敗、混合情境、transactionId 固定為 null、merchantName 為 null、去重基準 Set 正確性；`node --test test/*.test.js` 382/382 通過。

### 入口
- `功能列表` 頁面（FeatureListPage.vue）→「電子發票匯入」
- 路由：`/einvoice-import`
- 精靈頁頂部返回按鈕使用全域 Font Awesome `fa-chevron-left` 註冊圖示；密碼欄顯示切換使用 `fa-eye` / `fa-eye-slash` 註冊圖示，避免頁面載入時出現空按鈕。
- **SMB-167 (v1.0.9)**：Step 1 step-footer 補上「上一步」按鈕（原本只有「下一步」），與 Step 2–4 雙按鈕 pattern 對齊；點擊執行 `store.reset()` + `router.back()` 退出 wizard，與精靈頂部返回按鈕行為一致。
