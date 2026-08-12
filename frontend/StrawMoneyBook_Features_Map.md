# StrawMoneyBook 功能與檔案對應

此文件整理目前 StrawMoneyBook 的主要功能、頁面、元件與資料層對應關係，方便開發與維護。
詳細產品說明請搭配 `../StrawMoneyBook_App_Features_Detailed.md` 閱讀；專案入口與開發指令請先閱讀 `../README.md`；詳細產品功能檔已統整為唯一版本。

## 1. 功能總覽

- 多帳本管理（切換帳本、排序、帳本設定、活動帳本上下文刷新）
- 首頁總覽（帳本切換、收支卡、預算簡表、交易流、浮動快速新增；收支卡收入／支出區塊背景與文字色跟隨主題 Light／Dark token，淺色模式不可沿用深色硬編碼底；SMB-257 後首頁交易流在全部 / 年 / 月 / 日範圍皆改為 SQL 分頁載入，每頁最多 300 筆，badge 顯示總筆數；smb287 後收支摘要改由 `summarizeHomeAssetTotalsByScope` 單次 SQL 彙總（含退款淨額／`include_in_analysis`／排除 `loan_payment`），不再分頁掃完全部交易；啟動改為帳本 critical path（帳戶／分類／目前預算）先完成，完整性掃描與借貸／報銷／附加範本／recent 背景延遲載入；交易明細／編輯改載入關聯交易而非整本帳本；分析「全部」範圍改 chunked + 讓出主執行緒；首頁期間切換以 `homeLoadToken` 丟棄過期結果。空狀態文案透過 i18n 維護並由 source test 防回歸，預算簡表滑動切換閾值已提高以降低誤觸）
- 記帳三模式（AI 記帳、手動快速新增、問答記帳；SMB-175 後手動快速新增的金額欄整合計算機，支援加減乘除四則運算並即時預覽結果；帳戶選擇器一律依帳戶群組分組——含 Quick Add／交易編輯／AI／首頁編輯 sheet／借貸／報銷／訂閱／存錢罐／銀行對應，載具與電子發票預設帳戶用 optgroup；表單底色統一走 `--input-bg`，並補齊歷史缺失的 `--surface`／`--surface-soft` 別名）
- 交易查詢（搜尋頁、日曆頁、交易明細頁、交易編輯頁；SMB-155 後搜尋交易改為 SQL 分頁載入，每頁 300 筆，關鍵字與日期篩選會先進資料查詢層後再取當頁資料，避免大型帳本一次載入全部交易；SMB-211 後交易搜尋的 SQL 關鍵字比對會納入借貸交易的畫面顯示條件與往來對象，例如借出、借入、歸還 / 還款與收回 / 收回借款，不再只能用 `loan_payment` 或備註命中借貸交易；SMB-189 / v1.2.5 後帳本載入會自動掃描並修復交易遺失帳戶 / peer 帳戶 / 分類引用、壞掉的轉帳群組、報銷總額 / 已付款狀態與借貸狀態；SMB-219 / v1.2.28 後交易編輯頁與首頁交易編輯 sheet 改選分類時會同步套用分類預設報銷、紀錄預算與紀錄收支設定，載入既有交易時保留原交易已儲存的記帳旗標；smb292 後刪除交易成功一律 `replace` 回首頁並還原離開首頁前的 window 捲動（列表變短時 clamp），不可停在已刪除明細／空白頁；詳情頁若交易已不存在亦導回首頁）
- 退款流程（交易明細可建立退款、選擇退款帳戶、指定扣除金額；SMB-149 後部分退款會以原交易扣除退款金額後的淨額納入首頁、預算、分析與列印報表，全額退款則歸零）
- 預算管理（月預算、發薪週期預算、分類預算、共同預算池、日均規則、已用/剩餘/保留金額、預算剩餘自動存入存錢罐；SMB-260 / v1.3.45 後新增共同預算池：手動池總額、分類綁定、2B 月總額、3C 超支、池層 `budget_container_month` 預算存款；v1.3.48 日池可直接多選池內分類且綁定分類不需子預算金額，首頁日模式納入日池；SMB-268 後新增共同預算池與一般分類預算項目可用「套用至月份」跨月／跨年建立，服務層 fan-out 為每月獨立 budget/container/item，建立前檢查目標月份同名池或同分類項目衝突並避免 partial write，既有項目編輯仍只改目前月；SMB-269 後每個帳本可在曆月與發薪週期預算間切換，發薪週期由固定每月發薪日錨定，預算資料以 `period_key` / 起訖日 / mode 唯一識別，交易依實際日期落入週期，一般分類項目與共同預算池皆支援；SMB-271 後新增 / 編輯一般預算項目與共同預算池 sheet 也能直接設定目前帳本預算期間與每月發薪日，UI 會明確標示這是帳本層設定、切換影響該帳本預算頁與首頁預算卡，不會把每個項目改成獨立週期；SMB-272 後啟動 / reload 若保留 `pay:YYYY-MM-DD` 發薪週期 key，首頁月份篩選不再把它當 `YYYY-MM` 送進交易查詢，預算 store 會正規解析該 key，交易 repo 對非法年/月/日 key 回空結果而非拋 `Invalid time value`；SMB-273 後首次啟動、完整重啟、頁面 reload、Android resume、web/app shell focus 與 visibility 回可見都會重新載入今天的發薪週期，發薪日前一天仍是舊期、發薪日 00:00 起自動切到新期；SMB-274 後若 focus 與 visibility 同時建立同一預算期間，後到請求會讀回既有 row，不會產生唯一鍵 runtime error；SMB-275 後預算期間的「今天」一律以帳本時區解析，`resolveCurrentBudgetPeriodForLedger()` 成為 lifecycle reload 與預算頁進入入口，發薪週期帳本的首頁月份篩選不再覆寫預算期間，reload 成功後廣播 `app:budget-period-sync` 同步首頁篩選與預算頁；SMB-276 後改發薪日或切換曆月／發薪週期時，若新目前期間尚無使用者設定內容會自動 carry-forward 舊期預算結構到新期，避免預算頁跳到空殼，歷史期間與交易不搬移；SMB-151 後預算項目的「日期」分配改用與首頁查看範圍相同的 `HomeRangePicker` 日期選擇器，並在預算項目情境啟用日曆複選，點選多個日期後轉成每月日號規則，不再只是 1~31 純數字格或另一套自製月曆；SMB-153 後功能列表加入帶圖示的預算項目入口，可直接前往 `/budget`）
- 分析與報表（收入/支出圖表、分類/帳戶明細、CSV 匯出、分析頁一鍵直接圖示化 PDF 快捷；完整交易報表頁 `/analysis/print` 仍可由分析頁「交易報表」入口進入，提供全部/年/月/日/自訂期間客製化預覽，以及 PDF／CSV 匯出成功後的「開啟檔案」按鈕；分析頁與報表文件共用圖示化圓餅／長條／明細欄位，PDF 以 html2canvas+jsPDF 產出 `交易報表_YYYY-MM.pdf` 淺色全彩報表；互動分析頁 `/analysis`（圖表、摘要、篩選、導覽 chrome）完整跟隨 App Dark／Light mode；即使 App 為 Dark mode／系統跟隨深色，PDF／offscreen 報表本體仍強制淺色列印友善（白／淺底、深色文字、淺色圖表軌道）；`/analysis/print` 的 chrome 跟隨 App 深色、報表本體仍淺色；PDF 擷取前強制 A4 寬度與桌面多欄排版並等比分頁（避開圖表／卡片／明細列中切斷、預留頁碼頁尾，避免內容裁切）；SMB-146 後支出分類分析會將正向附加項目拆成獨立分析列，主分類扣除該附加金額後仍維持總支出一致；圓餅圖已改為可點擊並提供 hover/press 回饋，尺寸也會隨較小螢幕縮放）
- 資產管理（帳戶餘額、帳戶群組、總資產 / 可支配 / 負債、群組內金額摘要；資產摘要卡版面：總資產滿寬 → 可支配／負債同行 → **借出／借入同行** → **有價證券滿寬置底**（`assets-lend-entry`／`assets-borrow-entry`／`assets-securities-entry`）；有價證券 v2 P1 `/assets/securities`：交割帳戶＝獨立組合、T+2 10:00 排程交割＋到期自動入帳、本金不計收支／已實現損益「投資損益」、精簡資金／完整持倉、未實現市值｜成本雙模式、標的名稱／代碼／類型與流水編刪、交割改期取消與真原子回滾現金＋損益腿（含確認／取消／流水刪除／標的刪除中途失敗不殘留、雙交割戶同代碼獨立入帳）；總資產公式依未實現模式計入市值或成本占用；分析頁有投資／證券摘要；共同帳本／備份匯出入含 `securities`／`security_transactions`（含 settle／settlement_status／principal／proceeds）；SMB-159 / SMB-160 後群組統計支援帳戶層級納入開關，並會依匯率 snapshot 將外幣帳戶換算為帳本幣別後加總；負向負債帳戶會以絕對值納入負債摘要，避免信用卡等帳戶方向差異造成低估；SMB-155 後帳戶明細交易紀錄改為每頁 300 筆，並用分頁前交易金額校正每筆交易後餘額）
- 借貸管理（借出 / 借入、還款、作廢、往來對象明細；v1.2.6 後若借貸設有預設利息，單筆新增 / 編輯還款會阻擋超過本金加預設利息的目標總額；v1.2.22 / SMB-214 後還款支援利息功能：輸入金額超過剩餘本金時，超出部分自動計為利息並建立對應利息交易（借出方向為利息收入、借入方向為利息支出），還款表單即時顯示利息預覽；v1.2.15 / SMB-210 後借出 / 借入建立與所有還款、利息交易預設不計入收支分析與預算統計）
- 借貸建立後可於借貸明細變更「建立入帳帳戶」，會直接修正該筆初始借入 / 借出交易的帳戶歸屬
- SMB-225 / v1.2.51 後對象明細頁（`LoanCounterpartyDetailPage.vue`，有匯出 CSV 按鈕的同一頁）在 header 與 summary 之間**獨立**呈現「新增該對象借出 / 新增該對象借入」兩顆 primary 按鈕（容器 `.counterparty-create-actions`，desktop flex 並排、`@media 480px` 切 column 並 reset `flex: 0 0 auto` 保留正常按鈕高度）→ `openCreateSheet('lend' | 'borrow')`，鎖定方向、自動帶入對象名稱與預設帳戶，沿用既有 `loanStore.create` 主路徑。v1.2.50 把兩顆按鈕放進 header 內部 `.head-actions` 時被全域 `header.row:has(.back-btn)` iOS-nav grid 規則（`global.css` 469-527）擠進同一 grid cell 隱藏，v1.2.51 改放在 header 外的獨立 row 避開該規則。v1.2.49 放錯到 `LoanDetailPage` 的快速入口仍維持還原狀態
- 報銷與請款管理（可報銷交易、代收抵扣、請款單建立 / 完成 / 匯出；請款單導入報銷改由獨立頁面選取，支援全選 / 取消全選；SMB-259 後導入報銷／借出選取頁與請款單建立／編輯表單皆可為每筆已選項目編輯「本次請款金額」（預設待請款／剩餘未收回全額，> 0 且 ≤ 上限），draft session 分別保存 `importAmountOverrides` / `borrowLoanImportAmountOverrides`，草稿自動同步在 pending 下降時只 cap 已設分批金額；SMB-255 / v1.3.35 後草稿請款單內導入報銷項目會在來源交易修改報銷金額、刪除、取消可報銷或直接報銷入帳時自動更新或移除對應 import item 並重算總額，僅影響 `draft` 請款單；SMB-247 / v1.3.25 後「導入借出」匯入金額改為剩餘未收回（本金 + 預設利息 − 已還金額），不再固定使用 setup 交易原始本金；SMB-222 Restart / v1.2.45 後「導入借入」改為「導入借出」：只列尚未完成的借出（`loans.direction='lend'` 且 `status NOT IN ('settled','void')`，setup 交易為 `origin_type='loan_payment'` AND `type='expense'`），完成請款單時對應借出會被整套消除（軟刪 loan_payment 來源交易、刪除 loan_payments 還款、軟刪 loans），請款單從 paid 退回 draft 或刪除 paid 請款單時會復原借出與 setup 交易；SMB-222 Restart / v1.2.44 後請款單導入借出 / 借貸入帳交易拆出獨立區塊與獨立頁面 (`/claim-sheets/:id/import-borrow-loans`)，與導入報銷不再混在同一份候選列表，請款單建立 / 編輯表單同時提供「導入報銷」與「導入借出」兩個區塊與按鈕，draft session 也分開保存兩種選取，請款單編輯儲存時 borrow_loan 改透過 `buildClaimSheetImportedClaimItem` 正確寫入 `entry_type=income`，不會被誤存為 expense；SMB-150 後從導入報銷頁返回時會固定回到原本的新增 / 編輯請款單流程，不再直接跳出請款單；完成請款單會讓匯入報銷項目回到已報銷狀態，不再留在未報銷；還原後重新完成不會因舊入帳交易冪等鍵撞唯一鍵；SMB-148 後代收管理會保留部分抵扣但仍有可用餘額的代收，只有完全未抵扣項目可直接刪除；SMB-237 / v1.3.11 後報銷清單未報銷項目可透過「報銷金額」設定底部面板自訂實際報銷金額（存於交易 `reimburse_target_minor` 欄位，migration 036），設定後匯出 CSV（新增「報銷金額」欄）、請款單導入金額與報銷待處理 / 已報銷計算都以設定金額為準，未設定時維持以原始支出計算的舊行為，可一鍵重設回原始支出）
- 存錢罐、訂閱追蹤與自動存提
- 訂閱追蹤的扣款日以當天開始為扣款時間點；進入扣款日後仍可標示本期已到期，但「下次扣款」會直接推進到下一個週期，且排程日期以 App 預設時區正規化，避免 UTC / CI 環境把台北時間午夜誤判成前一天；v1.2.6 後訂閱自動扣款與存錢罐自動存入的到期日判斷會使用帳本時區，App 開啟 / 回前景 / 帳本切換與儲存訂閱後會對今日到期項目建立冪等支出交易
- AI 自動記帳（文字解析、語音輸入、會員次數限制）
- AI 自動記帳支援金額加減公式且不會誤改交易日期，也不會把算式符號殘留進備註（例如 `120+20`、`120-20`）
- smb291 後 AI 記帳金額四則運算與手動快速新增計算機共用 `amount-expression` 求值（含 `+ - * /`、`× ÷`、優先序、空白與萬/千/百單位展開，例如 `100+50*2`、`1.5*2萬`、`2千+500`）；已用來對應分類／帳戶／自動識別關鍵字的保留詞不會再寫入備註，但明確以「備註／note／memo」標註的內容會保留
- AI 語音再解析若沒有辨識出新的備註內容，會保留目前表單中的既有備註
- AI 自動記帳在 1.0.3 / SMB-163 後會把目前帳本的附加項目模板納入解析，像折價券、優惠、手續費等自訂模板名稱會自動拆成附加項目，不再殘留到備註或被誤當主金額
- 交易新增 / 編輯在 1.0.3 / SMB-162 後允許主金額被附加項目完整抵消為 0 元；前端只阻擋附加後淨額為負數，與資料層允許 0 元交易的規則一致
- 帳號系統（Email / Google 登入、個人資料、忘記密碼、臨時密碼、登出；Google 登入與 Google 備份共用前端 Web Client ID 解析，帳號頁缺少設定時仍會顯示 Google 區塊與設定提示，不再整段消失；SMB-238 / v1.3.12 後修復 Capacitor `https://localhost` 連線正式 API 時 Google prepare 階段 `shared_ledger_network_error`：只有 `useAuthStorage: true` 的登入 / refresh / logout 才帶 cookie credentials，`/api/auth/google/prepare` 不再誤觸跨域 CORS；SMB-238 / v1.3.13 再修復實際登入提交 `POST /api/auth/google` 的 CORS preflight：`wantsCredentialedCors()` 改從 `OPTIONS` preflight 的 `Access-Control-Request-Headers` 偵測 `x-straw-auth-storage`，避免 preflight 回 wildcard ACAO 導致 credentialed 請求被瀏覽器拒絕 Failed to fetch；SMB-238 / v1.3.14 修復 Capacitor `https://localhost` 登入後會員自動被登出：`auth-cookies.js` 改以 Origin 與 API host 是否相同決定 refresh cookie 的 `SameSite` 政策，跨站（如 localhost → api.strawmb.com）改回 `SameSite=None; Secure`，避免 refresh 時瀏覽器不帶 HttpOnly cookie 而清空 session；`readPersistedAuthSession` 在 cookie 模式下保留 sessionStorage 使用者資料，App 重啟靜默 refresh 期間不再誤顯示已登出；SMB-239 / v1.3.18 後再修復 Android / iOS 冷啟動後會員登入狀態無法保持：native 平台改把使用者 profile 存 `localStorage`（Web 仍用 sessionStorage），`refreshSharedLedgerSession()` 在無 access token 時改以 cookie 靜默 restore；SMB-243 / v1.3.22 修復跨站 API 回應 CORP 改 `cross-origin`；SMB-244 / v1.3.23 修復 native 登入/refresh 帶 `X-Straw-Native-Client` 時 CORS preflight 未允許此標頭導致 Failed to fetch；smb288 後 Web 另以 `straw.shared_ledger_auth_hint.v1` 記住曾登入，tab 關閉後冷啟動仍觸發 cookie restore 並顯示「Session 恢復中」而非閃未登入；匿名不再因 cookie mode 恒 true 每輪打 refresh；同步 schedule 補齊可見 `paused_*`）
- 共同帳本（建立共同帳本、共享連結、Email 邀請、接受邀請、同步；SMB-234 / v1.3.6 後 Email 邀請會回傳明確寄送狀態並在 `SettingsSharedLedgerPage.vue` 顯示成功 / 失敗 toast，待加入清單可看重發狀態，失敗時可重發；快照上傳會檢查 baseVersion，包含 version=0 邊界，避免舊快照覆蓋新資料；SMB-187 / v1.2.4 後共同帳本快照在合併 tombstone 後會先處理孤兒 FK；smb297 起改為合成缺失父列並保留子表筆數（禁止過濾刪減交易／attachments／loan payments／reimbursement／budget／savings／bank），僅對無法合成的缺失交易目標清空可空引用，避免拉取 / 接受共享帳本時因 SQLite foreign key constraint 中斷；替換本機帳本前會先保留本機快照，若遠端快照匯入失敗會嘗試復原原本本機帳本，降低資料被清空後中斷的風險；SMB-236 / v1.3.8 後快照合併引入 merge unit（轉帳雙腿、借貸還款、請款與預支 bundle），避免跨表 last-write-wins 靜默混用本機與遠端列造成餘額不一致，衝突時整組採較新一方並透過 `buildMergeLog` 記錄；smb290 後帳戶 metadata 不再與全部交易綁成 account_coherence（避免遠端帳戶欄位更新抹掉本機未同步交易），pull／下載改走 base／dirty 三方或雙向合併而非硬蓋，父列 tombstone 遇較新子列會復活，衝突寫入可見 `conflict_resolved`／merge log；smb296／smb297 後 JSON 匯入／Google Drive sanitize／共同帳本路徑統一在 INSERT 前 `normalizeSharedLedgerSnapshot` 做 FK preserve（合成父列、保留子列；sync replace 不自動 repair），tombstone 復活改 bottom-up（交易→帳戶／分類→群組），帳戶／分類刪除改檢查含 soft-deleted 的 FK 引用並在硬刪會觸發 1811 時改 soft-delete，DB wipe／purge 維持 child-first 且 `PRAGMA foreign_keys=ON`，schema migration 009／026 的 transactions rebuild 改為先卸離 CASCADE／SET NULL 子引用再重建（全程 `foreign_keys=ON`，禁止 `OFF`），SQLite `run`/`execute` 將 FOREIGN KEY 轉成 typed `SQLITE_CONSTRAINT_FOREIGNKEY` 與可理解 i18n，同步失敗狀態可見，禁止關閉 `PRAGMA foreign_keys` 或 silent no-op）
- Google Drive 帳本同步（逐帳本啟用、跨裝置 pull / push；SMB-218 / v1.2.26 後拉回遠端快照前會驗證快照 `ledger_id` 與目前帳本一致，且替換本機帳本前會建立本機快照，遠端匯入失敗時嘗試復原原帳本與本機同步設定，避免錯帳本或異常快照覆蓋本機資料；SMB-230 / v1.3.4 後導入三方合併（`snapshot-merge.js` 的 `threeWayMergeSnapshots`）與 base snapshot 快取，避免多裝置同時修改時直接覆蓋本機未上傳變更，衝突時採較新變更並在 `SettingsGoogleDriveLedgerSyncPage.vue` 顯示提示；SMB-235 / v1.3.7 後以綁定 `accountEmail` 偵測 Google 帳號切換，背景/手動同步都不會靜默推送到不同帳號，設定頁顯示綁定帳號與待確認切換提示，並透過 `google-ledger-sync:account-switched` 事件顯示 warning toast；SMB-236 / v1.3.8 後雙向合併路徑也會偵測跨表衝突並回報 `lastConflictCount`，不再一律視為無衝突；smb296／smb297 後 Google Drive sanitize 同樣走 FK preserve（合成父列、保留子列），避免遠端／本機不一致快照在匯入時拋 `FOREIGN KEY constraint failed`；sync replace 不自動 repair；若本機仍有交易而遠端快照交易為空，阻擋 hard replace 並寫入可見 `empty_remote_blocked`）
- 自動備份（Google Drive / WebDAV；SMB-142 重建後，手動、背景 due check、資料更動後備份都會經過共用 provider runner，回傳 `completed / skipped / error` 統一結果，並以帳本 + provider lock 避免同一時間多個觸發源互相覆蓋狀態；runtime 事件含 `ledgerId / provider / mode / status / reason / checkedAt`，設定頁會即時同步最近一次 auto-check 狀態與時間；SMB-147 後 Google 自動備份在非原生平台會保存 `platform_unsupported` 偵測結果，Android 靜默恢復未連線時也會繼續跑 due diagnostics 寫入 `not_connected / reauth_required` 等狀態，避免頁面誤停在尚未執行自動偵測；手機背景恢復只做靜默 Google 授權，不會在 App 啟動或帳本切換時自動彈出互動登入；SMB-213 Restart / v1.2.24 後 Android offline/server auth code 重新授權會由 MainActivity 轉送 SocialLogin Google authorization result，避免授權完成後登入 promise 未結束而卡在「登入中」；SMB-181 後手動備份失敗時 toast 改顯示原始 error.message 而非 reason code，`buildProviderRunResult` 加入 `errorDetail` 欄位保存原始錯誤訊息，UI 改用 `result.errorDetail` 建立錯誤；SMB-186 / v1.2.3 後使用者在自動備份頁明確重新登入 Google 成功時，會清除過期的 `reauth_required` 自動檢查診斷，避免畫面仍顯示需要重新授權；SMB-186 / v1.2.7 後 native 平台可透過明確 OAuth 後端設定啟用 server auth code flow，並修復 `resolveGoogleProfileForConnect` 在 silent token 失敗但 profile 快取存在時不觸發 `googleSignIn` 造成無有效 token 的問題；SMB-191 / v1.2.9 後首次互動登入會先走 Credential Manager bottom UI 並關閉已授權帳號過濾，讓 SocialLogin 能在無憑證時 fallback 到標準 Google 登入，避免登入流程直接失敗；SMB-192 / v1.2.11 後自動備份設定頁載入與背景刷新只做靜默恢復，不再自動開啟 Google 互動登入，避免面板卡住或反覆跳出登入錯誤，使用者按下登入 / 重新登入才啟動互動流程；SMB-192 / v1.2.12 後 OAuth exchange / refresh 預設走 `https://api.strawmb.com` 且後端註冊 `/api/google/oauth/*`，不再從隱私權政策或官網靜態 host 推導 API，避免正式 App 收到 405；SMB-213 / v1.2.18 後 `resolveServerAuthCodeFlowEnabled` 補回以 `GOOGLE_OAUTH_DEFAULT_ORIGIN` 為 fallback 的 `isAbsoluteHttpUrl` 檢查，讓 native 在未設明確 env 時預設仍啟用 server auth code flow（長效 refresh token），不再 fallback 至 online mode 而頻繁需要重新授權；SMB-213 Restart / v1.2.21 後修復 Credential Manager bottom UI 與 server auth code flow 不相容：`style: 'bottom'` 無法在 Android 回傳 serverAuthCode，首次登入改依模式動態選擇 style，offline mode 用 `style: 'standard'` 以可靠取得 serverAuthCode，online mode 仍用 `style: 'bottom'` 保留 SMB-191 的 NoCredentialException fallback；SMB-213 Restart / v1.2.32 後自動備份重新登入與手動備份 / 還原會要求新的長效 refresh token，offline exchange 若未回傳 refresh token 就不再降級 online mode 或沿用舊失效 refresh token，避免重新登入後下一次自動備份又立即顯示需要重新授權；SMB-213 Restart / v1.2.33 後修復後端 exchange / refresh 端點因 `GOOGLE_OAUTH_CLIENT_SECRET` 未正確載入而回傳 `GOOGLE_EXCHANGE_004 / missing_google_oauth_env` 的問題：`getGoogleOAuthEnv()` 改以 `GOOGLE_AUTH_WEB_CLIENT_ID` 作為 clientId fallback，`npm start` 補上 `--env-file-if-exists=/.env` 確保 1Panel env 在 container 啟動時被載入）
- SMB-213 / v1.2.34：api.strawmb.com 的 serverless Google OAuth exchange / refresh copy 現在也支援 `GOOGLE_AUTH_WEB_CLIENT_ID` 作為 `GOOGLE_OAUTH_CLIENT_ID` fallback，避免重新授權後自動備份因 serverless env 命名差異失敗。
- SMB-224 / v1.2.46：修復 Google 自動備份重新登入時 `GOOGLE_EXCHANGE_005`：OAuth exchange 不再從 `GOOGLE_OAUTH_REDIRECT_URI` 自動帶入 `redirect_uri`（Android/iOS server auth code 交換不應附帶）；前端 `postJson` 改優先顯示 Google `error_description`，invalid_grant 映射為明確重新登入提示。
- SMB-224 Restart / v1.2.47：再修復 v1.2.46 部署後 Tester 仍回報 `GOOGLE_EXCHANGE_005`：production env `GOOGLE_OAUTH_CLIENT_SECRET` 被誤設成 client_id 值（結尾為 `.apps.googleusercontent.com`，而非 `GOCSPX-` 開頭的 web client secret），導致 Google 一律以 `invalid_client / "client secret is invalid"` 拒絕。backend 與 api.strawmb.com serverless 的 OAuth exchange / refresh 端點現在會偵測這種 client-id 形狀的 secret 並視為 missing，回應 `GOOGLE_EXCHANGE_004 / GOOGLE_REFRESH_004 missing_google_oauth_env`，錯誤訊息直接指出該 env 應使用 `GOCSPX-` 開頭的 secret；伺服器啟動時也會 `console.error` 明確警告；前端 `normalizeGoogleAuthError` 將 `missing_google_oauth_env / invalid_client / client secret is invalid` 映射為「Google 自動備份後端設定錯誤，請通知管理員」訊息。
- 記帳提醒與成就表（每日固定提醒、通知權限 / 精準提醒狀態、連續記帳天數、最長連續與累計記帳日）
- 會員邀請碼（邀請者 +7 天、被邀請者 +3 天，需先登入且不可重複邀請）
- 設定功能（資料管理、自動備份、帳本同步、匯率、自動識別、安全鎖、語言、會員、帳號、共同帳本；SMB-154 / 0.26.5 後設定首頁、登入 / 註冊與共同帳本相關頁面使用到的主要介面文案皆已納入 zh-TW / en / ja 正式 i18n key，避免切換英文 / 日文時依賴繁中 fallback；手動重設全部資料前會先建立 recovery JSON 備份，**備份失敗會中止清空**（不會繼續 reset）；SMB-190 / v1.2.5 後資料管理的 JSON / CSV 匯出檔名會加入時間戳，避免重複匯出覆蓋同一路徑檔案；SMB-216 / v1.2.29 後資料管理的還原備份、CSV 匯入與重設資料等可能超過 3 秒的流程會顯示含百分比的加載動畫，避免使用者誤以為卡住；SMB-221 / v1.2.40 後所有設定子頁面的標題加入與功能對應的 Font Awesome icon，與「關於我們」頁面一致的視覺風格；SMB-250 / v1.3.29 後曾於設定 → 個人化提供「介面風格」切換；smb289 起**只保留現代 mode**（`apple-ui.css` Apple HIG：Large Title、Inset Grouped、Segmented Control、list row + chevron），移除傳統／現代切換入口，舊 `traditional` preference 啟動時遷移為 `modern`；**保留** 5 tab 底部導覽、首頁 FAB 與全部功能區塊；SMB-254 / v1.3.33 後設定首頁（`/settings`）清單列高度調小、更緊湊：現代版設定列垂直 padding 由 `12px 14px` 收為 `8px 14px`（量測列高 63→54px），傳統版列間分隔由 12px 收為 8px、描述行高 1.35→1.3，兩種版型皆保留 `min-height: 44px` 點擊區與 safe-area）
- 子頁 header 標準（SMB-178）：含返回鍵的頁面主 header 採帳本同步頁樣式，直接放在頁面容器下，不包在 `card panel` 內容區塊內；全域 `.back-btn` 以 40px chevron icon 呈現，標題置中；新增 / 主要操作按鈕改放在第一個內容卡的 `panel-head` 右側，和存錢罐頁一致
- 關於與聯絡入口（官網、Facebook、Instagram、Threads、Email、隱私權政策）
- 官方網站 SEO / 品牌搜尋關鍵字（`../StrawMoneyBookWeb/index.html`：`StrawMoneyBook`、`稻草AI記帳`、`稻草記帳`、`AI記帳`、`對話記帳`、`自動記帳` 等）
- 官方網站 UI / UX 目前已收斂為共用 design tokens + 雙主題 header / page shell；首頁改為 icon / symbol 導向的掃讀式結構，首屏先聚焦單一句產品定位，再依序呈現 3 個重點、4 個主要場景與下載 / 預先體驗 CTA；手機導覽改為折疊選單，桌機保留精簡錨點導覽
- 官網次頁目前與首頁維持一致視覺語言：`/preview` 先說明預先體驗價值再提供外開表單與內嵌 iframe；共同帳本邀請頁保留 deep link / Play Store fallback 邏輯但改用統一介面；服務條款與隱私權政策改用同一套 legal document shell，並在官網 `public/terms-of-service/index.html`、`public/privacy-policy/index.html` 提供靜態直連頁，避免正式網域直接開啟法律文件路徑時因 SPA history fallback 未命中而回 404
- 銀行同步（會員限定；`VITE_BANK_SYNC_FEATURE_ENABLED` 啟用後顯示設定入口與支援矩陣；第一銀行自動登入僅 Android 原生；Web 顯示可讀支援矩陣與 CSV 退路，不再靜默導回）
- 載具同步（會員限定；可用性面板：資格→平台→API health→憑證→captcha→同步→審核；captcha 可刷新／取消／到期提示）
- Android 原生能力（首頁小工具目錄（SMB-157）、安全鎖、Google Identity、語音輸入、銀行自動化；電子發票精靈頁 header 在 SMB-178 後收斂回共用 `.btn.back-btn`，和帳本同步頁相同採左側 chevron、置中標題、右側等寬保留位；CI 發版流程已確保 `frontend/android/gradlew` 具備可執行權限，避免 `bundleRelease` 在 checkout 後直接失敗；CI concurrency 只會取消 PR 的舊 run，`main` push 會排隊跑完，避免發版 commit 與清空 release notes commit 互相產生取消 annotation；VS Code workspace 會透過 `java.import.exclusions` 與 `java.project.excludedPaths` 排除 Android Gradle 原生目錄的一般 Java 掃描，避免 JDT LS 未載入 Android SDK / Capacitor classpath 時誤報 `android.*`、`com.getcapacitor.*`、JUnit、Tesseract 等套件不存在，Android 原生檢查仍以 Gradle / Android Studio 為準；`npm run gpr` 推送版本 tag 後，GitHub Actions 會建置 AAB、建立 GitHub Release，並透過 Fastlane 發布到 Google Play 封閉測試 track；若遇到 Play Console / 其他流程同時修改造成 edit 衝突，Fastlane 會重開 edit 有限次重試；SMB-183 後 `npm run gpr` 在 bump 前會先執行 `notes:check` 確認 `release-notes.pending.md` 檔案存在，pending notes 為空時只提示但仍允許發版；patch 發版會在成功後封存既有 notes，空 notes 不會建立空白版本區塊，minor 發版則使用 `npm run gpr:minor` 清空暫存檔並 push；GitHub Actions 建立 GitHub Release 時也會把暫存檔內容加入 release body，Fastlane 同步填入 Google Play changelog）
- Android 桌面小工具共 5 種：月收支總覽（`StrawMoneyWidgetProvider`）、收支圓餅圖（`StrawMoneyPieChartWidgetProvider`）、收支長條圖（`StrawMoneyBarChartWidgetProvider`）、快速記帳（`StrawMoneyQuickAddWidgetProvider`）、AI 記帳（`StrawMoneyAiBookkeepingWidgetProvider`）；圖表類小工具點擊導向 `/analysis`，快速記帳導向 `/transactions/quick-add`，AI 記帳導向 `/ai-auto-bookkeeping`；資料由 JS 層 `home-widget.service.js` 透過 Capacitor HomeWidget plugin 同步當月收入/支出摘要至 SharedPreferences，Android 原生以 `HomeWidgetPlugin.java` 繪製圓餅圖與長條圖 Bitmap

## 2. 路由與頁面對應

路由定義檔：`src/ui/router/index.js`
以下表格列出主要路由與重要 redirect / 進階頁（非完整清單）。

| 路由 | 頁面檔案 | 主要用途 |
|---|---|---|
| `/open/shared-ledger` | redirect -> `/settings/shared-ledgers` | App URL 開啟共同帳本連結 |
| `/shared-ledger/join` | redirect -> `/settings/shared-ledgers` | 共同帳本加入連結兼容入口 |
| `/` | `src/ui/views/home.vue` | 首頁總覽、範圍篩選、快速新增 |
| `/budget` | `src/ui/views/budgeting.vue` | 曆月 / 發薪週期預算、共同預算池、分類預算與預算存款管理 |
| `/analysis` | `src/ui/views/analysis.vue` | 收支圖表分析（全部/年/月；圖示化圓餅／長條、大數字、預算達成卡、帳戶占比；跟隨 App Dark／Light；右上角一鍵直接匯出 PDF +「交易報表」入口進 `/analysis/print`） |
| `/analysis/category` | `src/ui/views/AnalysisCategoryDetailPage.vue` | 分類分析明細 |
| `/analysis/print` | `src/ui/views/AnalysisPrintPage.vue` | 交易報表匯出頁（期間客製化 all/year/month/day/custom、螢幕預覽、PDF／CSV、匯出成功後「開啟檔案」；BottomNav／返回分析） |
| `/transactions/search` | `src/ui/views/TransactionSearchPage.vue` | 交易搜尋（支援批量選取與批量編輯分類 / 備註 / 可報銷 / 預算 / 收支分析；SMB-155 後每頁 300 筆 SQL 分頁載入） |
| `/transactions/quick-add` | `src/ui/views/BookkeepingPage.vue` | 手動快速新增模式（內嵌 `QuickAddPage.vue`） |
| `/transactions/qna` | `src/ui/views/BookkeepingPage.vue` | 問答記帳模式（內嵌 `QnaBookkeepingPage.vue`） |
| `/transactions/calendar` | `src/ui/views/CalendarPage.vue` | 交易日曆 |
| `/transactions/:id` | `src/ui/views/TransactionAboutPage.vue` | 交易明細（含退款/關聯） |
| `/transactions/:id/edit` | `src/ui/views/TransactionEditPage.vue` | 交易編輯（SMB-217 後改用 AmountCalculatorInput 計算機輸入） |
| `/features` | `src/ui/views/FeatureListPage.vue` | 功能列表入口頁（一般功能 + 進階功能分區；smb295 後共同帳本／帳本同步／銀行同步／載具同步主入口在進階功能；smb299 加 Drive 選檔／舊版還原後列高變長，`feature-link` 以 `scroll-margin-bottom` 避開固定 BottomNav） |
| `/welcome/intro` | `src/ui/views/PostSetupIntroPage.vue` | 初始設定後導覽頁（含特色功能、帳號登入、共同帳本、帳本同步、會員邀請碼；SMB-188 / v1.2.4 後新增共同帳本與帳本同步兩個步驟；SMB-215 / v1.2.27 後共同帳本步驟另外提供「恢復備份」與「帳本同步」快速按鈕） |
| `/welcome` (隱含 route，由 `App.vue` shouldShowWelcomePage 控制) | `src/ui/views/WelcomePage.vue` | 初始 setup wizard 三步（語言 / 建立帳本 / 建立帳戶）；SMB-215 Restart / v1.3.1 後 step 2「建立帳本」在「已有共同帳本？登入並加入」secondary-link 旁新增「恢復備份 / 帳本同步」兩顆按鈕（僅 `!hasLedgers` 時顯示）。SMB-215 Restart / v1.3.2 後修正目的地：「恢復備份」→ `/settings/auto-backup`（自動備份頁，含 Google Drive / WebDAV 登入 + 立即還原；Tester 反饋「需要有自動備份的項目」）；「帳本同步」維持 `/settings/google-drive-ledger-sync`。`settings-auto-backup` + `settings-google-drive-ledger-sync` 兩 route 帶 `meta.allowWithoutSetup: true`，`settings-data-management` 的 v1.3.1 allowWithoutSetup 已還原 |
| `/ai-auto-bookkeeping` | `src/ui/views/BookkeepingPage.vue` | AI 記帳模式（內嵌 `AiAutoBookkeepingPage.vue`） |
| `/assets` | `src/ui/views/assets.vue` | 資產總覽 |
| `/assets/securities` | `src/ui/views/securities/SecuritiesListPage.vue` | 有價證券列表 |
| `/credit-cards` | `src/ui/views/credit-cards/CreditCardsPage.vue` | 信用卡 P0（smb301）：帳單／刷卡雙腿／還款 allocations；正式退款強制寫入當期 open posting（posted_at 箝制）；closed 批次硬拒絕；額度警示＝實際卡債 |
| `/assets/securities/:id` | `src/ui/views/securities/SecurityDetailPage.vue` | 有價證券明細／買賣 |
| `/icons/pick` | `src/ui/views/IconPickerPage.vue` | 帳戶/分類 icon 選擇 |
| `/assets/accounts` | `src/ui/views/accounts/AssetAccountManagementPage.vue` | 資產帳戶管理 |
| `/assets/account-groups/:id` | `src/ui/views/accounts/AssetAccountGroupDetailPage.vue` | 帳戶群組管理 |
| `/accounts/:id` | `src/ui/views/accounts/AccountDetailPage.vue` | 帳戶明細（交易紀錄每頁 300 筆，分頁後餘額仍依較新交易校正） |
| `/loans` | `src/ui/views/loans/LoanListPage.vue` | 借貸清單 |
| `/loans/counterparty` | `src/ui/views/loans/LoanCounterpartyDetailPage.vue` | 依往來對象檢視借貸明細 |
| `/loans/:id` | `src/ui/views/loans/LoanDetailPage.vue` | 借貸明細 |
| `/reimbursements` | `src/ui/views/reimbursements/ReimbursementListPage.vue` | 報銷清單 |
| `/reimbursements/advances` | `src/ui/views/reimbursements/ReimbursementAdvanceManagementPage.vue` | 代收 / 預支款管理；部分抵扣但仍有餘額的代收會保留顯示，刪除僅限未抵扣代收 |
| `/reimbursements/advance-usages` | `src/ui/views/reimbursements/ReimbursementAdvanceUsageManagementPage.vue` | 代收 / 預支抵扣紀錄 |
| `/reimbursements/:id/edit` | `src/ui/views/reimbursements/ReimbursementEditPage.vue` | 報銷明細編輯/入帳 |
| `/reimbursements/:id/offsets` | `src/ui/views/reimbursements/ReimbursementOffsetAboutPage.vue` | 報銷抵扣說明 / 明細 |
| `/claim-sheets` | `src/ui/views/claims/ClaimSheetListPage.vue` | 請款單清單與匯出 |
| `/claim-sheets/:id` | `src/ui/views/claims/ClaimSheetDetailPage.vue` | 請款單明細 |
| `/claim-sheets/:id/edit` | `src/ui/views/claims/ClaimSheetEditPage.vue` | 請款單編輯；SMB-259 後已導入報銷／借出項目可直接編輯本次請款金額 |
| `/claim-sheets/:id/import-reimbursements` | `src/ui/views/claims/ClaimSheetImportPage.vue` | 請款單導入報銷獨立選取頁（reimbursement-only），支援全選 / 取消全選；SMB-259 後已選項目可編輯本次請款金額；`:id` 為 `new` 時暫存新增表單選取；儲存時會保留另一個區塊的借入導入選取與手動項目 |
| `/claim-sheets/:id/import-borrow-loans` | `src/ui/views/claims/ClaimSheetImportBorrowLoanPage.vue` | 請款單導入借出獨立選取頁（borrow_loan-only），SMB-222 Restart / v1.2.44 拆出，SMB-222 Restart / v1.2.45 後僅列尚未完成的借出（`loans.direction='lend'` 且 `status NOT IN ('settled','void')`），SMB-247 / v1.3.25 後匯入金額改為剩餘未收回（`loan_remaining_minor = 本金 + 預設利息 − 已還`），SMB-259 後已選項目可編輯本次請款金額，SMB-222 Restart / v1.2.48 後候選列表與已導入 claim items 改用 `往來對象 · 借出備註` 等人類可讀名稱
| `/savings-jars` | `src/ui/views/savings-jars/SavingsJarListPage.vue` | 存錢罐管理 |
| `/subscriptions` | `src/ui/views/subscriptions/SubscriptionListPage.vue` | 訂閱追蹤 |
| `/settings` | `src/ui/views/settings.vue` | 設定首頁 |
| `/settings/account` | `src/ui/views/settings/SettingsAccountPage.vue` | 帳號登入 / 註冊、個人資料、推薦碼、忘記密碼、Google 綁定、登出 |
| `/settings/data-management` | `src/ui/views/settings/SettingsDataManagementPage.vue` | 匯入/匯出/重設 |
| `/settings/auto-backup` | `src/ui/views/settings/SettingsAutoBackupPage.vue` | Google / WebDAV 自動備份 |
| `/settings/google-drive-ledger-sync` | `src/ui/views/settings/SettingsGoogleDriveLedgerSyncPage.vue` | Google Drive 帳本同步 |
| `/settings/exchange-rate` | `src/ui/views/settings/SettingsExchangeRatePage.vue` | 匯率同步 |
| `/settings/bookkeeping-reminder` | `src/ui/views/settings/SettingsBookkeepingReminderPage.vue` | 每日記帳提醒與連續記帳成就表 |
| `/settings/bank-sync` | `src/ui/views/settings/SettingsBankSyncPage.vue` | 銀行同步管理 |
| `/settings/bank-sync/new` | `src/ui/views/settings/SettingsBankSyncCreatePage.vue` | 新增銀行連線 |
| `/settings/bank-sync/:id` | `src/ui/views/settings/SettingsBankSyncConnectionPage.vue` | 單一銀行連線設定 / 狀態 |
| `/settings/carrier-sync` | `src/ui/views/settings/SettingsCarrierSyncPage.vue` | 載具同步設定（v1.3.19：憑證改為財政部平台手機號碼 + 密碼；v1.3.30 / SMB-251：後端 scrape 改 SPA JSON 攔截 + captcha token API；v1.3.40 / SMB-258：Cloudflare challenge 等待 + 前端 network_failed i18n；SMB-265：前端 scrape API 附既有 auth session，captcha 關閉 / 卸載 / submit 失敗會 cancel 後端 session，舊手機條碼 / 查詢碼憑證提示重新輸入；後端強制 auth + membership、user/IP/session rate limit、併發限制與 TTL cleanup；SMB-278：可用性診斷流程 + captcha 刷新／到期、`GET /api/einvoice/health` 探測且明確不代表登入成功；SMB-280：health／scrape 一律帶 cookie-auth headers，避免 credentials:include + ACAO:* 誤報 `einvoice_network_failed`；smb294：重新驗證可用性 + Playwright seeded review） |
| `/settings/ledgers` | `src/ui/views/settings/SettingsLedgerPage.vue` | 帳本管理 |
| `/settings/shared-ledgers` | `src/ui/views/settings/SettingsSharedLedgerPage.vue` | 共同帳本、HTTPS 共享連結（複製／分享／產生新連結）、Email 邀請、接受邀請與同步；SMB-229 角色權限；SMB-277／SMB-279 後帳號／共同帳本頁顯示 Session 有效、Session 恢復中或「需重新登入」、同步狀態（上次同步／版本／錯誤／paused_*／重試），Viewer 自動同步文案改為只下載；分享連結強制 `https://www.strawmb.com/open/shared-ledger?...`；SMB-281 後 Owner「取消共享」／成員「不再共享」確認流程可點、失敗可見 toast，會員資格暫停時仍顯示本機綁定解除入口，busy 結束後 UI 正確；smb290 後同步狀態另顯示 `conflict_resolved`（含衝突數）與安全合併 toast，禁止 silent overwrite 本機未同步變更 |
| `/settings/ledgers/:id` | `src/ui/views/settings/SettingsLedgerDetailPage.vue` | 帳本明細編輯/刪除 |
| `/settings/categories` | `src/ui/views/settings/SettingsCategoryPage.vue` | 分類管理 |
| `/settings/categories/:id` | `src/ui/views/settings/SettingsCategoryDetailPage.vue` | 分類明細編輯/刪除；SMB-212 後新增「預設記帳設定」區塊，可設定「預設紀錄收支」、「預設紀錄預算」、「預設報銷」三個開關；快速新增交易時選取該分類會自動套用此預設值 |
| `/settings/category-groups/:id` | `src/ui/views/settings/SettingsCategoryGroupDetailPage.vue` | 分類群組排序/刪除 |
| `/settings/auto-fill-rules` | `src/ui/views/settings/SettingsAutoFillRulesPage.vue` | 自動識別規則 |
| `/settings/auto-fill-rules/new` | `src/ui/views/settings/SettingsAutoFillRuleEditPage.vue` | 建立自動識別規則 |
| `/settings/auto-fill-rules/:id` | `src/ui/views/settings/SettingsAutoFillRuleEditPage.vue` | 編輯自動識別規則 |
| `/settings/addon-templates` | `src/ui/views/settings/SettingsAddonTemplatePage.vue` | 附加項目模板 |
| `/settings/personalization` | `src/ui/views/settings/SettingsPersonalizationPage.vue` | 主題配色（smb289：已移除介面風格傳統／現代切換，App 僅現代 layout） |
| `/settings/language` | `src/ui/views/settings/SettingsLanguagePage.vue` | 語言設定 |
| `/settings/security` | `src/ui/views/settings/SettingsSecurityPage.vue` | 安全鎖 |
| `/settings/membership-benefits` | `src/ui/views/settings/SettingsMembershipBenefitsPage.vue` | 會員權益 |
| `/settings/admin` | `src/ui/views/settings/SettingsAdminPage.vue` | 管理員儀表板 |
| `/settings/admin/users/:id` | `src/ui/views/settings/SettingsAdminMemberPage.vue` | 管理員會員 / 使用者詳細頁 |
| `/settings/about` | `src/ui/views/settings/SettingsAboutPage.vue` | 關於我們、聯絡資訊與社群入口 |
| `/settings/version-info` | `src/ui/views/settings/SettingsVersionInfoPage.vue` | 版本資訊 |
| `/settings/developer-debug` | `src/ui/views/settings/SettingsDeveloperDebugPage.vue` | 開發除錯資訊頁 |

## 2.1 主要導覽流程

### 底部導覽（`src/ui/components/layout/BottomNav.vue`）

- 首頁：`/`
- 分析：`/analysis`
- 資產：`/assets`
- 功能：`/features`
- 設定：`/settings`
- SMB-250 / v1.3.29：現代介面風格僅調整 `apple-ui.css` 視覺（blur、active pill），**維持上述 5 tab**；首頁 FAB 不變；禁止重新引入 SMB-248 的 4 tab + `/more` 或移除 FAB

### 介面風格（`src/ui/services/ui-layout.service.js` + `src/ui/composables/useUiLayout.js`）

- **只保留現代 mode**（smb289）：App 唯一 UI layout 為 `modern`（Apple HIG）
- localStorage key：`strawmoneybook.ui.layout`；讀到 `traditional`／未知值會安全遷移並寫回 `modern`；預設且唯一為 `modern`
- 啟動時由 `app-runtime.service.js` → `initializeAppEnvironment()` 呼叫 `loadUiLayout()`，設定 `document.documentElement.dataset.uiLayout = 'modern'`
- 現代版樣式：`src/ui/assets/css/apple-ui.css`（Large Title、Inset Grouped List、Segmented Control、list row + chevron、0.5px separator）
- 設定／onboarding：**不再**提供「傳統／現代」切換；個人化頁僅主題配色（與 `theme.service.js` 獨立）
- 功能完整保留：5 tab BottomNav、首頁全部區塊、FAB；禁止藉移除傳統 mode 刪功能
- 測試：`test/ui-layout.service.test.js`、`test/ui-layout-source.test.js`、`npm run playwright:ui-layout`（smb298：port mutex＋獨立 CLI session＋`waitForHomeBlocks`，禁並行搶 preview／default session；smb299：證券列表以資產頁 SPA 入口 `assets-securities-entry`＋`securities-page` testid 驗收；進階功能入口點擊前 `scrollIntoView({block:'center'})` 並斷言列在 BottomNav 上方，避免列表加長後末列（載具同步）被底欄攔截）

### 首頁內導覽（`src/ui/views/home.vue`）

- 快速新增：導向「上次使用的記帳模式」；首次預設 `/transactions/quick-add`
- 功能列表：`/features`
- 交易搜尋：`/transactions/search`
- 分析頁：`/analysis`

### 設定內導覽（`src/ui/views/settings.vue`）

設定首頁入口標題、入口副標與帳號卡未登入提示皆透過 `src/ui/services/i18n.service.js` 的正式 key 維護；SMB-154 / 0.26.5 後登入 / 註冊頁與共同帳本頁使用到的 `t()` key 也會由 source test 檢查是否已註冊於 `MESSAGES`，英文與日文不再依賴繁中 fallback 或 runtime DOM 翻譯。

- 帳號卡片：`/settings/account`（顯示頭貼、名稱、帳號；未登入時導向登入 / 註冊）
- 帳本管理：`/settings/ledgers`
- 分類管理：`/settings/categories`
- 附加項目：`/settings/addon-templates`
- 自動識別：`/settings/auto-fill-rules`
- 匯率同步：`/settings/exchange-rate`
- 資料管理：`/settings/data-management`（smb297：還原指引＋本機 IndexedDB recovery **列出／下載／還原**＋帳本完整性掃描／明確修復（需倒數確認，禁啟動／同步靜默改寫）＋JSON 匯入／重設皆需確認倒數＋**recovery 備份必須成功**（僅 `indexeddb`／`filesystem`／`test`；**memory／download-only 不算**；失敗→`RECOVERY_BACKUP_REQUIRED` 中止，禁 swallow 後 wipe）＋wipe audit；匯入預設不自動 repair；禁止 bootstrap／FK silent wipe；**smb298**：Welcome 空庫可 `allowWithoutSetup` 進入本機 recovery；空庫＋有 recovery 時顯示還原提示，避免只建新帳本）
- 自動備份：`/settings/auto-backup`（smb297：Google／WebDAV「立即還原」需確認倒數＋**durable recovery 備份必須成功後才**清空本機；**memory／download-only 不算成功**；備份失敗中止、不呼叫 `resetDatabase`；還原後 integrity repair 僅在此明示確認路徑以 `USER_RESTORE_BACKUP` 執行；**smb299**：Drive appDataFolder **列出全部檔**（all_ledgers／sync_*／其他）＋預覽摘要（帳本／月份分佈／有效筆數）＋選檔／展開 **revision** 還原；**預覽必須成功且通過正式 importer 結構＋資料列 INSERT／CHECK enum 閘門（`assertBackupJsonStructureImportable`＝ledger 身分＋已知欄位／必要欄位／CHECK enum，非僅摘要）才開確認**；還原前顯示較舊／較新與月份覆蓋警告；正式路徑 `runConfirmedDriveAppDataRestore`＝摘要＋結構／列可匯入預覽→再下載驗證（同源閘門）→durable recovery（含 `exportAllLedgersJson`）→wipe→import，**wipe 後 import 失敗則先再 wipe 清部分殘留再以 durable recovery 回滾至 wipe 前原狀**（失敗不清空；sql.js 實庫回歸驗證最終列＝wipe 前）；入口亦在資料管理還原指引與功能頁進階）
- Google Drive 帳本同步：`/settings/google-drive-ledger-sync`（smb297：本機有交易且遠端快照為空時阻擋 hard replace，狀態 `empty_remote_blocked`；sync replace **不**自動 `repairLedgerData`；FK preserve 合成缺失父列並保留子表筆數，禁止丟交易／關聯子列）
- 語言：`/settings/language`
- 個人化：`/settings/personalization`
- 安全鎖：`/settings/security`
- 記帳提醒：`/settings/bookkeeping-reminder`
- 會員權益：`/settings/membership-benefits`
- 管理員平台：`/settings/admin`（僅管理員顯示）
- 關於我們：`/settings/about`
- 關於我們頁內含官網、Facebook、Instagram、Threads、Email、隱私權政策入口
- 版本資訊：`/settings/version-info`
- 開發除錯：`/settings/developer-debug`（目前不在設定入口清單）
- smb295：共同帳本／帳本同步／銀行同步／載具同步**不再**列於設定頁主清單；深度連結與既有 route 仍可開到同一功能頁（見下方「功能列表導覽」進階功能）

### 功能列表導覽（`src/ui/views/FeatureListPage.vue`）

#### 一般功能
- 預算項目：`/budget`
- 借貸：`/loans`
- 報銷：`/reimbursements`
- 請款單：`/claim-sheets`
- 存錢罐：`/savings-jars`
- 有價證券：`/assets/securities`
- 信用卡：`/credit-cards`
- 訂閱：`/subscriptions`
- 交易搜尋：`/transactions/search`

#### 進階功能（`feature_list.advanced`）
- 共同帳本：`/settings/shared-ledgers`
- 帳本同步：`/settings/google-drive-ledger-sync`
- Drive 備份選檔／舊版還原：`/settings/auto-backup#drive-appdata-browser`（smb299）
- 銀行同步：`/settings/bank-sync`（入口由 `isBankSyncFeatureEnabled()`＝feature flag 控制可視性；原生自動化由 `isBankSyncNativeAutomationAvailable()` 另閘；Web／非 Android 顯示支援矩陣與 recovery CTA，不再因 provider 空列表靜默 redirect；需 `VITE_BANK_SYNC_FEATURE_ENABLED=true`；Android 第一銀行本地同步；v1.3.19 第一銀行 OCR 失敗時建立連線頁可手動輸入驗證碼重試；v1.3.20 SMB-241 強制桌面 viewport 與驗證碼直連下載；v1.3.31 / SMB-253 第一銀行登入頁錨點合約自檢納入排程監控；v1.3.32 / SMB-252 WebView JSON 攔截 + CSV 帳單匯入退路；v1.3.34 / SMB-252 Restart：桌面登入頁探測 `ready` 只依功能錨點，`mobileHint` 改為依 viewport 版面結構的非攔阻診斷，修復電腦版頁含「Mobile Bank」字樣被誤判為手機版的回歸；v1.3.36 / SMB-252 Restart：登入送出治本——直接寫入 `doLogin()` 真正讀取的隱藏欄位 `#loginCustId` 等（`setFieldByName`，不再只填 `*Fake`）、送出 `clickArea()`→備援 `doLogin()`、攔截 `window.alert()` 並把銀行真實回應寫入 debug trace（`captureLoginResponseDiagnostics` / `summarizeLoginFailure`），`waitForLoginSuccess` 提早歸因不空等；SMB-266 後登入後帳戶入口優先用 URL/function/ID/table structural anchors（`openIt`、`overview-account`、`tab1`、`table.CnbTable`、010103 連結），中文/英文文案只作備援；交易攔截只 replay GET，POST 候選請求安全放行改走原 WebView + DOM fallback；debug trace 與前端 shared classifier 可區分 `portal_changed` / `retry` / `reconnect`；SMB-278：可用性階段診斷 + 支援矩陣；SMB-280：`bank_sync_credentials_missing` 僅 Android 原生路徑且無連線時出現，vault `commit()` + `provider_connection_id` 對齊避免建完仍誤報無憑證；smb294：vault lookup 改傳 distinct local/provider 候選 + Playwright 錯誤碼／seeded review 驗收）
- 載具同步：`/settings/carrier-sync`（會員限定；標籤語意為載具同步／電子發票載具；v1.3.19 憑證為財政部平台手機號碼 + 密碼；v1.3.30 後端 Playwright 改 SPA JSON 攔截 + captcha token；v1.3.31 / SMB-253 合約自檢接 cron/CI，失敗分類統計 + log/Plane 告警；v1.3.40 / SMB-258 Cloudflare 挑戰等待 + scrape-api 網路錯誤 i18n；SMB-278：可用性診斷、`/api/einvoice/health`、captcha 刷新／到期；SMB-280：health credentialed CORS 治本，消除誤報 `einvoice_network_failed`；smb294：可用性重驗 + Playwright seeded review）

### 資產與分類導覽

- 資產頁管理入口：`/assets` -> `/assets/accounts`
- 有價證券：`/assets` -> `/assets/securities` -> `/assets/securities/:id`
- 帳戶群組明細：`/assets/accounts` -> `/assets/account-groups/:id`
- 帳戶明細：`/assets` 或 `/assets/accounts` -> `/accounts/:id`
- 分類/帳戶 icon 選擇：`/settings/categories` 或 `/assets/accounts` -> `/icons/pick`；Font Awesome 可選圖示與全域頁面圖示註冊清單統一集中在 `src/main.js` 的 `icons` 陣列，避免實際使用、匯入與註冊項目漂移

## 3. 首頁功能對應

頁面檔案：`src/ui/views/home.vue`

| 功能 | 主要檔案 |
|---|---|
| 帳本切換 | `src/ui/components/common/LedgerSwitcher.vue` |
| 範圍選擇（全部/年/月/日） | `src/ui/components/common/HomeRangePicker.vue` |
| 當期收支卡 | `src/ui/components/home/HomeAssetSummaryCard.vue`（收入／支出 split 背景與數字色跟隨 `theme.service.js` 的 `--home-*-card-*` Light／Dark token；禁止硬編碼深色底導致淺色模式對比失效；傳統／現代共用） |
| 預算簡表（月均/日均 + 左右滑動切換） | `src/ui/components/home/HomeBudgetSummaryCard.vue` |
| 交易清單（含空狀態與快速記帳 CTA） | `src/ui/components/home/HomeTransactionFeed.vue` |
| 編輯交易 | `src/ui/components/home/HomeTransactionEditSheet.vue`（SMB-217 後改用 AmountCalculatorInput 計算機輸入） |
| 快速新增入口 | `src/ui/views/BookkeepingPage.vue` + `src/ui/services/bookkeeping-mode.service.js` |
| 手動快速新增 | `src/ui/views/QuickAddPage.vue`（SMB-162 後附加項目抵消後可存 0 元交易；SMB-175 後金額欄整合計算機） |
| 問答記帳 | `src/ui/views/QnaBookkeepingPage.vue` |
| AI 記帳 | `src/ui/views/AiAutoBookkeepingPage.vue` + `src/core/services/ai-bookkeeping.service.js`（SMB-163 後解析帳本附加項目模板；SMB-162 後附加項目抵消後可存 0 元交易；smb291 後四則運算／單位算式與保留詞不入備註） |
| 快速新增附加資訊（備註/報銷/附加項目） | `src/ui/views/QuickAddPage.vue` |
| 日期時間選擇 | `src/ui/components/common/DateTimePickerField.vue` |
| 純時間選擇 | `src/ui/components/common/TimePickerField.vue` |
| 共用輸入型 sheet 殼層 | `src/ui/components/common/InputBottomSheet.vue` |
| 金額計算機輸入欄 | `src/ui/components/common/AmountCalculatorInput.vue`（SMB-175；邏輯層：`src/ui/utils/amount-calculator.js` → 共用 `src/core/utils/amount-expression.js`，與 AI 記帳算式對齊） |
| 交易搜尋頁（支援批量編輯分類、備註、可報銷、是否納入預算 / 收支分析） | `src/ui/views/TransactionSearchPage.vue` |
| 交易日曆頁 | `src/ui/views/CalendarPage.vue` |
| 功能列表頁 | `src/ui/views/FeatureListPage.vue` |
| 交易明細退款流程（選擇退款帳戶、指定扣除金額、避免重複退款；彙總使用退款扣除後淨額） | `src/ui/views/TransactionAboutPage.vue` + `src/core/services/transaction.service.js` + `src/ui/utils/refund-transaction.js` |
| 交易搜尋頁狀態協調（filter、批量選取、sheet、摘要） | `src/ui/composables/useTransactionSearchPage.js` |

## 4. 分析頁功能對應

頁面檔案：`src/ui/views/analysis.vue`

| 功能 | 主要邏輯來源 |
|---|---|
| mode 切換（全部/年/月） | `analysis.vue` 內部 state + `src/core/services/transaction-query.service.js` |
| 收入圓餅圖 | `analysis.vue` + `src/core/utils/analysis-breakdown.js`（分類彙總 + 色盤） |
| 支出圓餅圖 | `analysis.vue` + `src/core/utils/analysis-breakdown.js`（分類彙總 + 色盤；正向附加項目會以「附加項目」分析列納入） |
| 帳戶分析（總額/收入/支出） | `analysis.vue` + `src/core/utils/analysis-breakdown.js`（帳戶彙總 + 色盤） |
| 分類明細頁 | `analysis.vue` -> `/analysis/category` + `AnalysisCategoryDetailPage.vue` + `src/core/services/transaction-query.service.js`；支援附加項目分析列明細 |
| 右上角匯出按鈕 | `analysis.vue` 一鍵直接匯出 PDF（offscreen `AnalysisReportDocument` + html2canvas/jsPDF；快捷主路徑） |
| 交易報表頁入口 | `analysis.vue` → `/analysis/print`（`data-testid=analysis-print-link`／`analysis_page.open_report`） |
| AI 分析頁 | 已移除（不再提供 `/analysis/ai` 路由） |
| 交易 CSV 匯出 | `src/ui/views/AnalysisPrintPage.vue` + `src/core/services/export.service.js` |
| 列印 / PDF 版面 | `src/ui/views/AnalysisPrintPage.vue`（預覽 + `AnalysisReportDocument`） |
| 匯出範圍客製化 | `AnalysisPrintPage.vue`（全部/年/月/日/自訂；預覽與匯出對應所選範圍） |
| 開啟檔案 | `AnalysisPrintPage.vue` + `export.service.js` `openFileUrl`（匯出成功後 `analysis_print.open_link`；失敗不顯示） |

## 5. 導覽與全域 UI

| 功能 | 檔案 |
|---|---|
| App Shell / Router View | `src/ui/App.vue` + `src/ui/composables/useAppShellRuntime.js` |
| 頁面返回標題列 | `src/ui/assets/css/global.css`（所有含 `.back-btn` 的頁首統一為左側 chevron 返回、置中標題、右側操作區；手機寬度會把右側操作移到下一行，避免標題重疊，視覺對齊電子發票精靈頁） |
| 記帳頁模式切換 | `src/ui/views/BookkeepingPage.vue`（AI / 手動模式切換移到置中標題列下方，避免與全域返回標題列重疊） |
| Welcome / allowWithoutSetup 入口控制 | `src/ui/App.vue` + `src/ui/views/WelcomePage.vue` |
| 首次設定完成導覽 | `src/ui/views/PostSetupIntroPage.vue` + `src/ui/services/post-setup-intro.service.js`（SMB-188 / v1.2.4 後含共同帳本與帳本同步步驟） |
| 初始 setup 判斷 | `src/ui/services/setup-flow.service.js` |
| 啟動鏈（Pinia/store 初始化、core bootstrap、首次 setup 導向） | `src/main.js` + `src/ui/services/app-bootstrap.service.js` + `src/core/services/bootstrap.service.js` |
| 啟動時背景 Google 靜默登入、同步/備份排程、Android back、網址恢復 | `src/ui/services/app-runtime.service.js` + `src/services/google/auth.js` |
| 安全鎖遮罩與前景驗證 | `src/ui/composables/useAppShellRuntime.js` + `src/ui/services/security-lock.service.js` |
| Deep link / App URL 導向 | `src/ui/services/app-url-route.js` |
| 路由捲動復原 | `src/ui/services/route-scroll.service.js`（含首頁捲動記憶、刪除交易後 forced restore／clamp；smb292） |
| 底部導覽列 | `src/ui/components/layout/BottomNav.vue` |
| App 內返回與 fallback 邏輯 | `src/ui/services/navigation-back.service.js` |
| 同頁 query 狀態切換的穩定 route transition key（如借貸清單 / 往來對象明細切換進行中與已結束時不重跑整頁切換動畫） | `src/ui/router/index.js` + `src/ui/composables/useAppShellRuntime.js` |
| Toast 訊息 | `src/ui/components/common/ToastHost.vue` |
| 輸入型彈層一致性（dialog / select / 帳本切換 / 區間切換 / 日期與時間選擇器共用 shared bottom-sheet primitives，含 Android 底部 safe area，sheet 背景延伸到底部並對齊 `BottomNav` 基準） | `src/ui/components/common/InputBottomSheet.vue` + `src/ui/components/common/AppDialog.vue` + `src/ui/components/common/CustomSelect.vue` + `src/ui/components/common/LedgerSwitcher.vue` + `src/ui/components/common/HomeRangePicker.vue` + `src/ui/components/common/DateTimePickerField.vue` + `src/ui/components/common/TimePickerField.vue` |
| 全域錯誤上報 | `src/ui/services/error-log.service.js` |
| 全域樣式與動畫 | `src/ui/assets/css/global.css`（共享 radius / typography token 由 source test 鎖定，避免卡片、按鈕與文字尺寸漂移） |
| 通用空狀態元件 | `src/ui/components/common/EmptyState.vue`（props: `icon`, `title`, `description`, `compact`） |
| 入口、plugin 註冊與 runtime 掛載 | `src/main.js` |

## 6. Store（UI 狀態層）對應

目錄：`src/ui/stores/`

| Store | 主要職責 |
|---|---|
| `ledger.store.js` | 活動帳本、帳本切換、帳本 CRUD、帳本預算期間模式與發薪日設定（SMB-276 後 `updateBudgetPeriodSettings` 改走 `applyLedgerBudgetPeriodSettings`，改發薪日或切換曆月／發薪週期時自動 carry-forward 目前期預算結構）；跨 store reset / reload / integrity repair 已轉移到 `src/ui/services/ledger-runtime.service.js` |
| `account.store.js` | 帳戶清單、餘額與群組統計；群組統計會讀取匯率 snapshot 並依帳戶 `include_in_group_statistics` 加總 |
| `category.store.js` | 分類清單、群組、二級分類資料 |
| `transaction.store.js` | 交易載入、新增、更新、刪除、首頁篩選與關聯刷新 |
| `budget.store.js` | 曆月 / 發薪週期預算、共同預算池、預算項目、2B 期間總額、3C 超支 getter、保留金額、整期預算存款設定與補跑偏好；新建共同預算池或一般分類預算項目帶 `applyThroughMonth` 時路由至曆月 range save，編輯仍只儲存目前期間；預算項目 / 共同池 sheet 的帳本期間切換由 `budgeting.vue` 呼叫 ledger store 後重新載入目前期間；SMB-272 後 `loadMonth()` 會正規解析 persisted `pay:YYYY-MM-DD` key，避免啟動 / reload 時把發薪週期 key 錯當曆月；SMB-273 後 app runtime 會在 resume / focus / visibility visible 時呼叫 `loadCurrentPeriod()`，避免背景跨過發薪日後保留 stale period；SMB-275 後 `loadCurrentPeriod()` 改走 `resolveCurrentBudgetPeriodForLedger()`，以帳本時區今天解析，不再依裝置 timezone 或 persisted key |
| `loan.store.js` | 借貸清單、還款、作廢、明細 |
| `reimbursement.store.js` | 報銷列表與報銷狀態處理；已完成請款單匯入項目會透過 `reimbursed_minor` 分入已報銷；SMB-237 後 `setClaimAmount` action 可設定 / 重設報銷項目的自訂報銷金額（`reimburse_target_minor`） |
| `addon-template.store.js` | 附加項目模板讀取與快取 |
| `ui.store.js` | 全域 UI 狀態（Toast 等） |

## 7. Service（業務邏輯層）對應

核心目錄：`src/core/services/`

| Service | 功能 |
|---|---|
| `bootstrap.service.js` | 啟動時資料庫初始化（smb297：禁止 silent reset／rebuild；schema／FK 失敗改 typed `LOCAL_DB_INTEGRITY` 並提示還原路徑）；不再直接碰 UI stores；**smb298**：Android plugin-null **禁止**切空 recovery DB，改重試 primary |
| `empty-ledger-restore-hint.service.js` | smb298：空庫＋IndexedDB recovery 偵測／事件；Welcome／toast 導向資料管理還原 |
| `transaction.service.js` | 收入/支出/轉帳/退款建立、退款帳戶驗證、編輯驗證、刪除關聯交易（報銷/退款） |
| `transaction-query.service.js` | 統一 `all / year / month / day / account / detail-related` 交易查詢策略，供分析、搜尋、日曆、交易明細、交易編輯與帳戶明細共用 |
| `budget.service.js` | 預算期間解析、預算快照、預算存款設定驗證、共同預算池與一般分類預算項目單期 / 曆月跨月建立、複製上月預算；SMB-272 後可解析 `pay:YYYY-MM-DD` / `pay:YYYY-MM-DD:YYYY-MM-DD` persisted key，且月份 UTC range helper 不會讓非法 key 進入 `toISOString()`；SMB-273 regression 鎖定發薪日前一天仍為舊期、發薪日當天 00:00 起為新期，涵蓋跨月、跨年與 29/30/31 短月；SMB-275 後新增 `dateKeyForLedgerTimeZone` / `monthKeyForLedgerTimeZone` / `resolveCurrentBudgetPeriodForLedger()`，曆月模式遇到 stale `pay:*` key 會回退帳本時區目前曆月；SMB-276 後新增 `applyLedgerBudgetPeriodSettings` / `isBudgetPeriodStructureEmpty`，改發薪日或切換曆月／發薪週期時若新目前期間尚無使用者設定內容會 carry-forward 舊期預算結構 |
| `budget-reserve.service.js` | 依帳本預算期間 / 時區 / 日均規則即時計算保留金額 |
| `budget-save.service.js` | 預算剩餘額自動結算、補跑、delta/manual 補差；曆月與發薪週期皆以期間結束後一次性結算 |
| `loan.service.js` | 借貸建立、還款、作廢；單筆新增 / 編輯還款會阻擋超過借貸剩餘金額 |
| `reimbursement.service.js` | 報銷流程、報銷入帳、請款單完成 / 還原後的匯入報銷狀態同步、隱藏分類處理；SMB-237 後 `setReimbursableExpenseClaimAmount` 設定 / 重設可報銷交易的 `reimburse_target_minor`（自訂報銷金額）；SMB-255 後在設定報銷金額、報銷入帳 / 取消入帳與載入草稿 detail 時觸發草稿請款單 import item 同步 |
| `claim-sheet-draft-sync.service.js` | SMB-255 草稿請款單導入報銷項目自動同步：`reconcileDraftClaimSheetImportItems` 依最新交易 pending 更新或移除 draft claim items 並重算總額 |
| `savings-jar.service.js` | 存錢罐存提與目標管理 |
| `src/ui/services/bookkeeping-reminder.service.js` | 記帳提醒設定、通知排程（含 `repeats: true` 確保每日重複觸發）、連續記帳成就統計、原生通知同步逾時保護、全帳本同步去重、同步序列化避免實機儲存卡死、Android Local Notifications plugin proxy 相容性處理、exact alarm 檢查與系統設定導引 |
| `savings-jar-auto-save.service.js` | 存錢罐自動存入 / 定期儲蓄流程；到期日判斷與入帳時間使用帳本時區 |
| `subscription-tracker.service.js` | 訂閱追蹤與期別處理；扣款日一開始即視為本期到期並推進下一期，日期 helper 以純日期與 App 預設時區處理避免環境時區漂移 |
| `subscription-charge.service.js` | 訂閱今日到期扣款 runner；在 App 啟動 / 回前景 / 帳本切換與訂閱儲存後，以帳本時區判斷今日到期，並用 `subscription:<id>:<dueDate>` 冪等鍵建立支出交易，避免重複扣款或補扣非今日項目 |
| `ai-bookkeeping.service.js` | AI 記帳語意解析與建議 |
| `ai-bookkeeping-tiny-ner.service.js` | AI 記帳輕量關鍵詞/實體抽取 |
| `ai-bookkeeping-category-match.js` / `ai-bookkeeping-account-match.js` | AI 記帳分類 / 帳戶比對輔助 |
| `membership.service.js` | 會員等級、限制、Google Play 狀態同步、snapshot 與邀請碼會員加成判定；不再直接處理 router 導頁 |
| `google-play-billing.service.js` | Google Play 方案查詢、購買、恢復、兌換 |
| `import.service.js` | 匯入 |
| `export.service.js` | 匯出（CSV / Spreadsheet XML / 檔案落地 / 報表資料） |
| `repair.service.js` | 資料一致性檢查與修復 |
| `seed.service.js` | 種子資料 |

核心工具目錄：`src/core/utils/`

| Utility | 功能 |
|---|---|
| `analysis-breakdown.js` | 分析頁分類/帳戶彙總、圓餅圖/長條圖資料與日別 breakdown 計算 |

UI 服務目錄：`src/ui/services/`

| Service | 功能 |
|---|---|
| `app-bootstrap.service.js` | UI 啟動鏈協調：建立 Pinia store、接 core bootstrap 結果、處理 setup 前後 app boot 流程；**smb298**：無 active ledger 時偵測空庫＋recovery 並 emit 還原提示 |
| `app-runtime.service.js` | App runtime side effects：背景排程、同步/備份啟動、Android back、網址恢復、前景事件協調；啟動 / 回前景 / 帳本切換時補跑存錢罐自動存入、訂閱今日扣款與預算存款 |
| `ledger-runtime.service.js` | 帳本切換後的 cross-store reset / reload／完整性掃描與帳本生命周期協調；smb287 後 critical path 先載帳戶／分類／目前預算，掃描與借貸／報銷／附加範本／recent 改背景延遲 hydrate；**smb297：scan-only，禁止啟動靜默 `repairLedgerData` 改寫語意**，異常改 toast＋資料管理明確修復 |
| `google-drive-ledger-sync.service.js` / `shared-ledger.service.js` | smb297：`replaceLocalLedgerWith*` 一律 `runIntegrityRepair: false`；僅 FK preserve／INSERT，不在背景 sync 偽確認語意修復 |
| `membership-navigation.service.js` | 會員限制導頁與 membership benefits navigation，將 router side effect 留在 UI 層 |
| `shared-ledger.service.js` | 共同帳本前端流程：建立、下載、上傳、自動同步、本機帳本綁定；SMB-229 / v1.3.9 後依角色（`sharedLedgerRoleCanPush`）跳過 Viewer 上傳、被降級時清 dirty 佇列，並提供成員角色更新與所有權轉移服務封裝；SMB-277 後 meta 記錄 `last_sync_status` / `last_sync_error`，失敗可見並可重試；SMB-279／smb288 後背景同步先 `ensureSharedLedgerSessionReady`，需重新登入／會員／離線／session 恢復中寫入可見 `paused_*`（含 schedule 路徑），禁止 silently no-op；SMB-281 後 `stopSharingLocalLedger`／`stopSharingRemoteSharedLedger` 在取消共享／離開前檢查 session／needs-reauth，遠端已不存在時仍清本機 binding |
| `google-backup.service.js` | Google Drive AppData 備份連線、自動備份、還原、重新授權後自動清理 stale auto-check diagnostics；Google 授權失效時自動偵測並寫入 `error/reauth_required` 狀態使 UI 顯示重新授權警示；`resolveGoogleProfileForConnect` 在 silent token 失敗時必定觸發 `googleSignIn` 取得新 token（SMB-186 / v1.2.7）；**smb299** 另提供 `listGoogleAppDataFiles`／`listGoogleAppDataFileRevisions`／`previewGoogleAppDataBackup`／`restoreGoogleBackupJsonByTarget`（含月份摘要比較、匯入前 `assertBackupJsonImportable`、與 `__SMB_DRIVE_APPDATA_MOCK__` 測試鉤子）；自動備份頁 Google／WebDAV「立即還原」與資料管理 JSON／本機 recovery 亦在 wipe 前呼叫同源閘門 |
| `drive-appdata-restore.service.js` | **smb299** 選檔／revision 還原閘門：`assertDriveRestorePreviewReady`／`assertBackupJsonImportable`（摘要 **＋** `assertBackupJsonStructureImportable`＝ledger 身分＋資料列 INSERT／CHECK enum 合約）／`runConfirmedWipeThenImportWithRecoveryRollback`／`runConfirmedDriveAppDataRestore`（預覽→下載驗證→durable recovery→wipe→import；**import 失敗則先再 wipe 清部分殘留再 recovery 回滾至 wipe 前原狀**）；Node 回歸含「摘要＋ledger_id 通過但 `bogus_column`／缺必要欄位／`type=not_a_valid_type`」不得 wipe；wipe 後 import 失敗以狀態機＋**sql.js 實庫**證明最終 ledger／交易＝wipe 前快照（非原本地＋殘缺雲端） |
| `backup-json-import-gate.service.js` | **smb299** 正式可匯入閘門：`resolveSourceLedger`／`assertLedgerPayloadImportable`／`assertBackupJsonStructureImportable`（all_ledgers 非空＋每本 normalize 後 ledger 身分 **＋** `assertImportTableRowsInsertable`）；供 restore wipe 路徑與 importer 共用，禁止只靠摘要或只靠 ledger_id |
| `backup-json-import-schema.js` | **smb299** 與正式 importer 同源的表欄位／必要欄位／CHECK enum／`objectToInsertSql` 合約；未知欄位（如 `bogus_column`）、缺少 NOT NULL 必要欄位、或 `transactions.type=not_a_valid_type` 等不合約束值在 wipe 前拒絕 |
| `webdav-backup.service.js` | WebDAV 備份連線、自動備份、還原 |
| `auto-backup-orchestrator.service.js` | 自動備份 provider runner；統一手動備份、due check、資料變更備份的 provider lock、preflight 與 `completed / skipped / error` 結果格式，避免同帳本同 provider 同時執行造成狀態覆蓋 |
| `app-runtime.service.js` + `SettingsAutoBackupPage.vue` | 背景自動備份 / 自動偵測完成後會送出含 `ledgerId / provider / mode / status / reason / checkedAt` 的 `app:auto-backup-state-updated`，讓設定頁即時重讀 Google / WebDAV provider 狀態；設定頁立即備份會透過 provider runner 先確認設定保存成功才執行，重讀時會保留尚未儲存的 WebDAV 密碼輸入，避免背景 refresh 把使用者輸入清空；手機 App 啟動與帳本切換的 Google 備份恢復只允許靜默授權，避免背景流程彈出互動登入；Google native OAuth exchange / refresh 預設使用 API 主機並由 backend `/api/google/oauth/*` 處理，不依賴官網靜態 host |
| `google-drive-ledger-sync.service.js` | Google Drive 帳本同步（逐帳本 enable / sync now；SMB-235 / v1.3.7 後偵測 Google 帳號切換、記錄 pending 狀態與 account switch log，並透過 `GOOGLE_LEDGER_SYNC_ACCOUNT_SWITCH_EVENT` 通知 UI） |
| `addon-template.service.js` | 附加項目模板預設值與保存 |
| `bank-sync.service.js` | 銀行同步前端流程（憑證加密封裝、同步/匯入） |
| `bank-sync-auto-refresh.service.js` | 銀行同步自動刷新節流與前景更新 |
| `bank-sync-debug.service.js` | 銀行同步 debug trace 與錯誤資訊 |
| `einvoice-debug.service.js` | 載具（電子發票）抓取與匯入 debug trace 記錄 |
| `ai-loan-intent.service.js` | AI 借貸語意到借貸交易動作的轉換 |
| `auto-fill-rule.service.js` | 自動識別規則 CRUD |
| `exchange-rate.service.js` | 匯率同步資料流程 |
| `home-widget.service.js` | Android 首頁小工具摘要同步 |
| `home-widget-summary.js` | 首頁小工具圖表摘要資料建構 |
| `navigation-back.service.js` | App 內返回可達性與 fallback 判定 |
| `secure-setting.service.js` | 敏感設定值加密儲存（AES-GCM） |
| `security-lock.service.js` | 生物辨識/系統憑證安全鎖整合 |
| `theme.service.js` | 主題色、配色方案與字體縮放套用 |
| `ui-layout.service.js` | 介面風格 modern-only；legacy traditional 遷移與 `dataset.uiLayout` 套用 |
| `app-update.service.js` | App 版本檢查與商店連結；Android AAB 發版版本碼由 `android/app/build.gradle` 依最終 `versionName` 自動推導（`1,000,000 + major * 1,000,000 + minor * 1,000 + patch`，保留 Play 歷史版本碼升級空間），仍可由 `CI_VERSION_CODE` 覆蓋；Play 發版流程若存在 `mapping.txt` 也會一併上傳去模糊化檔；Fastlane `closed_testing` lane 預設發布到 Google Play `alpha` 封閉測試 track，可用 GitHub Actions 變數 `PLAY_CLOSED_TESTING_TRACK` 指定其他封閉測試 track，並會針對 Google Play edit 被外部變更的暫時性衝突重開 edit 重試；**smb298**：`gpr`／`gpr:minor` 強制 `sync:official-site-app-update:push` 同步 StrawMoneyBookWeb `public/app-update.json`＋`api/app-update/play`（Pages→Web-Page／www.strawmb.com），禁止官方站卡舊版 |
| `i18n.service.js` | 多語系文案管理 |
| `setup-flow.service.js` | 是否顯示 Welcome / setup 流程判定 |
| `post-setup-intro.service.js` | 設定完成後導覽旗標管理 |
| `error-log.service.js` | 前端錯誤去重、上報與全域安裝 |
| `app-url-route.js` | App URL / invite code 解析與導向 |
| `route-scroll.service.js` | Router scroll restore 延後執行 |

UI composable 目錄：`src/ui/composables/`

| Composable | 功能 |
|---|---|
| `useTransactionSearchPage.js` | 交易搜尋頁 filter、批量選取、批量編輯 sheet、摘要與搜尋結果協調 |
| `useAppShellRuntime.js` | App shell boot 狀態、route transition key、視窗高度鎖定、安全鎖 lifecycle、更新提示協調 |
| `useUiLayout.js` | 介面風格 reactive 狀態（modern-only）與 storage 同步 |
| `useHomePeriodFilter.js` | 首頁四段期間篩選、日期 picker 與交易 / 預算同步 |

共享帳本 API 服務目錄：`src/services/shared-ledger/`

| Service | 功能 |
|---|---|
| `backend.js` | 共同帳本 Node backend API client、登入 session、帳號資料更新、Email 邀請、邀請碼兌換、管理員 API、client log 上報 |

## 8. Backend（Node.js 共同帳本 / 帳號）對應

目錄：`../backend/src/`

| 檔案 | 功能 |
|---|---|
| `server.js` | Node.js HTTP server 入口；透過 `routes/route-table.js` 做 prefix dispatcher，掛載 auth / admin / client-logs / shared-ledgers / referrals API，含 rate limit 與 body size 保護 |
| `routes/route-table.js` | API route table 與 pathname -> handler dispatch |
| `routes/auth.js` | auth 路由入口 re-export；實作已拆到 `routes/auth/` 模組目錄 |
| `routes/auth/` | Email / Google 登入、註冊、登出、refresh、`/me`、個人資料更新、忘記密碼 / 臨時密碼 / 重設密碼、Google Play 會員同步 action handlers 與共享 helper |
| `routes/admin.js` | 管理員總覽、會員狀態調整、錯誤 log 審核、使用者刪除 |
| `routes/client-logs.js` | 前端錯誤事件上報 |
| `routes/shared-ledgers.js` | shared-ledgers 路由入口 re-export；實作已拆到 `routes/shared-ledgers/` 模組目錄 |
| `routes/shared-ledgers/` | 共同帳本建立、查詢、快照上傳下載、Email 邀請、接受邀請、試用與同步 action handlers；SMB-229 / v1.3.9 後依角色權限矩陣（`collab/store-shared-ledgers.js`）檢查每個 endpoint（Viewer 禁 push、Member/Viewer 禁 invite），並新增改角色 `POST /:id/members/:userId/role` 與轉移所有權 `POST /:id/transfer`；SMB-277 新增 `POST /:id/invite-code/rotate`（Owner/Admin 產生新 HTTPS 共享連結）與邀請 URL HTTPS 強制；SMB-281 後 `DELETE /:id` 放行會員閘門（Owner 刪除／成員離開／already_gone），讓會員資格過期後仍可取消共享 |
| `routes/referrals.js` | 邀請碼資訊、邀請碼兌換、會員獎勵發放 |
| `collab/store.js` | 本機 SQLite store、使用者資料、共同帳本、邀請、會員加成資料、access token / auth session；SMB-232 / v1.3.10 後 `updateStore` 改為 row-level 差異寫入：載入時建立 id→序列化快照 baseline，寫回時只 upsert 新增/變更的 record、只刪除被移除的 record，全部包在單一 SQLite transaction，移除每次 mutation 全量 upsert 與全表刪除掃描的瓶頸（mutator API 不變） |
| `collab/auth-store.js` | 帳號、密碼、auth provider、會員 grant、Google Play 同步後的 public profile 會員狀態、refresh session 邏輯 |
| `collab/admin-store.js` | 管理員總覽、client log、會員管理 |
| `collab/auth-session.js` | Bearer token 驗證、登入狀態檢查、管理員權限檢查 |
| `collab/http.js` | backend 路由共用的 request/response helper，含 path segment parsing、method/body guard 與 route error serialization |

**同步合約自檢（SMB-253 / v1.3.31；SMB-266 frame structural predicates）**：`../backend/scripts/sync-contract-check-run.mjs` 編排載具 + 第一銀行錨點探測；`einvoice-portal-contract-check.mjs`、`first-bank-portal-contract-check.mjs`；第一銀行 frame 檢查除中英文文案 fallback 外，也檢查 `openIt`、`selectServiceHref`、`overview-account`、`tab1`、`txnStart` / `txnEnd`、`table.CnbTable` 與 010103 / 010101 URL 這類 structural anchors；失敗分類與統計在 `src/sync/contract-failure-classifier.js`、`contract-check-stats.js`；主機 cron 用 `sync-contract-check-cron.sh`，CI 用 `.github/workflows/sync-contract-check.yml`；告警寫 `log.wastebase.xyz/issues/SMB-253` 並節流 Plane comment。

**部署 native 依賴安裝（SMB-256 / v1.3.37）**：`../backend/package.json` 的 `deploy:copy` 在 rsync 後改呼叫 `../backend/scripts/deploy-production-install.mjs`（另有 `deploy:install` 別名），於與 StrawMB 執行環境相同的 `1panel/node:<NODE_VERSION>` 容器 image 內 `npm install`，確保 `better-sqlite3` 等 native binding 編進與容器一致的 Node ABI / glibc，安裝後在同一 image 內驗證 `require('better-sqlite3')` 可載入並查詢。腳本自 `/opt/1panel/runtime/node/StrawMB/.env` 讀 `NODE_VERSION` / `CODE_DIR` / `CONTAINER_PACKAGE_URL`（可用 `STRAWMB_NODE_IMAGE` / `STRAWMB_NODE_VERSION` / `STRAWMB_DEPLOY_DIR` / `STRAWMB_RUNTIME_ENV` 覆寫）；docker 不可用時直接中止，不退回 host `npm install`，避免部署窗口載入 host ABI binding 而出現 `Module did not self-register` / `NODE_MODULE_VERSION` mismatch / `ERR_DLOPEN_FAILED`。回歸測試 `../backend/test/deploy-production-install-source.test.js`。

## 9. Repository（資料存取層）對應

目錄：`src/core/repositories/`

| Repository | 資料表/職責 |
|---|---|
| `transaction.repo.js` | 交易查詢、建立、更新、軟刪除 |
| `account.repo.js` | 帳戶清單、餘額計算、封存/刪除 |
| `budget.repo.js` | 預算、預算項目、預算存款結算紀錄 |
| `category.repo.js` | 分類與分類群組 |
| `ledger.repo.js` | 帳本 |
| `loan.repo.js` | 借貸與還款紀錄 |
| `reimbursement.repo.js` | 報銷單與明細 |
| `savings-jar.repo.js` | 存錢罐資料 |
| `bank-sync.repo.js` | 銀行連線與同步設定 |
| `counterparty.repo.js` | 往來對象 |
| `settings.repo.js` | 設定（含 ledger-scoped 預算存款偏好） |
| `base.repo.js` | 通用 helper |

## 10. 補充說明（維護建議）

- 前端頁面應優先透過對應 store 操作，不直接在 view 內寫入 DB。
- 交易查詢頁與分析頁不得再直接 import `transaction.repo.js`，統一經過 `transaction-query.service.js`。
- 業務規則集中在 service 層，若調整規則，優先改 service。
- SQL 與資料結構調整，先改 repository，再檢查對應 store/action。
- **日期工具統一使用 `src/core/utils/id.js` 的 `monthKeyFromDate` / `dateKeyFromDate`**，禁止在 view / service 內重複定義相同邏輯。
- **多步驟刪除/寫入操作須包裝在 `withTransaction`（來自 `@/core/db/sqlite`）** 以確保資料完整性，參考 `transaction.service.js:deleteManualTransaction`。
- `transaction.repo.js:listHomeTransactionsPage` 支援首頁全部 / 年 / 月 / 日範圍的 SQL `LIMIT/OFFSET` 分頁（`HOME_TRANSACTION_PAGE_SIZE = 300`）；`summarizeHomeAssetTotalsByScope` 以單次 SQL 彙總收支（語意對齊退款淨額／分析旗標／排除借貸還款），`transaction-query.service.js:summarizeHomeAssetTotals` 改走此路徑；分析「全部」改 `listAllTransactionsChunked`；交易明細／編輯改 `listRelatedTransactionsForDetail`，避免一次載入整本帳本。
- 若新增主頁功能，優先考慮：`home.vue` + `HomeTransactionFeed.vue` + `transaction.store.js`。
- 若新增分析維度，優先考慮：`analysis.vue`、`analysis-breakdown.js` 與 `transaction-query.service.js`。
- 若調整交易報表欄位或匯出格式，優先考慮：`analysis.vue`（一鍵 PDF 快捷 + 報表頁入口）+ `AnalysisPrintPage.vue`（客製化期間／預覽／PDF／CSV／開啟檔案）+ `AnalysisReportDocument.vue` + `analysis-report-pdf.service.js` + `analysis-report-light-theme.js` + `export.service.js`（`openFileUrl`），並同步檢查分析頁共用圖示化圖表；互動分析頁須跟隨 Dark／Light；PDF 必須仍為淺色；PDF 須以 A4 print-layout 擷取並等比分頁且不得中切斷區塊；不得刪除 `/analysis/print` 路由或分析頁入口。
- 若調整交易刪除邏輯，需同步檢查 `transaction.service.js` 的關聯刪除（退款/報銷）。
- 若調整 App 開啟流程，需同步檢查 `main.js`、`app-bootstrap.service.js`、`app-runtime.service.js`、`useAppShellRuntime.js`、`google/auth.js` 與備份 service 的靜默登入流程。
- 若調整帳本切換與 onboarding，需同步檢查 `ledger.store.js`、`ledger-runtime.service.js`、`setup-flow.service.js` 與相關 store reload 流程。
- 若調整快速記帳入口，需同步檢查 `BookkeepingPage.vue`、`bookkeeping-mode.service.js`、首頁 FAB 與 Android 小工具導向。
- 若調整會員限制或升級導流，需同步檢查 `membership.service.js`、`membership-navigation.service.js` 與 `SettingsMembershipBenefitsPage.vue`。
- 若調整銀行同步入口，需同步檢查 `FeatureListPage.vue` 進階功能區的 `isBankSyncFeatureEnabled()`（feature 可視性）、`isBankSyncNativeAutomationAvailable()`（原生自動化）、銀行同步支援矩陣／可用性面板，以及 `/settings/bank-sync` 路由可達性（不可因 Web 無 native provider 靜默 redirect）；設定頁主清單不再列銀行同步入口。
- 若調整 Google Drive 帳本同步，需同步檢查 `SettingsGoogleDriveLedgerSyncPage.vue`、`google-drive-ledger-sync.service.js`、會員限制與活動帳本 reload 流程。
- 若調整 App URL / invite link，需同步檢查 `app-url-route.js`、router redirect 與 `SettingsSharedLedgerPage.vue` 的 invite code 自動加入邏輯。
- 若調整帳號 / 共同帳本 / 邀請碼 / 管理員流程，需同步檢查 `SettingsAccountPage.vue`、`SettingsSharedLedgerPage.vue`、`SettingsAdminPage.vue`、`src/services/shared-ledger/backend.js`、`src/services/shared-ledger/auth-session-storage.js`、`../backend/src/collab/auth-cookies.js`、`../backend/src/routes/route-table.js` 與 `../backend/src/routes/auth/`、`../backend/src/routes/shared-ledgers/`。SMB-233 / v1.3.5 後帳號 refresh token 不再存 `localStorage`，改由後端 HttpOnly cookie + 前端記憶體 access token；`auth-session-storage.js` 負責遷移舊 `straw.shared_ledger_session` 並只把 user profile 存進 `sessionStorage`。SMB-238 / v1.3.12 後 cookie auth 僅在 `useAuthStorage: true` 時附帶 header / `credentials: include`，`../backend/src/collab/http.js` 對 cookie auth 反射 Origin 並附 credentials CORS header。SMB-238 / v1.3.13 後 `wantsCredentialedCors()` 在 CORS preflight（`OPTIONS`）改檢查 `Access-Control-Request-Headers` 是否含 `x-straw-auth-storage`，確保 preflight 與實際請求一致反射 Origin + `Access-Control-Allow-Credentials`，匿名 preflight 仍維持 wildcard。SMB-238 / v1.3.14 後 `auth-cookies.js` 的 `shouldUseCrossSiteCookie()` 改比對 Origin 與 API `Host` 決定 refresh cookie `SameSite`（Capacitor `https://localhost` → `api.strawmb.com` 使用 `SameSite=None`），`readPersistedAuthSession` 在 cookie 模式下保留 sessionStorage user 供靜默 refresh。SMB-239 / v1.3.18 後 native 平台 user profile 改存 `localStorage`（Web 仍用 sessionStorage），`refreshSharedLedgerSession()` 在無 access token 時改委派 `restoreSharedLedgerSession({ force: true })`。
- Repo 忽略規則由根目錄 `.gitignore` 統一涵蓋 Node、Vite/Playwright、環境檔、後端 runtime data、Android/Capacitor 產物與本機工具快取；子目錄 `.gitignore` 僅保留平台細節例外。

## 11. 文件更新時機

建議在以下情況同步更新此文件：

- 新增/刪除路由頁面
- 調整主要功能流程（交易、借貸、報銷、請款、預算、備份）
- 變更 store/service/repository 的責任邊界
- 更新專案入口介紹、快速開始、測試指令或文件索引
- 新增重要共用元件（日期選擇器、統計元件、首頁卡片等）
- 設定入口策略變更（例如：銀行同步顯示策略）
- 帳號、共同帳本、邀請碼、管理員或 backend API 流程變更
- 記帳模式切換邏輯變更（AI / 快速新增 / 問答）
- Google Drive 帳本同步或分析報表列印流程變更

## 12. 變數與函數索引（檔案層級）

- 範圍：`*.js`、`*.mjs`、`*.cjs`、`*.vue` 的 `<script>` 區塊
- 規則：僅收錄檔案層級宣告（module scope），不含函數內部區域變數
- 產生方式：由專案自動掃描產生（可重複執行更新）
- 備註：此段為掃描快照，新增檔案或重新建置後請重新掃描更新

### `android/app/src/main/assets/public/assets/addon-note-Bwq_D-Ew.js`
- 函數（0）：無
- 變數（1）：`i`
- 類別（0）：無

### `android/app/src/main/assets/public/assets/fa-icon-options-3VeAQaPo.js`
- 函數（0）：無
- 變數（1）：`i`
- 類別（0）：無

### `android/app/src/main/assets/public/assets/index-CrU_SBIu.js`
- 函數（0）：無
- 變數（1）：`__vite__mapDeps`
- 類別（0）：無

### `scripts/android-versioning.mjs`
- 函數（1）：`deriveVersionCodeFromVersionName`
- 變數（3）：`DEFAULT_VERSION_CODE`, `MAJOR_MULTIPLIER`, `VERSION_SEGMENT_BASE`
- 類別（0）：無

### `scripts/patch-capacitor-sqlite-plugin.mjs`
- 函數（0）：無
- 變數（3）：`filePath`, `next`, `source`
- 類別（0）：無

### `src/core/db/migrate.js`
- 函數（10）：`ensureSchemaMetaTable`, `executeMigrationSql`, `getSchemaMetaValue`, `isIgnorableMigrationError`, `patchLegacySchema`, `patchLegacyTableColumns`, `runMigrations`, `setSchemaMetaValue`, `splitSqlStatements`, `tableExists`
- 變數（3）：`LEGACY_COLUMN_PATCHES`, `LEGACY_SCHEMA_PATCH_META_KEY`, `MIGRATIONS`
- 類別（0）：無

### `src/core/db/sqlite.js`
- 函數（19）：`closeAllConnectionsSafely`, `closeDatabase`, `emitDataMutationEvent`, `ensureWebStoreReady`, `execute`, `getDatabase`, `initDatabase`, `isDataMutationSql`, `isNoSuchTableError`, `isPluginNullError`, `isRecoverableSchemaError`, `normalizeErrorMessage`, `openDatabaseConnection`, `openRecoveryDatabase`, `query`, `rebuildDatabase`, `resetDatabase`, `run`, `withTransaction`
- 變數（8）：`DB_VERSION`, `PRIMARY_DB_NAME`, `RECOVERY_DB_NAME`, `RESET_TABLES`, `activeDbName`, `db`, `initPromise`, `sqlite`
- 類別（0）：無

### `src/core/db/web-store.js`
- 函數（2）：`ensureJeepSqliteRegistered`, `ensureWebSqliteStoreReady`
- 變數（3）：`WASM_PATH`, `registerPromise`, `webStorePromise`
- 類別（0）：無

### `src/core/repositories/account.repo.js`
- 函數（17）：`archiveAccount`, `countAccountTransactions`, `countAccountsByGroup`, `createAccount`, `createAccountGroup`, `deleteAccountGroupIfEmpty`, `deleteAccountIfUnused`, `getAccountBalances`, `listAccountGroups`, `listAccounts`, `normalizeAccountIcon`, `normalizeCurrencyCode`, `restoreAccount`, `updateAccountGroupSortOrders`, `updateAccountIcon`, `updateAccountProfile`, `updateAccountSortOrdersByGroup`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/base.repo.js`
- 函數（3）：`assertLedgerId`, `firstRow`, `rowsOf`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/budget.repo.js`
- 函數（7）：`computeBudgetSpentByCategory`, `createBudget`, `deleteBudgetItem`, `deleteBudgetItemsByBudget`, `getBudgetByMonth`, `listBudgetItems`, `upsertBudgetItem`
- 變數（0）：無
- 類別（0）：無
- 補充：除原本的 budgets / budget_items 讀寫外，現在也承接整月預算存款設定、待結算 budget 篩選與 `budget_save_settlements` 結算紀錄。
- 補充：`listBudgetItems()` 在 join `categories` 時已明確使用 `bi.sort_order AS sort_order`，避免建立新帳本後初始化預算快照時出現 ambiguous column error。
- 補充（SMB-261 / v1.3.50）：repo 層補上 `normalizeBudgetSaveEnabled`，寫入整月 / 項目 / 共同預算池預算存款開關時不再 ReferenceError。

### `src/core/repositories/category.repo.js`
- 函數（20）：`archiveCategoriesByGroup`, `archiveCategory`, `archiveCategoryGroup`, `countBudgetItemReferencesByGroup`, `countCategoryTransactions`, `countCategoryTransactionsByGroup`, `createCategory`, `createCategoryGroup`, `deleteCategoriesByGroup`, `deleteCategoryGroupById`, `deleteCategoryGroupIfUnused`, `deleteCategoryIfUnused`, `findFirstCategoryByKind`, `listCategories`, `listCategoryGroups`, `normalizeCategoryIcon`, `updateCategoryGroupSortOrdersByKind`, `updateCategoryIcon`, `updateCategoryProfile`, `updateCategorySortOrdersByGroup`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/counterparty.repo.js`
- 函數（4）：`createCounterparty`, `ensureCounterpartyByName`, `getCounterpartyByName`, `listCounterparties`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/ledger.repo.js`
- 函數（7）：`createLedger`, `deleteLedger`, `getLedger`, `isForeignKeyError`, `listLedgers`, `renameLedger`, `updateLedgerSortOrders`
- 變數（1）：`LEGACY_LEDGER_CHILD_DELETE_ORDER`
- 類別（0）：無

### `src/core/repositories/loan.repo.js`
- 函數（8）：`countLoans`, `createLoan`, `createLoanPayment`, `getLoanById`, `listLoanPayments`, `listLoans`, `sumLoanPayments`, `updateLoanStatus`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/reimbursement.repo.js`
- 函數（10）：`countReimbursements`, `createReimbursement`, `createReimbursementItem`, `findTransactionByIdempotencyKey`, `getReimbursementById`, `listReimbursementItems`, `listReimbursements`, `recomputeReimbursementTotal`, `setReimbursementPaid`, `updateReimbursementStatus`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/settings.repo.js`
- 函數（2）：`getSetting`, `setSetting`
- 變數（0）：無
- 類別（0）：無

### `src/core/repositories/transaction.repo.js`
- 函數（23）：`addTransaction`, `addTransfer`, `countReimbursableTransactions`, `dayRangeUtc`, `findReimbursementSettlementIncomeTx`, `findTransactionById`, `findTransactionRecordById`, `getPaidClaimItemMinorByTransactionId`, `listAllTransactions`, `listRecentTransactions`, `listReimbursementTransactions`, `listTransactionsByAccount`, `listTransactionsByDay`, `listTransactionsByMonth`, `listTransactionsByYear`, `listTransferTransactionsByGroup`, `markTransactionReimbursed`, `monthRangeUtc`, `paidClaimItemMinorSql`, `softDeleteTransactionById`, `softDeleteTransferGroup`, `updateTransactionById`, `yearRangeUtc`
- 變數（0）：無
- 類別（0）：無
- 補充：`listReimbursementTransactions` 的 `reimbursed_minor` 會合併直接報銷入帳、代收抵扣與已完成請款單匯入明細，避免完成請款後原交易仍被分到未報銷。
- 補充：交易軟刪會同步清空 `idempotency_key`，讓請款單還原後再次完成、排程轉帳重建等流程不會被已軟刪交易的唯一鍵擋住。

### `src/core/services/ai-bookkeeping.service.js`
- 函數（28）：`compactText`, `countSubsequenceHits`, `escapeRegExp`, `extractAddonItems`, `extractSmartNoteText`, `findAccountByKeyword`, `findAccountMatches`, `fuzzyAccountScore`, `includesAny`, `includesKeyword`, `isGenericCategoryName`, `normalizeIncludeFlag`, `normalizeReimbursable`, `normalizeText`, `normalizeType`, `parseAmountMajor`, `parseAmountWithUnit`, `parseAutoBookkeepingText`, `parseDateTimeFromText`, `pickCategoryBySemanticRules`, `pickCategoryMatch`, `pickClosestAccount`, `pickFirstNonGenericCategory`, `pickTransferAccounts`, `round2`, `shouldTreatAsTransfer`, `stripTextByRanges`, `toMinor`
- 變數（2）：`EXPENSE_CATEGORY_SEMANTIC_RULES`, `INCOME_CATEGORY_SEMANTIC_RULES`
- 類別（0）：無

### `src/core/services/bootstrap.service.js`
- 函數（1）：`bootstrapCoreDatabase`（smb297：禁 silent wipe；失敗 → `LOCAL_DB_INTEGRITY`；smb298：禁空 recovery DB live fallback）
### `src/core/services/empty-ledger-restore-hint.service.js`
- 函數：`detectEmptyLedgerRestoreHint`、`emitEmptyLedgerRestoreHint`
- 補充（smb298）：空庫＋IndexedDB recovery → Welcome／toast 可見還原提示
### `src/core/services/data-wipe-guard.service.js`
- 函數：`assertExplicitDataWipe`、`recordDataWipeAudit`、`assertExplicitLedgerRepair`、`recordLedgerIntegrityScan`、`recordLedgerRepairAudit`、`createLocalDatabaseIntegrityError`、`createEmptyRemoteReplaceBlockedError`、`countSnapshotActiveTransactions` 等
- 變數（0）：無
- 類別（0）：無
- 補充（smb297）：完整 wipe 與破壞性 repair 皆需 `confirmed`＋合法 reason＋audit；wipe 前 `runConfirmedWipeAfterRecoveryBackup`／`requireRecoveryBackupBeforeWipe` 必須取得 **verified durable proof**（僅 `indexeddb`／`filesystem`／`test`；**memory／download-only 不算**），失敗→`RECOVERY_BACKUP_REQUIRED`；資料管理頁可列出／下載／還原 IndexedDB recovery；啟動僅 scan；Google Drive／共同帳本 sync replace `runIntegrityRepair:false`；JSON 匯入預設不自動 repair；禁止 silent rewrite。

### `src/core/services/recovery-backup.service.js`
- 函數：`createVerifiedRecoveryBackupBeforeWipe`、`persistVerifiedRecoveryBackup`、`isVerifiedRecoveryBackupProof`、`listVerifiedRecoveryBackups`、`loadRecoveryBackupJsonText`、`loadRecoveryBackupPayload`、`readVerifiedRecoveryBackup`
- 補充（smb297）：wipe 前強制 durable recovery；in-process memory 永不解鎖 wipe；裝置檔／瀏覽器下載僅 UX；IndexedDB 備份需可列出／下載／還原。

### `src/core/services/budget.service.js`
- 函數（新增重點）：`resolveBudgetPeriodForLedger`, `previousBudgetPeriod`, `nextBudgetPeriod`, `loadBudgetSnapshotForPeriod`, `listInclusiveMonthKeys`, `saveBudgetContainerRange`, `saveBudgetItemRange`
- 變數（0）：無
- 類別（0）：無
- 補充：service 會驗證預算存款的來源/目標帳戶、同分類衝突與 ledger-scoped `retroactiveMode`，並把整期預算存款與 item-level 預算存款設定一起帶進 snapshot / 複製上月流程。SMB-268 後 `listInclusiveMonthKeys` 以純 `YYYY-MM` 解析產生 inclusive month range；`saveBudgetContainerRange` 在不改資料表 schema 的前提下，將新共同預算池 fan-out 至每個目標月份的正常 budget/container，並在任何目標月份同名衝突時整批阻擋；`saveBudgetItemRange` 將新一般分類預算項目 fan-out 至每個目標月份的正常 budget item，保留金額模式、日期日均規則與預算存款設定，入池項目以目標月同名共同池對應，且在同分類衝突或目標月缺池時零寫入阻擋。SMB-269 後新增通用預算期間解析：曆月維持 `YYYY-MM`，發薪週期使用 `pay:YYYY-MM-DD:YYYY-MM-DD` 期間 key、起訖日與 mode，不搬移交易、不拆固定額；日額 / 日池依實際週期天數計算，指定日曆日規則只計算週期範圍內符合日期；snapshot 的期間與今日花費查詢會以帳本時區轉 UTC，避免本地與 CI 執行環境時區不同造成交易歸期漂移。

### `src/core/services/budget-save.service.js`
- 函數（1）：`runBudgetSaveIfDue`
- 變數（0）：無
- 類別（0）：無
- 補充：背景流程依帳本時區補跑日結轉與期間結束結轉，支援 `manual` / `delta` 補差、無剩餘略過、來源餘額不足失敗記錄，以及同分類衝突排除。SMB-269 後固定額、共同池與整期總額在曆月月底或發薪週期結束後各結算一次，避免跨月週期重複存入。

### `src/core/services/export.service.js`
- 函數（33）：`createCsvBlobUrl`, `createExcelBlobUrl`, `customRangeUtc`, `dayRangeUtc`, `downloadBlob`, `downloadCsvFile`, `downloadExcelFile`, `downloadJsonFile`, `exportAccountsCsv`, `exportAllLedgersJson`, `exportCategoriesCsv`, `exportLedgerJson`, `exportLedgerTransactionsCsv`, `exportLedgerTransactionsExcel`, `exportTransactionsCsv`, `getSchemaVersion`, `loadAccountBalanceBeforeMap`, `monthRangeUtc`, `rangeByMode`, `revokeBlobUrl`, `rowsFromLedgerTable`, `rowsToCsv`, `rowsToSpreadsheetXml`, `saveCsvFileToDevice`, `saveExcelFileToDevice`, `saveJsonFileToDevice`, `timestampForFilename`, `toCsvValue`, `toXmlValue`, `triggerDownloadFromUrl`, `utf8ToBase64`, `writeBase64FileToDevice`, `yearRangeUtc`
- 變數（2）：`EXCEL_HEADERS`, `LEDGER_TABLES`
- 類別（0）：無

### `src/core/services/google-play-billing.service.js`
- 函數（31）：`createBillingError`, `delay`, `ensureBillingSupported`, `findOwnedPurchaseByProductId`, `hasFreshBillingSupportCache`, `invalidateBillingCache`, `isAndroidNativePlatform`, `isOwnedPurchase`, `isStoreUnavailableError`, `isSupported`, `loadProducts`, `loadProductsInternal`, `manageSubscriptions`, `normalizeOwnedPurchase`, `normalizePlan`, `normalizeProduct`, `normalizePurchaseExpiryIso`, `normalizeStoreError`, `pickFirstValidIso`, `purchase`, `purchaseInternal`, `queryOwned`, `queryOwnedInternal`, `redeemPromoCode`, `restore`, `setBillingSupportCache`, `toIsoFromAnyTimestamp`, `toLowerText`, `toTimestampMs`, `withStoreRetry`, `withTimeout`
- 變數（8）：`BILLING_ERROR_CODE`, `BILLING_SUPPORT_CACHE_TTL_MS`, `BILLING_SUPPORT_RETRY_MAX_ATTEMPTS`, `BILLING_TIMEOUT_MS`, `GOOGLE_PLAY_PRODUCTS`, `STORE_RETRY_DELAY_MS`, `billingConnectionInFlight`, `billingSupportCache`
- 類別（0）：無

### `src/core/services/import.service.js`
- 函數（19）：`importAccountsCsv`, `importBackupJsonAsNewLedgers`, `importCategoriesCsv`, `importLedgerCsv`, `importLedgerJsonAsNewLedger`, `importLedgerPayloadAsNewLedger`, `importTransactionsCsv`, `normalizeFaIcon`, `normalizeLedgerName`, `normalizeText`, `normalizedRows`, `objectToInsertSql`, `parseCsv`, `parseCsvLine`, `parseJson`, `previewCsvType`, `resolveImportedLedgerName`, `resolveSourceLedger`, `sumNumericValues`
- 變數（1）：`TABLE_IMPORT_ORDER`
- 類別（0）：無

### `src/core/services/loan.service.js`
- 函數（8）：`addLoanRepayment`, `createLoanWithOptionalTransaction`, `getLoanDetail`, `loadLoanDashboard`, `nextLoanStatus`, `validateAmountMinor`, `validateDirection`, `voidLoan`
- 變數（0）：無
- 類別（0）：無

### `src/core/services/membership.service.js`
- 函數（73）：`assertCanCreateAccount`, `assertCanCreateLedger`, `assertCanCreateLoan`, `assertCanCreateReimbursement`, `assertCanUseAiBookkeeping`, `beginGooglePlayCallTrace`, `clonePlayCallTraceEntry`, `commitEntitlementState`, `createDefaultEntitlementState`, `endGooglePlayCallTrace`, `fetchMembershipProductDisplay`, `getAiBookkeepingDailyUsage`, `getAppVersion`, `getAppVersionMajor`, `getBrowserStorage`, `getEmptyProductDisplay`, `getEntitlementState`, `getGooglePlayCallTraceSnapshot`, `getGooglePlayMembershipInfo`, `getMembershipLimits`, `getMembershipProductDisplay`, `getMembershipProductDisplaySnapshot`, `getMembershipTier`, `getMembershipTierSnapshot`, `getTierAndPlanFromState`, `hasFreshGooglePlaySupportCache`, `hasMembershipProductDisplayCache`, `isDebugMembershipOverrideEnabled`, `isFreeTier`, `isGooglePlayMembershipSupported`, `isMembershipCacheValid`, `isMembershipProductDisplayCacheFresh`, `isMonthlySyncFailureGraceActive`, `isTransientStoreError`, `migrateLegacyMembershipState`, `normalizeCacheExpiry`, `normalizeEntitlementState`, `normalizeGooglePlayPlan`, `normalizeProductDisplay`, `normalizeSyncStatus`, `normalizeUsageCount`, `notifyMembershipSnapshot`, `notifyPlayCallTraceListeners`, `openGooglePlaySubscriptionManagement`, `readAiUsageMap`, `readEntitlementState`, `recordAiBookkeepingUsage`, `redeemGooglePlayPromoCode`, `resolveMonthlyCacheExpiry`, `resolveMonthlyCacheExpiryFromPurchaseResult`, `restoreGooglePlayMembership`, `saveEntitlementState`, `setGooglePlaySupportCache`, `setMembershipProductDisplayCache`, `sleep`, `subscribeGooglePlayCallTrace`, `subscribeGooglePlayMembership`, `subscribeMembershipSnapshot`, `syncMembershipEntitlements`, `syncMembershipEntitlementsWithRetry`, `toDateKey`, `toEpochMs`, `toExpiryIso`, `toIsoNow`, `toMembershipLimitsByTier`, `toMembershipSnapshot`, `traceGooglePlayCall`, `triggerBackgroundMembershipSync`, `trimPlayCallTraceEntries`, `warmupMembershipRuntime`, `withTimeout`, `writeAiUsageMap`, `writeEntitlementState`
- 變數（33）：`AI_BOOKKEEPING_USAGE_STORAGE_KEY`, `FREE_LIMITS`, `GOOGLE_PLAY_SUPPORT_CACHE_TTL_FAIL_MS`, `GOOGLE_PLAY_SUPPORT_CACHE_TTL_OK_MS`, `GOOGLE_PLAY_SUPPORT_RETRY_DELAY_MS`, `LEGACY_GOOGLE_PLAY_MEMBER_PLAN_STORAGE_KEY`, `LEGACY_GOOGLE_PLAY_MEMBER_STORAGE_KEY`, `MEMBERSHIP_BACKGROUND_SYNC_COOLDOWN_MS`, `MEMBERSHIP_CACHE_FOREVER`, `MEMBERSHIP_ENTITLEMENT_STORAGE_KEY`, `MEMBERSHIP_FREE`, `MEMBERSHIP_MEMBER`, `MEMBERSHIP_PRODUCT_DISPLAY_CACHE_TTL_MS`, `MEMBERSHIP_PRODUCT_DISPLAY_FETCH_TIMEOUT_MS`, `MEMBERSHIP_SYNC_RETRY_DELAY_MS`, `MEMBERSHIP_SYNC_RETRY_MAX_ATTEMPTS`, `MEMBERSHIP_SYNC_STATUS_ERROR`, `MEMBERSHIP_SYNC_STATUS_OK`, `MONTHLY_MEMBERSHIP_EXPIRY_UNKNOWN_GRACE_MS`, `MONTHLY_MEMBERSHIP_SYNC_FAILURE_GRACE_MS`, `PLAY_CALL_TRACE_MAX_ENTRIES`, `googlePlaySupportCache`, `membershipBackgroundSyncInFlight`, `membershipBackgroundSyncRequestedAt`, `membershipProductDisplayCache`, `membershipProductDisplayCachedAt`, `membershipProductDisplayInFlight`, `membershipSnapshotListeners`, `membershipSyncInFlight`, `playCallExecutionQueue`, `playCallTraceEntries`, `playCallTraceListeners`, `playCallTraceSeq`
- 類別（0）：無

### `src/core/services/reimbursement.service.js`
- 函數（17）：`appendDateToNote`, `assertCanTransition`, `buildCopiedExpenseNote`, `cancelReimbursableExpenseSettlement`, `copyExpenseToTargetLedgers`, `createReimbursementDraft`, `ensureCategoryInTargetLedger`, `ensureHiddenReimbursementCategory`, `findTargetAccountId`, `getReimbursementDetail`, `loadReimbursementDashboard`, `markReimbursementPaid`, `normalizeAmountMinor`, `normalizeTargetLedgerIds`, `settleReimbursableExpense`, `toDateKey`, `transitionReimbursementStatus`
- 變數（1）：`ALLOWED_TRANSITIONS`
- 類別（0）：無

### `src/core/services/repair.service.js`
- 函數（3）：`countValue`, `repairLedgerData`, `scanLedgerIntegrity`
- 變數（0）：無
- 類別（0）：無

### `src/core/services/seed.service.js`
- 函數（4）：`ensureLedgerDefaults`, `normalizeSeedLocale`, `resolveLedgerSeedLocale`, `seedCategoryGroupsAndCategories`
- 變數（3）：`CATEGORY_DEFAULTS_BY_LOCALE`, `LEDGER_SEED_LOCALE_KEY`, `SUPPORTED_SEED_LOCALES`
- 類別（0）：無

### `src/core/services/transaction.service.js`
- 函數（15）：`assertPositiveAmount`, `cloneTransactionFailureTraceEntry`, `createAdjustment`, `createExpense`, `createIncome`, `createTransfer`, `deleteManualTransaction`, `getTransactionFailureReasonType`, `getTransactionFailureTraceSnapshot`, `notifyTransactionFailureTraceListeners`, `recordTransactionFailureTrace`, `subscribeTransactionFailureTrace`, `traceTransactionCreate`, `trimTransactionFailureTraceEntries`, `updateManualTransaction`
- 變數（4）：`TRANSACTION_FAILURE_TRACE_MAX_ENTRIES`, `transactionFailureTraceEntries`, `transactionFailureTraceListeners`, `transactionFailureTraceSeq`
- 類別（0）：無

### `src/core/utils/id.js`
- 函數（3）：`createId`, `monthKeyFromDate`, `nowIso`
- 變數（0）：無
- 類別（0）：無

### `src/main.js`
- 函數（5）：`initSqliteWebStoreIfNeeded`, `initSqliteWebStoreWithTimeout`, `main`, `scheduleAutoBackupOnDataChange`, `scheduleMembershipWarmup`
- 變數（3）：`DATA_CHANGE_BACKUP_DEBOUNCE_MS`, `dataChangeBackupRunning`, `dataChangeBackupTimer`
- 類別（0）：無

### `src/services/google/auth.js`
- 函數（15）：`appendDebugDetails`, `assertNativePlatform`, `createReauthRequiredError`, `extractErrorDebugParts`, `extractToken`, `getAccessToken`, `getCachedGoogleProfile`, `getConfiguredWebClientId`, `googleSignIn`, `googleSignOut`, `initGoogleAuth`, `isAccountReauthError`, `loginGoogleWithOptions`, `normalizeGoogleAuthError`, `reauth`
- 變數（7）：`DRIVE_APPDATA_SCOPE`, `GOOGLE_REAUTH_REQUIRED_CODE`, `GOOGLE_SCOPES`, `cachedAccessToken`, `cachedProfile`, `initializedClientId`, `ongoingSignInPromise`
- 類別（0）：無

### `src/services/google/drive-appdata-backup.js`
- 函數（12）：`authHeaders`, `buildMultipartBody`, `createDriveFile`, `deleteDriveFile`, `downloadAppDataBackupText`, `ensureOk`, `fetchWithAuth`, `findFilesByName`, `listAppDataBackups`, `listAppDataFileRevisions`, `updateDriveFile`, `uploadBackupJsonToAppDataFolder`
- 變數（2）：`DRIVE_FILES_API`, `DRIVE_UPLOAD_API`
- 類別（0）：無

### `src/ui/App.vue`
- 函數（0）：無
- 變數（7）：`accountStore`, `hasAccounts`, `hasLedgers`, `isBooting`, `ledgerStore`, `route`, `showWelcomePage`
- 類別（0）：無

### `src/ui/components/budget/BudgetItemSheet.vue`
- 函數（6）：`closeCategoryPicker`, `onSave`, `openCategoryPicker`, `pickCategory`, `setCategoryPickerParent`, `syncCategoryPickerParent`
- 變數（11）：`categoryOptions`, `categoryPickerChildren`, `categoryPickerGroups`, `categoryPickerParentId`, `emit`, `hasVisibleCategories`, `model`, `props`, `selectedCategoryIcon`, `selectedCategoryLabel`, `showCategoryPicker`
- 類別（0）：無
- 補充：sheet 內新增 item-level 預算存款開關、來源帳戶 / 目標存錢罐選擇與錯誤提示，帳戶選擇沿用快速新增的分組式 account picker；`daily_average` 會固定顯示為日結轉，其餘固定預算為月底結轉。SMB-271 後，新增 / 編輯項目流程內也會顯示「目前帳本預算期間」區塊，可切換曆月 / 發薪週期並設定每月發薪日；payload 僅回傳 ledger-level settings，由 `budgeting.vue` 寫入帳本，不把週期寫進 budget item。

### `src/ui/components/budget/BudgetContainerSheet.vue`
- 補充：共同預算池新增 / 編輯 sheet 支援池名、池金額、月池 / 日池、日池分類綁定與池層預算存款設定。SMB-271 後同樣提供「目前帳本預算期間」區塊，讓使用者在共同池流程直接調整帳本曆月 / 發薪週期與每月發薪日，且文案明確提醒切換會影響此帳本預算頁與首頁預算卡。

### `src/ui/components/common/AppDialog.vue`
- 函數（1）：`onRequestCloseOverlay`
- 變數（2）：`emit`, `props`
- 類別（0）：無

### `src/ui/components/common/CustomSelect.vue`
- 函數（8）：`handleWindowClick`, `handleWindowResizeOrScroll`, `isActive`, `isSameValue`, `normalizeOptions`, `pick`, `toggleOpen`, `updateMenuPosition`
- 變數（11）：`emit`, `menuRef`, `menuStyle`, `normalizedGroups`, `normalizedOptions`, `open`, `props`, `rootRef`, `selectedLabel`, `selectedOption`, `triggerRef`
- 類別（0）：無

### `src/ui/components/common/DateTimePickerField.vue`
- 函數（12）：`handleWindowClick`, `handleWindowResizeOrScroll`, `pad2`, `parseDate`, `pickDate`, `pickHour`, `pickMinute`, `setNow`, `shiftMonth`, `toDateInput`, `toggleOpen`, `updatePanelPosition`
- 變數（14）：`dayCells`, `displayText`, `emit`, `hours`, `minutes`, `monthLabel`, `open`, `panelRef`, `panelStyle`, `props`, `rootRef`, `triggerRef`, `viewMonth`, `weekNames`
- 類別（0）：無

### `src/ui/components/common/TimePickerField.vue`
- 函數（15）：`applySelection`, `closePanel`, `handleWindowClick`, `handleWindowResizeOrScroll`, `normalizeHour`, `normalizeMinute`, `onRequestCloseOverlay`, `pad2`, `parseTime`, `pickHour`, `pickMinute`, `resetToCurrentValue`, `syncDraftFromValue`, `toggleOpen`, `updatePanelPosition`
- 變數（14）：`displayText`, `draftHour`, `draftMinute`, `emit`, `hours`, `minutes`, `open`, `panelRef`, `panelStyle`, `props`, `rootRef`, `triggerRef`, `useSheetPresentation`, `viewportWidth`
- 類別（0）：無

### `src/ui/components/common/HomeRangePicker.vue`
- 函數（14）：`handleWindowClick`, `handleWindowResizeOrScroll`, `monthName`, `parseDay`, `parseMonth`, `pickDay`, `pickMonth`, `pickToday`, `pickYear`, `shift`, `toDayKey`, `toMonthKey`, `toggleOpen`, `updatePanelPosition`
- 變數（15）：`dayCells`, `displayLabel`, `emit`, `headerLabel`, `now`, `open`, `panelRef`, `panelStyle`, `props`, `rootRef`, `triggerRef`, `viewMonth`, `viewYear`, `weekNames`, `yearOptions`
- 類別（0）：無

### `src/ui/components/common/LedgerSwitcher.vue`
- 函數（5）：`onChange`, `onWindowClick`, `onWindowResizeOrScroll`, `toggleOpen`, `updateMenuPosition`
- 變數（9）：`activeLedgerName`, `isOpen`, `ledgerStore`, `menuRef`, `menuStyle`, `rootRef`, `switchableLedgers`, `triggerRef`, `uiStore`
- 類別（0）：無

### `src/ui/components/common/MoneyText.vue`
- 函數（0）：無
- 變數（2）：`props`, `text`
- 類別（0）：無

### `src/ui/components/common/ToastHost.vue`
- 函數（0）：無
- 變數（2）：`orderedToasts`, `uiStore`
- 類別（0）：無

### `src/ui/components/home/HomeAssetSummaryCard.vue`
- 函數（0）：無
- 變數（4）：`expenseMinor`, `incomeMinor`, `title`, `transactionStore`
- 類別（0）：無

### `src/ui/components/home/HomeBudgetSummaryCard.vue`
- 函數（0）：無
- 變數（7）：`budgetStore`, `isOverBudget`, `pieStyle`, `totalBudgetMinor`, `totalSpentMinor`, `usedPercentLabel`, `usedRatio`
- 類別（0）：無
- 補充：首頁預算簡表的月模式與日模式都會顯示保留金額；月模式含未入池 `daily_average` 規則日預留額（含當日）與共同預算日池剩餘日 × 池日額，並以帳本時區判斷「今天」；日模式使用目前選定日期之後尚未到來的 `daily_average` 保留額，不含今天已生效的日均額度。

### `src/ui/components/home/HomeTransactionEditSheet.vue`
- 函數（34）：`addAddonRow`, `addonLabelOf`, `addonOptionIdByLabel`, `addonTotalDeltaMajorFromNote`, `applyOperator`, `closeCategoryPicker`, `closeDeleteConfirm`, `collectAppliedAddonItems`, `confirmRemove`, `createAddonRow`, `defaultAddonOption`, `defaultCategoryId`, `ensureInCategories`, `evaluateExpression`, `formatAmountInput`, `handleAmountInput`, `isFormulaExpression`, `isOperator`, `onAddonOptionChange`, `onRequestCloseOverlay`, `openCategoryPicker`, `parseAddonRowsFromNote`, `pickCategory`, `precedence`, `pressCalcKey`, `remove`, `removeAddonRow`, `round2`, `setCategoryPickerParent`, `submit`, `syncAmountFromInput`, `syncCategoryPickerParent`, `toDateInput`, `toOccurredAtIso`
- 變數（27）：`accountStore`, `addonDirectionOptions`, `addonOptions`, `addonOptionsByType`, `addonRows`, `addonSeq`, `addonTemplateStore`, `calcKeys`, `categoryPickerChildren`, `categoryPickerGroups`, `categoryPickerParentId`, `categoryStore`, `deleteConfirmOpen`, `deleting`, `emit`, `hasVisibleCategories`, `model`, `props`, `selectedCategoryIcon`, `selectedCategoryLabel`, `showCategory`, `showCategoryPicker`, `showExtra`, `transactionStore`, `types`, `uiStore`, `visibleCategoryGroups`
- 類別（0）：無
- 補充：附加項目列採單行橫向排列；報銷/預算/收支採卡片式切換按鈕。

### `src/ui/components/home/HomeTransactionFeed.vue`
- 函數（13）：`accountNameOfTransaction`, `addonDeltaMajor`, `addonDeltaTag`, `categoryIconOfTransaction`, `dateKeyOf`, `dateLabelOf`, `formatTime`, `labelOf`, `labelOfTransaction`, `loanTransactionIcon`, `loanTransactionLabel`, `openEdit`, `showAddonDeltaTag`
- 變數（7）：`accountStore`, `categoryStore`, `groupedRecentTransactions`, `loanStore`, `monthLabel`, `router`, `transactionStore`
- 類別（0）：無

### `src/ui/components/home/QuickAddSheet.vue`
- 函數（45）：`accountNameById`, `addAddonRow`, `addonDirectionByOptionId`, `addonLabelOf`, `addonOptionIdByLabel`, `applyAiDraft`, `applyOperator`, `categoryNameById`, `closeCategoryPicker`, `collectAppliedAddonItems`, `createAddonRow`, `defaultAccountId`, `defaultAddonTemplate`, `defaultOccurredDateTime`, `defaultPeerAccountId`, `ensureCategoryIdByType`, `ensureValidAccounts`, `evaluateExpression`, `formatAmountInput`, `formatDateInput`, `formatOccurredAtLabel`, `goEditCreatedTransaction`, `handleAmountInput`, `isFormulaExpression`, `isOperator`, `monthKeyFromDate`, `normalizeType`, `onAddonOptionChange`, `onRequestCloseOverlay`, `openCategoryPicker`, `parseAddonRowsFromAiDraft`, `parseWithAi`, `pickCategory`, `precedence`, `pressCalcKey`, `pushAiMessage`, `removeAddonRow`, `resolveTypeByCategory`, `round2`, `setCategoryPickerParent`, `submit`, `syncAmountFromInput`, `syncCategoryPickerParent`, `toOccurredAtIso`, `toggleAiVoiceInput`
- 變數（46）：`accountStore`, `addonDirectionOptions`, `addonRows`, `addonSeq`, `addonTemplateItems`, `addonTemplateOptions`, `addonTemplateStore`, `aiAutoCreating`, `aiCreatedRecord`, `aiInput`, `aiInterimSpeechText`, `aiMessageSeq`, `aiMessages`, `aiOccurredAtLabel`, `aiResultAccountId`, `aiResultAccountText`, `aiResultAmountMajor`, `aiResultCategoryId`, `aiResultIcon`, `aiResultOccurredAtLabel`, `aiResultPeerAccountId`, `aiResultSignedAmount`, `aiResultTitle`, `aiResultType`, `budgetStore`, `calcKeys`, `categoryPickerChildren`, `categoryPickerGroups`, `categoryPickerParentId`, `categoryStore`, `emit`, `equalShowsDone`, `hasAiInputText`, `hasVisibleCategories`, `isAiMode`, `model`, `props`, `router`, `selectedCategoryIcon`, `selectedCategoryLabel`, `showCategoryPicker`, `showExtra`, `transactionStore`, `types`, `uiStore`, `visibleCategoryGroups`
- 類別（0）：無
- 補充：同一元件同時承載 AI 對話模式與手動記帳表單；附加項目列維持單行，附加條件使用卡片式切換按鈕。

### `src/ui/components/layout/BottomNav.vue`
- 函數（0）：無
- 變數（4）：`NAV_ITEMS`, `activeTab`, `items`, `route`
- 類別（0）：無

### `src/ui/composables/use-speech-input.js`
- 函數（7）：`normalizeRawErrorCode`, `normalizeSpeechError`, `normalizeSpeechTranscript`, `parseChineseIntegerToken`, `parseChineseNumberToken`, `resolveSpeechRecognitionCtor`, `useSpeechInput`
- 變數（4）：`CHINESE_BIG_UNIT_MAP`, `CHINESE_DIGIT_MAP`, `CHINESE_SMALL_UNIT_MAP`, `isDev`
- 類別（0）：無

### `src/ui/constants/currency-options.js`
- 函數（1）：`normalizeCurrencyCode`
- 變數（3）：`CURRENCY_OPTION_LIST`, `VALID_CURRENCY_CODES`, `currencyOptions`
- 類別（0）：無

### `src/ui/router/index.js`
- 函數（0）：無
- 變數（1）：`router`
- 類別（0）：無

### `src/ui/services/addon-template.service.js`
- 函數（7）：`getDefaultAddonTemplates`, `getDefaultAddonTemplatesByLedger`, `loadAddonTemplates`, `normalizeSeedLocale`, `normalizeTemplate`, `normalizeTemplates`, `saveAddonTemplates`
- 變數（4）：`ADDON_TEMPLATE_KEY`, `DEFAULT_TEMPLATES_BY_LOCALE`, `LEDGER_SEED_LOCALE_KEY`, `SUPPORTED_SEED_LOCALES`
- 類別（0）：無

### `src/ui/services/google-backup.service.js`
- 函數（15）：`assertLedgerId`, `buildDefaultState`, `connectGoogleBackup`, `disconnectGoogleBackup`, `ensureNativePlatform`, `getGoogleBackupState`, `isBackupDue`, `normalizeState`, `performGoogleBackup`, `pickPreferredBackupFile`, `restoreGoogleBackupJson`, `runGoogleAutoBackupIfDue`, `runGoogleAutoBackupOnDataChange`, `saveState`, `updateGoogleBackupState`
- 變數（2）：`GOOGLE_BACKUP_FILENAME`, `GOOGLE_BACKUP_KEY`
- 類別（0）：無

### `src/ui/services/i18n.service.js`
- 函數（21）：`applyDocumentLanguage`, `applyTemplateParams`, `detectUserLocale`, `getCurrentLocale`, `initLocalePreference`, `isInRuntimeTranslateExcludedZone`, `normalizeLocale`, `processElementAttributes`, `processNodeTree`, `processTextNode`, `readLocale`, `safelyStartRuntimeDomTranslator`, `setLocale`, `shouldRefreshOriginalValue`, `shouldSkipTextNode`, `startRuntimeDomTranslator`, `syncRuntimeDomTranslations`, `translateRuntimeText`, `translateTextByLocale`, `useI18n`, `writeLocale`
- 變數（16）：`DEFAULT_LOCALE`, `ENABLE_RUNTIME_DOM_TRANSLATOR`, `MESSAGES`, `RUNTIME_EN_EXACT`, `RUNTIME_EN_PHRASE_REPLACEMENTS`, `RUNTIME_EN_REPLACEMENTS`, `RUNTIME_EN_TEXT`, `STORAGE_KEY`, `SUPPORTED_LOCALES`, `domTranslatorObserver`, `isSyncingRuntimeDomTranslations`, `localeRef`, `originalAttrsByElement`, `originalTextByNode`, `runtimeReplacementEntries`, `translatableAttributeNames`
- 類別（0）：無
- 補充：手動 `RUNTIME_EN_TEXT` / `RUNTIME_EN_REPLACEMENTS` / `MESSAGES.ja` 會覆蓋 generated 文案；同一物件內不可保留重複 key，且 `RUNTIME_EN_TEXT` 與 `RUNTIME_EN_REPLACEMENTS` 若有相同 key，應只保留前者。

### `src/ui/services/runtime-en-exact.generated.js`
- 函數（0）：無
- 變數（1）：`RUNTIME_EN_TEXT_EXACT_GENERATED`
- 類別（0）：無

### `src/ui/services/runtime-en-phrases.generated.js`
- 函數（0）：無
- 變數（1）：`RUNTIME_EN_TEXT_GENERATED`
- 類別（0）：無

### `src/ui/services/theme.service.js`
- 函數（20）：`applyPalette`, `applyPreference`, `applyPrimary`, `applyThemeColor`, `applyThemeScheme`, `contrastText`, `getCurrentThemePreference`, `getDefaultThemeColor`, `getScheme`, `hexToRgb`, `listThemeSchemes`, `loadThemeColor`, `normalizeHex`, `readPreference`, `resetThemeColor`, `rgbToHex`, `saveThemeColor`, `saveThemeScheme`, `tint`, `writePreference`
- 變數（4）：`DEFAULT_SCHEME_ID`, `LEGACY_PRIMARY_KEY`, `STORAGE_KEY`, `THEME_SCHEMES`
- 類別（0）：無

### `src/ui/services/webdav-backup.service.js`
- 函數（28）：`assertLedgerId`, `base64EncodeUtf8`, `buildAuthHeader`, `buildBackupFilename`, `buildDefaultState`, `buildLegacyBackupFilename`, `buildRemoteDirUrl`, `buildUploadUrl`, `connectWebdavBackup`, `decodeXmlText`, `disconnectWebdavBackup`, `downloadJsonFromWebdav`, `ensureRemoteDirExists`, `filenameFromHref`, `getWebdavBackupState`, `isBackupDue`, `listWebdavBackupFilenames`, `listWebdavBackupFilenamesByDirectoryGet`, `normalizeEndpoint`, `normalizeRemoteDir`, `normalizeState`, `performWebdavBackup`, `requestWebdav`, `restoreWebdavBackupJson`, `runWebdavAutoBackupIfDue`, `runWebdavAutoBackupOnDataChange`, `updateWebdavBackupState`, `uploadJsonToWebdav`
- 變數（2）：`WEBDAV_BACKUP_KEY`, `WEBDAV_REQUEST_TIMEOUT_MS`
- 類別（0）：無

### `src/ui/stores/account.store.js`
- 函數（0）：無
- 變數（1）：`useAccountStore`
- 類別（0）：無

### `src/ui/stores/addon-template.store.js`
- 函數（0）：無
- 變數（1）：`useAddonTemplateStore`
- 類別（0）：無

### `src/ui/stores/budget.store.js`
- 函數（0）：無
- 變數（1）：`useBudgetStore`
- 類別（0）：無

### `src/ui/stores/category.store.js`
- 函數（1）：`buildCategoryGroupsByKind`
- 變數（1）：`useCategoryStore`
- 類別（0）：無

### `src/ui/stores/ledger.store.js`
- 函數（0）：無
- 變數（2）：`ACTIVE_LEDGER_KEY`, `useLedgerStore`
- 類別（0）：無

### `src/ui/stores/loan.store.js`
- 函數（0）：無
- 變數（1）：`useLoanStore`
- 類別（0）：無

### `src/ui/stores/reimbursement.store.js`
- 函數（0）：無
- 變數（1）：`useReimbursementStore`
- 類別（0）：無

### `src/ui/stores/transaction.store.js`
- 函數（0）：無
- 變數（1）：`useTransactionStore`
- 類別（0）：無

### `src/ui/stores/ui.store.js`
- 函數（0）：無
- 變數（1）：`useUiStore`
- 類別（0）：無

### `src/ui/utils/addon-note.js`
- 函數（8）：`addonDeltaMajorFromNote`, `addonDeltaTagText`, `formatAmount`, `mergeAddonItemsToNote`, `normalizeDirection`, `parseAddonItemsFromNote`, `parseSummaryLine`, `round2`
- 變數（1）：`ADDON_NOTE_PREFIX`
- 類別（0）：無

### `src/ui/utils/fa-icon-options.js`
- 函數（1）：`normalizeFaIcon`
- 變數（7）：`ACCOUNT_ICON_OPTIONS`, `CATEGORY_ICON_OPTIONS`, `accountIconOptions`, `categoryIconOptions`, `defaultAccountIcon`, `defaultCategoryExpenseIcon`, `defaultCategoryIncomeIcon`
- 類別（0）：無

### `src/ui/views/AiAutoBookkeepingPage.vue`
- 函數（7）：`applyDraft`, `parseText`, `submit`, `toDateInput`, `toOccurredAtIso`, `toggleVoiceInput`, `waitFor`
- 變數（19）：`accountStore`, `aiStatusText`, `categoryGroupsByType`, `categoryStore`, `hasDraft`, `hasInputText`, `isPageLeaving`, `model`, `pageRef`, `parsing`, `showAiStatus`, `sourceText`, `speechLanguage`, `speechLiveText`, `submitting`, `transactionStore`, `typeOptions`, `uiStore`, `warnings`
- 類別（0）：無
- 補充：AI 解析後的手動修正表單與 `QuickAddSheet.vue` / `HomeTransactionEditSheet.vue` 保持一致的附加項目與附加條件 UI。

### `src/ui/views/BookkeepingPage.vue`
- 功能：記帳模式容器頁，依路由在 AI 記帳與手動快速新增之間切換。
- 內嵌頁：`src/ui/views/AiAutoBookkeepingPage.vue`、`src/ui/views/QuickAddPage.vue`

### `src/ui/views/AnalysisCategoryDetailPage.vue`
- 函數（19）：`accountName`, `categoryIconOfTransaction`, `categoryKeyOf`, `dateKeyOf`, `dateLabelOf`, `ensureReferenceData`, `formatTime`, `goBack`, `labelOf`, `labelOfTransaction`, `loadStatsTransactions`, `loanTransactionIcon`, `loanTransactionLabel`, `monthKeyFromDate`, `normalizedAmountMinor`, `openTransaction`, `parseMode`, `parseMonthKey`, `parseYear`
- 變數（25）：`accountStore`, `activeCategoryLabel`, `activeTypeLabel`, `analysisType`, `categoryId`, `categoryNameMap`, `categoryRatioText`, `categoryStore`, `categoryTotalMinor`, `categoryTransactions`, `groupedCategoryTransactions`, `ledgerStore`, `loanStore`, `mode`, `queryCategoryLabel`, `rangeLabel`, `referenceLedgerId`, `route`, `router`, `selectedMonth`, `selectedYear`, `statsTransactions`, `typeTotalMinor`, `typeTransactions`, `uiStore`
- 類別（0）：無

### `src/ui/views/AnalysisPrintPage.vue`
- 函數（10）：`dayKeyFromDate`, `exportCsv`, `monthKeyFromDate`, `openExportLink`, `parseMode`, `pickDay`, `pickEndDay`, `pickMonth`, `pickStartDay`, `pickYear`
- 變數（15）：`endDate`, `exportedActionLabel`, `exportedFilename`, `exportedIsDeviceLink`, `exportedLocation`, `exportedUrl`, `exporting`, `ledgerStore`, `mode`, `route`, `selectedDay`, `selectedMonth`, `selectedYear`, `startDate`, `uiStore`
- 類別（0）：無

### `src/ui/views/CalendarPage.vue`
- 函數（17）：`accountNameOfTransaction`, `addonDeltaMajor`, `addonDeltaTag`, `dateKeyFromDate`, `dateKeyFromIso`, `formatMinor`, `formatTime`, `goNextMonth`, `goPrevMonth`, `loadMonthTransactions`, `loanTransactionIcon`, `monthKeyFromDate`, `openTx`, `selectDay`, `showAddonDeltaTag`, `txIcon`, `txLabel`
- 變數（16）：`accountStore`, `calendarCells`, `categoryStore`, `currentMonth`, `dailyMap`, `ledgerStore`, `loanStore`, `monthLabel`, `monthTransactions`, `router`, `selectedDateKey`, `selectedDayExpenseMinor`, `selectedDayIncomeMinor`, `selectedDayTransactions`, `uiStore`, `weekLabels`
- 類別（0）：無

### `src/ui/views/IconPickerPage.vue`
- 函數（5）：`buildBaseQuery`, `goBack`, `pick`, `queryText`, `safeNavigate`
- 變數（8）：`currentValue`, `options`, `picking`, `route`, `router`, `scope`, `scopeLabel`, `uiStore`
- 類別（0）：無

### `src/ui/views/TransactionAboutPage.vue`
- 函數（15）：`accountName`, `categoryIcon`, `categoryIconOfTransaction`, `categoryName`, `closeEdit`, `formatTime`, `goBack`, `handleSaved`, `labelOfTransaction`, `load`, `loanTransactionIcon`, `loanTransactionLabel`, `openEdit`, `relationAccountText`, `transactionTypeLabel`
- 變數（19）：`accountStore`, `allTransactions`, `categoryStore`, `editingTx`, `hasAnyRelation`, `isEditOpen`, `ledgerStore`, `loading`, `loanRelated`, `loanStore`, `reimbursementSettledTx`, `reimbursementSourceTx`, `relationRows`, `route`, `router`, `transaction`, `transferRelated`, `txId`, `uiStore`
- 類別（0）：無

### `src/ui/views/TransactionSearchPage.vue`
- 函數（21）：`accountIcon`, `accountName`, `addonDeltaMajor`, `addonDeltaTag`, `categoryIcon`, `categoryName`, `clearTxIdQuery`, `dayEndMs`, `dayStartMs`, `formatTime`, `labelOfTransaction`, `loadTransactions`, `loanTransactionIcon`, `loanTransactionLabel`, `normalizeTxId`, `openEdit`, `parseLocalDateTime`, `pickEndDay`, `pickStartDay`, `showAddonDeltaTag`, `tryOpenPendingTransaction`
- 變數（13）：`accountStore`, `categoryStore`, `endDay`, `filteredTransactions`, `keyword`, `ledgerStore`, `loanStore`, `pendingOpenTxId`, `route`, `router`, `startDay`, `transactions`, `uiStore`
- 類別（0）：無

### `src/ui/views/WelcomePage.vue`
- 函數（5）：`createFirstAccount`, `createFirstLedger`, `goNextStep`, `goPrevStep`, `pickLanguage`
- 變數（15）：`accountCurrencyCodeInput`, `accountGroupNameInput`, `accountNameInput`, `accountStore`, `canCreateAccount`, `canGoNext`, `creatingAccount`, `creatingLedger`, `hasAccounts`, `hasLedgers`, `ledgerNameInput`, `ledgerStore`, `router`, `step`, `uiStore`
- 類別（0）：無

### `src/ui/views/accounts/AccountDetailPage.vue`
- 函數（20）：`addonDeltaMajor`, `addonDeltaTag`, `categoryIconOfTransaction`, `clearIconQuery`, `closeDeleteConfirm`, `confirmRemoveAccountRecord`, `dateKeyOf`, `dateLabelOf`, `formatTime`, `labelOfTransaction`, `loanTransactionIcon`, `loanTransactionLabel`, `openEdit`, `openIconPicker`, `persistPickedIcon`, `queryText`, `refreshTransactions`, `removeAccountRecord`, `saveProfile`, `showAddonDeltaTag`
- 變數（32）：`account`, `accountCurrencyCode`, `accountGroupName`, `accountId`, `accountName`, `accountStore`, `accountTransactions`, `backLink`, `canSave`, `categoryStore`, `currentAccountBalanceMinor`, `deleteConfirmOpen`, `deleting`, `editCurrencyCode`, `editGroupId`, `editIcon`, `editName`, `editOpening`, `groupOptions`, `groupedAccountTransactions`, `iconSaving`, `initializedAccountId`, `isEditMode`, `ledgerStore`, `loanStore`, `openingInvalid`, `refreshing`, `route`, `router`, `saving`, `transactions`, `uiStore`
- 類別（0）：無

### `src/ui/views/accounts/AssetAccountGroupDetailPage.vue`
- 函數（6）：`clampOrder`, `closeDeleteConfirm`, `confirmRemoveGroupRecord`, `moveItem`, `removeGroupRecord`, `saveOrder`
- 變數（15）：`accountStore`, `canSave`, `currentOrder`, `deleteConfirmOpen`, `deleting`, `group`, `groupId`, `groupTypeLabel`, `orderInput`, `orderInvalid`, `parsedOrderInput`, `route`, `router`, `saving`, `uiStore`
- 類別（0）：無

### `src/ui/views/accounts/AssetAccountManagementPage.vue`
- 函數（18）：`accountItemsByGroup`, `addAccount`, `addAccountFromHeader`, `addGroup`, `clearAccountDialogQuery`, `closeAccountDialog`, `closeGroupDialog`, `expandedStateStorageKeyForLedger`, `isGroupExpanded`, `onAccountSortEnd`, `openAccountIconPicker`, `persistExpandedGroupState`, `queryText`, `readExpandedGroupState`, `setAccountItems`, `submitAccountDialog`, `submitGroupDialog`, `toggleGroup`
- 變數（20）：`accountCurrencyCodeInput`, `accountDialogOpen`, `accountIconInput`, `accountItemsMap`, `accountNameInput`, `accountOpeningInput`, `accountOpeningInvalid`, `accountStore`, `accountTargetGroupId`, `expandedGroupIds`, `expandedInitialized`, `expandedStateStorageKey`, `groupDialogOpen`, `groupNameInput`, `groupOptions`, `groupSummaries`, `ledgerStore`, `route`, `router`, `uiStore`
- 類別（0）：無

### `src/ui/views/analysis.vue`
- 函數（7）：`buildBreakdown`, `buildPieStyle`, `loadStatsTransactions`, `monthKeyFromDate`, `openCategoryDetail`, `pickMonth`, `pickYear`
- 變數（26）：`activeBreakdown`, `activeCount`, `activePieStyle`, `activeTotalMinor`, `activeTypeLabel`, `analysisType`, `categoryNameMap`, `categoryStore`, `expenseBreakdown`, `expenseCount`, `expensePalette`, `expensePieStyle`, `expenseTotalMinor`, `incomeBreakdown`, `incomeCount`, `incomePalette`, `incomePieStyle`, `incomeTotalMinor`, `ledgerStore`, `mode`, `printLink`, `router`, `selectedMonth`, `selectedYear`, `statsTransactions`, `uiStore`
- 類別（0）：無

### `src/ui/views/assets.vue`
- 函數（8）：`accountsByGroup`, `balanceOf`, `expandedStateStorageKeyForLedger`, `goLoans`, `isGroupExpanded`, `persistExpandedGroupState`, `readExpandedGroupState`, `toggleGroup`
- 變數（12）：`accountStore`, `balanceMetrics`, `disposableMinor`, `expandedGroupIds`, `expandedInitialized`, `expandedStateStorageKey`, `groupSummaries`, `groupedAccounts`, `ledgerStore`, `liabilityMinor`, `loanStore`, `router`
- 類別（0）：無

### `src/ui/views/budgeting.vue`
- 函數（新增重點）：`goPreviousPeriod`, `goCurrentPeriod`, `goNextPeriod`, `copyPreviousMonth`, `openCreate`, `openEdit`, `saveItem`, `removeItem`
- 變數（新增重點）：`budgetStore`, `categoryStore`, `isPayCycleMode`, `periodLabel`, `nextPayDayLabel`, `deleteDialogOpen`, `isSheetOpen`, `uiStore`
- 類別（0）：無
- 補充：月摘要新增保留金額；SMB-269 後若帳本使用發薪週期模式，頁首改顯示目前週期起訖日、上一期 / 本期 / 下一期與下次發薪日，並隱藏曆月 range picker 與複製上月入口；SMB-271 後，預算項目與共同池 sheet 儲存時會在 `saveItem` / `saveContainer` 先後協調預算資料與 ledger-level 期間設定，新建時先套用新週期再建立，編輯時先保存目前 row 再套用週期，最後重新載入目前帳本預算期間；SMB-273 後 app 回前景 / focus / visibility visible 會重新載入今天的預算期間，因此發薪日 00:00 後預算頁與首頁預算卡都會自動顯示新週期；分類預算列改為整列點擊先開唯讀詳情，再從詳情進入編輯 / 刪除；項目上的日結轉 / 月底結轉 chip 與 `A -> B` 來源 / 目標摘要改成同一行；整期總額預算存款也拆成摘要列 -> 詳情 sheet -> 設定 sheet 三段式流程，來源 / 目標帳戶同樣沿用快速新增的分組式 account picker。
- **(v1.0.9)**：頁面頂部新增 `header.row` 包含標題與 `RouterLink.btn.back-btn` 返回首頁（`/`）

### `src/ui/views/home.vue`
- 函數（12）：`applyMonthInput`, `dateKeyFromDate`, `goCurrentRange`, `localeRangeMonth`, `monthKeyFromDate`, `openQuickAdd`, `pickDay`, `pickMonth`, `pickYear`, `switchFilterMode`, `switchQuickAddMode`, `syncHomeTransactions`
- 變數（14）：`budgetStore`, `currentRangeLabel`, `displayRange`, `filterMode`, `filterModes`, `isSheetOpen`, `ledgerStore`, `quickAddMode`, `quickAddType`, `selectedDay`, `selectedMonth`, `selectedYear`, `transactionStore`, `uiStore`
- 類別（0）：無

### `src/ui/views/loans/LoanCounterpartyDetailPage.vue`
- 函數（10）：`canRepay`, `closeRepaySheet`, `markVoid`, `normalizeCounterpartyName`, `openRepaySheet`, `showDetail`, `statusLabel`, `submitRepayment`, `syncFinishedFromRoute`, `syncTabFromRoute`
- 變數（19）：`accountStore`, `activeCount`, `backLink`, `budgetStore`, `counterpartyName`, `defaultAccountId`, `loanStore`, `loansByCounterpartyAndTab`, `outstandingMinor`, `repayForm`, `repayLoan`, `repayOpen`, `route`, `showFinished`, `summaryLabel`, `tab`, `transactionStore`, `uiStore`, `visibleLoans`
- 類別（0）：無

### `src/ui/views/loans/LoanListPage.vue`
- 函數（7）：`closeCreateSheet`, `createLoan`, `normalizeCounterpartyName`, `openCounterpartyDetail`, `openCreateSheet`, `syncFinishedFromRoute`, `syncTabFromRoute`
- 變數（16）：`accountStore`, `budgetStore`, `counterpartyGroups`, `createForm`, `createOpen`, `defaultAccountId`, `directionOptions`, `loanStore`, `loansByTab`, `route`, `router`, `showFinished`, `tab`, `transactionStore`, `uiStore`, `visibleLoans`
- 類別（0）：無

### `src/ui/views/reimbursements/ReimbursementListPage.vue`
- 函數（6）：`closeSettle`, `confirmSettle`, `formatTime`, `markPending`, `markVoid`, `openSettle`
- 變數（11）：`accountStore`, `activeList`, `copyLedgerOptions`, `isSettleOpen`, `ledgerStore`, `reimbursementStore`, `settleForm`, `settleTargetTx`, `tab`, `transactionStore`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsAboutPage.vue`
- 函數（0）：無
- 變數（1）：`privacyPolicyUrl`
- 類別（0）：無

### `src/ui/views/settings/SettingsAddonTemplatePage.vue`
- 函數（6）：`addItem`, `cloneItems`, `removeItem`, `resetDefaults`, `saveItems`, `syncDraftFromStore`
- 變數（7）：`addonTemplateStore`, `directionOptions`, `draftItems`, `ledgerStore`, `saving`, `seq`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsAutoBackupPage.vue`
- 函數（15）：`backupNowToGoogle`, `backupNowToWebdav`, `connectGoogle`, `connectWebdav`, `disconnectGoogle`, `disconnectWebdav`, `errorMessage`, `formatBackupTime`, `refreshGoogleBackupState`, `refreshWebdavBackupState`, `restoreCheckHint`, `restoreFromGoogle`, `restoreFromWebdav`, `saveGoogleBackupSettings`, `saveWebdavBackupSettings`
- 變數（27）：`googleAutoEnabled`, `googleBackingUpNow`, `googleBackupState`, `googleConnecting`, `googleDataChangeAutoEnabled`, `googleDisconnecting`, `googleIntervalHours`, `googleIntervalOptions`, `googleRestoringNow`, `googleSavingSettings`, `isWorking`, `ledgerStore`, `uiStore`, `webdavAutoEnabled`, `webdavBackingUpNow`, `webdavBackupState`, `webdavConnecting`, `webdavDataChangeAutoEnabled`, `webdavDisconnecting`, `webdavEndpointInput`, `webdavIntervalHours`, `webdavIntervalOptions`, `webdavPasswordInput`, `webdavRemoteDirInput`, `webdavRestoringNow`, `webdavSavingSettings`, `webdavUsernameInput`
- 類別（0）：無

### `src/ui/views/settings/SettingsCategoryDetailPage.vue`
- 函數（6）：`closeDeleteConfirm`, `confirmRemoveCategoryRecord`, `openIconPicker`, `queryText`, `removeCategoryRecord`, `saveProfile`
- 變數（17）：`backLink`, `canSave`, `category`, `categoryId`, `categoryKind`, `categoryStore`, `deleteConfirmOpen`, `deleting`, `editGroupId`, `editIcon`, `editName`, `groupOptions`, `initializedCategoryId`, `route`, `router`, `saving`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsCategoryGroupDetailPage.vue`
- 函數（7）：`clampOrder`, `closeDeleteConfirm`, `confirmRemoveGroupRecord`, `moveItem`, `queryText`, `removeGroupRecord`, `saveOrder`
- 變數（18）：`backLink`, `canSave`, `categoryStore`, `currentOrder`, `deleteConfirmOpen`, `deleting`, `group`, `groupId`, `groupKind`, `groupsByKind`, `kindLabel`, `orderInput`, `orderInvalid`, `parsedOrderInput`, `route`, `router`, `saving`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsCategoryPage.vue`
- 函數（15）：`addCategory`, `addCategoryForGroup`, `addGroup`, `categoriesByGroup`, `categoryItemsByGroup`, `clearCategoryDialogQuery`, `closeCategoryDialog`, `closeGroupDialog`, `groupNameById`, `onCategorySortEnd`, `openCategoryIconPicker`, `queryText`, `setCategoryItems`, `submitCategoryDialog`, `submitGroupDialog`
- 變數（16）：`activeKind`, `categoryDialogOpen`, `categoryGroupIdInput`, `categoryGroupLockedId`, `categoryIconInput`, `categoryItemsMap`, `categoryNameInput`, `categoryStore`, `filteredCategories`, `filteredGroups`, `groupDialogOpen`, `groupNameInput`, `groupOptions`, `route`, `router`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsDataManagementPage.vue`
- 函數（12）：`clearResetTimer`, `closeResetConfirm`, `confirmResetAllData`, `exportCsv`, `exportJson`, `importIntegrityHint`, `onImportCsvFile`, `onImportJsonFile`, `onRequestCloseOverlay`, `openResetConfirm`, `readFileAsText`, `refreshAllStores`
- 變數（18）：`accountStore`, `budgetStore`, `categoryStore`, `csvImportType`, `csvImportTypeOptions`, `csvInputRef`, `isResetConfirmOpen`, `jsonInputRef`, `lastExportPath`, `ledgerStore`, `loanStore`, `reimbursementStore`, `resetConfirmLabel`, `resetCountdown`, `resetTimerId`, `resettingAllData`, `transactionStore`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsDeveloperDebugPage.vue`
- 函數（3）：`formatDuration`, `patchSnapshot`, `refresh`
- 變數（13）：`bankSyncCalls`, `einvoiceCalls`, `errorLogs`, `loading`, `playCalls`, `playSupported`, `snapshot`, `txFailures`, `unsubscribe`, `unsubscribeBankSyncTrace`, `unsubscribeEInvoiceTrace`, `unsubscribeErrorLog`, `unsubscribePlayTrace`, `unsubscribeTxFailureTrace`
- 類別（0）：無
- **SMB-172**：新增載具（電子發票）抓取紀錄區塊；使用 `einvoice-debug.service.js` 追蹤 `scrape` 和 `import` 兩種操作，顯示手機號碼（末4位遮蔽）、查詢日期區間、狀態、抓取/匯入/跳過/失敗筆數、錯誤訊息；export payload 也一併包含 `einvoice_calls`
- **SMB-220**：新增 Error Log 紀錄區塊；使用 `error-log.service.js` 的 `subscribeErrorLog` 即時顯示 Vue 元件錯誤、window 錯誤、unhandled rejection 與 toast 彈窗錯誤（最多 100 筆）；export payload 包含 `error_logs`

### `src/ui/views/settings/SettingsLanguagePage.vue`
- 函數（1）：`pickLanguage`
- 變數（2）：`currentLabel`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsLedgerDetailPage.vue`
- 函數（4）：`closeDeleteConfirm`, `confirmRemoveLedgerRecord`, `removeLedgerRecord`, `saveLedgerName`
- 變數（11）：`canSave`, `deleteConfirmOpen`, `deleting`, `ledger`, `ledgerId`, `ledgerNameInput`, `ledgerStore`, `route`, `router`, `saving`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsLedgerPage.vue`
- 函數（4）：`closeDialog`, `createLedger`, `onLedgerSortEnd`, `submitDialog`
- 變數（7）：`canCreateLedger`, `dialogMode`, `ledgerItems`, `ledgerNameInput`, `ledgerStore`, `showFreeLimitHint`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsMembershipBenefitsPage.vue`
- 函數（8）：`ensureDollarPrefix`, `loadProductPrices`, `openSubscriptionManagement`, `redeemPromoCode`, `refreshMembershipState`, `restorePurchases`, `subscribe`, `toErrorMessage`
- 變數（16）：`canUsePlayStore`, `compareRows`, `currentPlanLabel`, `currentTier`, `isBusy`, `lifetimePriceLabel`, `loadingPrices`, `monthlyPriceLabel`, `openingManage`, `playStoreSupported`, `priceDisplay`, `redeemCode`, `redeeming`, `restoring`, `submittingPlan`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsPersonalizationPage.vue`
- 函數（10）：`applyColor`, `normalizeHex`, `pickPreset`, `pickScheme`, `previewStyleOf`, `resetColor`, `saveTheme`, `schemeDescription`, `schemeName`, `schemePrimaryOf`
- 變數（6）：`initialTheme`, `presets`, `primary`, `schemes`, `selectedSchemeId`, `uiStore`
- 類別（0）：無

### `src/ui/views/settings/SettingsVersionInfoPage.vue`
- 函數（0）：無
- 變數（1）：`version`
- 類別（0）：無

### `src/ui/views/settings.vue`
- 函數（0）：無
- 變數（1）：`settingItems`
- 類別（0）：無

---

## 電子發票匯入 (E-Invoice Import) — v1.0.6（SMB-165 v1.2.13：匯入時可選帳戶/分類同步建立支出交易，transaction_id 寫回匯入記錄；SMB-209 Restart / v1.2.16：刪除舊 WebView/OCR 查詢入口，改由 backend `/api/einvoice/query-invoices` 代理財政部官方 API；Step 1 改為手機條碼 + 查詢碼，Step 2 保留日期區間且預設最近 62 天以符合後端單次查詢上限，查詢階段支援取消 / 重試 / 逾時 / 失敗狀態；SMB-209 Restart / v1.2.20：手機條碼驗證允許 `/` 後 7 碼使用英數字與 `+ . -` 符號，修復合法條碼無法點擊下一步；SMB-209 Restart / v1.2.23：Step 1 行內驗證錯誤訊息（格式不符 / 查詢碼過短）、normalizeBarcode 修正去除內部空白；SMB-209 Restart / v1.2.25：Step 1 依技術文檔補上清除已儲存載具資料入口；SMB-226 / v1.3.3：載具名稱顯示與匯入交易標籤重建）

### 路由
- `/einvoice-import` → `src/ui/views/einvoice/EInvoiceImportWizardPage.vue`

### 新增檔案

#### `src/core/db/migrations/032_einvoice_import.sql`
- 建立 `einvoice_credentials` 資料表（加密帳密儲存，含手機與密碼各自 IV）
- 建立 `einvoice_invoice_imports` 資料表（發票匯入記錄，UNIQUE on invoice_number）

#### `src/core/db/migrations/033_einvoice_credential_password_iv.sql`
- **SMB-174 (v1.0.13)**：既有資料庫補上 `einvoice_credentials.password_iv`，讓密碼加密 IV 不再被手機號碼 IV 覆蓋

#### SMB-209 刪除的舊電子發票 Android WebView/OCR 自動化
- 已刪除 `android/app/src/main/java/com/strawcoding/strawmoneybook/EInvoiceAutomationActivity.java`
- 已刪除 `android/app/src/main/java/com/strawcoding/strawmoneybook/EInvoiceAutomation.java`
- 已刪除 `android/app/src/main/java/com/strawcoding/strawmoneybook/EInvoiceAutomationPlugin.java`
- 已刪除 `android/app/src/test/java/com/strawcoding/strawmoneybook/EInvoiceAutomationTest.java`
- 已刪除 `scripts/simulate-einvoice-login-flow.mjs` 與 `package.json` 的 `simulate:einvoice-login` / smoke test 串接
- `TesseractBridge.java` 因第一銀行自動化仍使用而保留，但電子發票流程不再呼叫 OCR / WebView / CAPTCHA 相關程式碼

#### `src/core/repositories/einvoice-import.repo.js`
- 函數（5）：`getEInvoiceCredential`, `upsertEInvoiceCredential`, `deleteEInvoiceCredential`, `getImportedInvoiceNumbers`, `insertInvoiceImport`, `listRecentInvoiceImports`
- `upsertEInvoiceCredential` 會保存 `passwordIv`；`getEInvoiceCredential` 讀回 `passwordIv`，舊資料缺值時才 fallback 到 `iv`

#### `src/services/einvoice/shared.js`
- 常數：`EINVOICE_PLATFORM`（舊 `EINVOICE_STATUS` 發票狀態篩選已移除）
- 函數：`createEInvoiceError`, `isEInvoiceError`, `buildCarrierTagsJson`（SMB-226 / v1.3.3：載具名稱 → `tags_json` JSON 陣列字串）

#### `src/services/einvoice/credential-crypto.js`
- AES-256-GCM 加密/解密，PBKDF2 金鑰衍生（100,000 迭代）
- 函數：`encryptCredential`, `decryptCredential`

#### `src/services/einvoice/native-automation.js`（SMB-168, v1.0.8）
- SMB-209 刪除舊方案後保留相容 stub：`isEInvoiceAutomationRuntimeSupported()` 固定回傳 false；`queryNativeEInvoices()` 為 no-op error stub，不再註冊或呼叫電子發票 Android WebView / OCR 插件

#### `src/services/einvoice/backend.js`
- 函數（6）：`saveEInvoiceCredential`, `loadEInvoiceCredential`, `clearEInvoiceCredential`, `hasEInvoiceCredential`, `scrapeEInvoiceList`, `importSelectedInvoices`
- `scrapeEInvoiceList()` 以 fetch 呼叫 `/api/einvoice/query-invoices`（native / production 預設 `https://api.strawmb.com`，開發 web 可走相對路徑），送出 `cardNo`、`cardEncrypt`、`startDate`、`endDate`；35 秒前端逾時會轉成 `einvoice_query_timeout`
- **SMB-226 / v1.3.3**：`importSelectedInvoices()` 同步建立支出交易時，透過 `buildCarrierTagsJson(invoice.carrierName)` 把載具名稱寫入 `createExpense` 的 `tagsJson`

#### `src/ui/stores/einvoice-import.store.js`
- Pinia store：精靈狀態、手機條碼 / 查詢碼、日期區間、抓取 generation token、取消 / 逾時 / 失敗狀態、選取邏輯、匯入結果；舊 `invoiceStatus` 狀態已移除

#### `src/ui/views/einvoice/EInvoiceImportWizardPage.vue`
- 4 步驟精靈容器，含步驟指示器、返回按鈕（`fa-chevron-left` 全域註冊）與滑動動畫

#### `src/ui/views/einvoice/EInvoiceStep1Account.vue`
- 手機條碼 / 查詢碼輸入、查詢碼顯示切換（`fa-eye` / `fa-eye-slash` 全域註冊）、記住帳號（加密儲存）；手機條碼驗證接受 `/` 後 7 位英數字或 `+ . -` 符號，避免財政部合法條碼因前端 regex 過窄而讓下一步保持 disabled；載入既有加密載具資料時會顯示清除入口，呼叫 `clearEInvoiceCredential()` 後清空手機條碼 / 查詢碼並關閉記住載具，讓使用者可依技術文檔要求主動刪除本機儲存資料；版面採自然高度與緊湊 footer，避免帳號設定卡片下方留下過多空白
- **SMB-167 (v1.0.9)**：step-footer 補上「上一步」按鈕，與 Step2–4 pattern 對齊；點擊執行 `store.reset()` + `router.back()` 退出 wizard

#### `src/ui/views/einvoice/EInvoiceStep2Query.vue`
- 查詢條件：日期區間；舊 WebView 查詢頁專屬的發票狀態、統編、品名關鍵字已移除；預設最近 62 天符合 backend 單次查詢上限
- SMB-209 後不再檢查 Android native 平台支援，Web / 行動版皆走 backend API 查詢

#### `src/ui/views/einvoice/EInvoiceStep3Select.vue`
- 發票清單、全選/單選、已選金額彙總
- **問題審查修復 (v1.0.22)**：`onMounted` 中 `store.errorMessage = ''` 移到 early-return 之前，修正 Step 4 匯入失敗後回到 Step 3 仍顯示錯誤畫面的問題；「上一步」改呼叫 `goBack()` 同時清空 `invoiceList`，修正回到 Step 2 修改查詢條件後 Step 3 仍顯示舊清單的問題。
- **載具流程修復 (v1.0.24)**：`onMounted` 加入 `if (store.isScraping) return` 防護，避免快速來回切換步驟時觸發並發 scrape race condition；補充 console.log 記錄抓取開始/完成/失敗。
- **SMB-209 (v1.2.14)**：刪除無名四點式舊精靈呈現，改為「帳號驗證 / 查詢條件 / 抓取發票 / 確認匯入」命名階段；抓取階段改由 `scrapeStatus` state machine 管理 idle / running / done / failed / cancelled / timeout，提供取消、重試、修改查詢條件按鈕與三語錯誤文案；`scrapeGeneration` token 會丟棄已取消或被新查詢取代的晚回結果，修改查詢條件時清空發票清單與選取狀態，避免新舊資料混用。
- **SMB-226 / v1.3.3**：發票卡片新增 `.carrier-chip`（`fa-receipt` 圖示 + `carrierName`），讓使用者可辨識每筆發票所屬載具

#### `src/ui/views/einvoice/EInvoiceStep4Confirm.vue`
- 匯入預覽、確認匯入、結果顯示
- **SMB-226 / v1.3.3**：預覽列新增 `.preview-carrier` pill，顯示待匯入發票的載具名稱
- **問題審查修復 (v1.0.22)**：結果畫面新增 `failed` 筆數顯示（`v-if="store.importResult.failed.length > 0"`，橘色警示文字）；`i18n.service.js` 同步新增 `einvoice.step4.result_failed` 三語翻譯。
- **載具流程修復 (v1.0.24)**：匯入失敗時改以本地 `importError` ref 在 Step4 原地顯示錯誤，不再 `store.errorMessage + store.currentStep = 3`（舊做法導致跳回 Step3 時 onMounted 立即清空錯誤訊息，用戶看不到失敗原因）；`handleImport` 加入 `if (store.isImporting) return` JS 層防重複點擊；「上一步」按鈕在匯入中也禁用；補充 console.log 記錄匯入開始/完成/失敗。

#### Android 原生插件（SMB-168 舊電子發票插件；SMB-209 已移除）
- `android/.../EInvoiceAutomationPlugin.java`、`EInvoiceAutomationActivity.java`、`EInvoiceAutomation.java` 與 `EInvoiceAutomationTest.java` 已刪除
- `MainActivity.java` 不再 `registerPlugin(EInvoiceAutomationPlugin.class)`；`AndroidManifest.xml` 不再宣告 `EInvoiceAutomationActivity`
- 保留與電子發票無關、仍由銀行自動化使用的 `TesseractBridge.java`

### 修改檔案
- `src/core/db/migrate.js` — 加入 migration 032，SMB-174 後再加入 migration 033 補 `password_iv`
- `src/ui/views/FeatureListPage.vue` — smb295：進階功能區含共同帳本／帳本同步／銀行同步／載具同步；載具同步標籤取代舊「電子發票匯入」功能列表文案
- `src/ui/router/index.js` — 加入 `/einvoice-import` 路由
- `src/ui/services/i18n.service.js` — 加入 zh-TW / en / ja 翻譯
- `src/main.js` — 電子發票精靈返回按鈕所需 `fa-chevron-left` 與密碼顯示切換所需 `fa-eye` / `fa-eye-slash` 納入 Font Awesome 全域註冊
- `android/.../MainActivity.java` — SMB-209 移除 `registerPlugin(EInvoiceAutomationPlugin.class)`；仍保留銀行、Google、Widget、安全鎖等插件註冊
- `android/.../AndroidManifest.xml` — SMB-209 移除 `EInvoiceAutomationActivity` 宣告；仍保留銀行自動化 Activity
