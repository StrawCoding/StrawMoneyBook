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
- 請款單的導入報銷流程已改為獨立頁面選取，原本建立 / 編輯表單只保留導入按鈕與已選摘要；導入頁可全選或取消全選，新增請款單時會暫存表單內容再回到原建立流程；SMB-150 後導入頁返回不再依賴瀏覽器歷史，而是固定回到原本的新增 / 編輯請款單流程，避免直接跳離請款單

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

這讓它更適合長期使用，而不是短期記帳後就難以維護。

另外，所有需要輸入資料的彈層已統一為共用 bottom sheet flow，桌面與手機都不再保留另一套輸入型 popover，包含表單 dialog、選單、日期與時間選擇器；`AppDialog` 以及各頁自製輸入 sheet 也都收斂到和快速記帳一致的 shared overlay / bottom-sheet primitives，Android 有底部導覽列 inset 的裝置也會一併吃到底部 safe area，且 sheet 卡片背景會直接延伸到底部，和 `BottomNav` 維持同一個底部基準。

SMB-154 / 0.26.5 後，設定首頁的入口副標、帳號卡未登入提示、登入 / 註冊頁與共同帳本頁使用到的主要介面文案，都已改由正式 i18n key 維護，繁中、英文與日文都有對應文案，不再靠繁中 fallback 或 runtime DOM 翻譯處理這批主要設定流程文字。

前端內部像月份鍵、日期鍵這類共用格式化邏輯，也已收斂到 `src/core/utils/id.js`，避免首頁、分析、日曆、列印頁各自維護相同 helper 後再逐步出現行為漂移。

在互動細節上，Android 返回鍵會優先關閉當前 overlay，再決定是否返回頁面或退出 App；關鍵刪除流程也統一採用自製確認對話框，並額外針對行動裝置補強長按連結與文字選取的防誤觸處理。

各功能頁的返回標題列也統一為帳本同步頁的版型：頁面主 header 直接放在頁面容器下，不包進內容 card / block；左側 chevron 返回、標題置中、右側保留等寬空位；新增 / 主要操作按鈕改放在第一個內容卡的 `panel-head` 右側，和存錢罐頁一致。SMB-178 後借貸、報銷、請款單、訂閱、交易搜尋與相關設定子頁的主 header 已移出內容卡片，借貸、請款單、訂閱項目與帳本設定的主要按鈕也已移到內容卡標題列；電子發票精靈頁也改回共用 `.btn.back-btn` 返回鍵樣式，不再以頁面 scoped CSS 覆寫返回鍵尺寸。記帳頁的 AI / 手動模式切換則固定移到標題列下方，避免寬操作按鈕和置中標題重疊。

同時，像借貸清單與往來對象明細這類會用 query 切換「進行中 / 已結束」的同頁狀態，路由也已補上穩定 `transitionKey`，避免只是切換篩選就觸發整頁淡入淡出動畫。

Android 記帳提醒同步目前也已補強 Capacitor Local Notifications plugin proxy 相容性，載入通知插件時不再把 plugin 物件誤當成 thenable 去呼叫 `.then()`，避免在 Android 端拋出 `LocalNotifications.then() is not implemented` 並中斷提醒初始化。

Google Drive 自動備份在重新登入 / 靜默恢復連線成功後，也會同步清掉先前殘留的 `reauth_required` 自動檢查診斷狀態，不會已經重新授權成功了，設定頁還持續顯示「需要重新授權才能自動備份」。

自動備份排程現在也會主動偵測 Google 授權失效（SMB-110 修正）：若用戶已設定自動備份（`autoEnabled` 或有綁定帳號），但靜默取 token 失敗導致 `connected: false`，不再只寫入 `skipped/not_connected`，而是改寫為 `error/reauth_required`，使設定頁能顯示明確的「需要重新授權」警示並提示用戶操作，不再讓自動備份靜默失效。

SMB-142 重建後，自動備份設定頁會在背景自動偵測 / 自動備份完成後即時重讀最近一次 auto-check 狀態與時間，不再因為頁面只在初次載入時抓一次 state 而長時間停留在「尚未執行自動偵測」；手動備份、背景 due check 與資料變更後備份都會先經過同一個 provider runner，回傳 `completed / skipped / error` 統一結果，並以帳本 + provider 為 lock key 避免同時執行互相覆蓋狀態；runtime 事件也會帶上 `ledgerId / provider / mode / status / reason / checkedAt`，讓設定頁能依目前帳本準確重讀；SMB-147 後，Google 自動備份即使在非原生平台被略過，也會保存 `platform_unsupported` 偵測結果並在設定頁明確顯示；Android 靜默恢復未連線時也會繼續跑 due diagnostics，讓 `not_connected / reauth_required / not_due` 等狀態確實落地，不會誤回到「尚未執行自動偵測」；若使用者正在輸入 WebDAV 密碼但尚未儲存，背景同步也不會把該欄位清空。手機 App 啟動、回前景與帳本切換時的 Google 備份恢復只做靜默授權，不會由背景流程自動彈出互動式 Google 登入。SMB-181 後，手動備份失敗時設定頁的錯誤 toast 改顯示原始 `error.message`（可讀的翻譯錯誤訊息）而非 reason code（如 `backup_failed`）；`buildProviderRunResult` 加入 `errorDetail` 欄位，UI 改用 `result.errorDetail` 建立錯誤，避免 `errorMessage()` 把 reason code 誤當使用者可讀文字顯示。

從維護角度來看，前端已採用 View / Store / Service / Repository 分層，資料層則以 Capacitor + SQLite（含 Web / WASM）維持一致模型，讓功能擴充與跨平台維護成本更可控。

帳戶資料載入也會以請求序號與活動帳本再次比對，快速切換帳本時會丟棄較晚回來的舊請求結果，避免資產與帳戶選單短暫顯示前一個帳本的資料。

這條分層在 SMB-130 後又進一步收斂：`core/services/bootstrap.service.js` 現在只保留資料庫初始化與 recover，`ui/services/app-bootstrap.service.js` 接手 Pinia 與啟動鏈，`ui/services/app-runtime.service.js` 接手背景排程、網址恢復、Android back 與同步/備份 runtime side effects，而 `ui/composables/useAppShellRuntime.js` 則把 App shell 的 route transition、高度鎖定、安全鎖 lifecycle 與更新提示從 `App.vue` 抽離。

交易資料流也已統一從頁面抽離：分析頁、交易搜尋、日曆、交易明細、交易編輯與帳戶明細都不再直接查 `transaction.repo.js`，而是透過 `core/services/transaction-query.service.js` 取得 `all / year / month / day / account / detail-related` 查詢結果；分析頁的分類/帳戶彙總、圓餅圖、長條圖與日別 breakdown 集中在 `core/utils/analysis-breakdown.js`，交易搜尋頁的 filter、批量選取、sheet 狀態與結果摘要則集中在 `ui/composables/useTransactionSearchPage.js`。

SMB-155 後，帳戶明細與交易搜尋不再一次載入完整交易歷史，而是以 300 筆為一頁做 SQL 分頁；交易搜尋的日期與關鍵字篩選會先下推到查詢層再取當頁資料，帳戶明細則會額外查詢分頁前交易金額，用來校正每筆交易後餘額，避免第 2 頁以後餘額從錯誤基準開始計算。

會員邏輯也已把 domain 與導頁 side effect 分開：`core/services/membership.service.js` 只保留 entitlement、sync、snapshot 與 limit error 判斷，真正的會員限制導頁改由 `ui/services/membership-navigation.service.js` 處理，避免 core 層再反向依賴 UI router。共同帳本 backend 端則把 `auth` 與 `shared-ledgers` 路由拆成模組化目錄，並由 `backend/src/server.js` 的 route table 分派，`backend/src/collab/http.js` 提供共用 request parsing、method/body guard 與 route error serialization。

共同帳本快照推送會檢查用戶端帶上的 `baseVersion`，包含初始 `version=0` 邊界；密碼登入在鎖定期間會直接回覆鎖定狀態，不再重複累加失敗次數或延長鎖定；忘記密碼若臨時密碼 Email 寄送失敗，會回滾臨時密碼寫入，保留原密碼可用。

另外，新帳本建立後會立即完成預算模組初始化並可正常載入空月預算，不會因預算項目查詢的欄位歧義中斷 onboarding 或帳本切換流程。

Android 發版目前也已把版本碼策略收斂成由語意版號自動推導的單調遞增規則，並保留一段 Play Store 歷史版本碼安全區間，避免 `0.x.y` 這類版本名稱在新版發佈時反而低於舊的商店版本碼；若 release 產物存在 `mapping.txt`，Play 上傳流程也會一起帶上去模糊化檔，降低 Crash / ANR 排查成本。`npm run gpr` 推送版本 tag 後，GitHub Actions 會建置 AAB、建立 GitHub Release，並透過 Fastlane 發布到 Google Play 封閉測試 track；預設 track 是 `alpha`，也可用 GitHub Actions 變數 `PLAY_CLOSED_TESTING_TRACK` 指向其他封閉測試 track。SMB-183 後 `gpr` 在 bump 前先執行 `notes:check` 確認專案根目錄的 `release-notes.pending.md` 已有版本簡介（為空時中止），發版成功後執行 `notes:clear` 清空暫存檔並 push；GitHub Actions 建立 GitHub Release 時也會把暫存檔內容加入 release body，Fastlane 同步填入 Google Play changelog；發佈失敗時暫存檔不會被清空，確保下次發版紀錄不遺失。

另外，CI 的 Android release build 現在也已補上 `frontend/android/gradlew` 的可執行權限，避免 `./gradlew bundleRelease` 在 checkout 後因權限不足直接中斷，讓 bundleRelease 的驗證可以真正跑到 Gradle 階段。Google Play 封閉測試上傳也會針對「Play edit 被外部變更」這類暫時性衝突重開 edit 有限次重試，避免 AAB 已建好卻因 Play Console 或其他發版流程同時修改而直接中斷。

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

首頁是日常使用入口，提供：

- 帳本切換
- 全部 / 年 / 月 / 日 範圍切換
- 當期收支摘要
- 預算摘要
- 交易清單
- 浮動快速記帳按鈕

這代表使用者可以在同一頁完成「看本期狀況 + 直接補帳」。

另外，首頁在「全部」範圍下已改為只先載入最近 3000 筆交易，避免大型帳本一次把全部歷史資料灌進畫面造成明顯卡頓；需要完整歷史資料時，仍以交易搜尋、分析與報表頁的完整查詢為主。

首頁交易流若目前範圍沒有任何資料，現在會顯示明確空狀態與「立即記帳」入口，不再只剩一行靜態文字；空狀態文案透過 i18n 維護，source test 會同時檢查元件 key 與繁中內容，避免國際化後誤判功能消失；預算簡表左右滑動的切頁閾值也已提高，降低垂直捲動時誤切月均 / 當日可用的機率。

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

交易編輯頁保留調整交易的正負金額，負調整不會被轉成正數；跨幣別轉帳若使用手動匯率，無效匯率會在送出前阻擋。

借貸模組現在也支援在借貸明細中調整「建立入帳帳戶」，會直接更新當初建立借入 / 借出時產生的那筆初始交易帳戶，而不會誤改後續還款 / 收款紀錄。

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
- 分類預算項目管理
- 已用 / 剩餘檢視
- 保留金額檢視
- 複製上月預算
- 超支判讀
- 預算剩餘額自動存入存錢罐
- SMB-151 後，預算項目的「日期」分配已改用與首頁查看範圍相同的 `HomeRangePicker` 日期選擇器，並在預算項目情境啟用日曆複選：使用者可在一致的日期 bottom sheet 直接點選多個分配日，系統再轉成每月日號規則，不再只是 1~31 的純數字格或另一套自製月曆，降低選錯分配日期的機率

此外，分類預算不只支援固定月額，還支援更進階的日均規則：

- 依星期規則計算
- 依每月指定日期計算
- 自動算出當月發生次數與已用次數

這種設計比單純「某分類本月 3000 元」更適合餐費、通勤、週期性小額支出。

預算頁的互動也已改成 detail-first：

- 分類預算列整列可點擊，先開唯讀詳情，再從詳情進入編輯或刪除
- 詳情會直接顯示分類、預算模式、金額、已用 / 剩餘、日均規則與預算存款摘要
- 項目上的預算存款摘要改成同一行顯示 `日結轉 / 月底結轉` 與 `A -> B` 來源 / 目標，不再拆成兩段堆疊
- 「整月總額預算存款」主卡片現在先顯示摘要與狀態，點進去先看詳情，再進入設定 sheet

另外，月預算摘要與首頁預算簡表現在都新增「保留金額」：

- 只計算 `daily_average` 項目，不把固定月額算進去
- 以目前檢視月份為基準，即時計算尚未過去規則日的預留額
- 月模式顯示整個月剩餘規則日的保留金額
- 首頁日模式則只顯示「今天之後」尚未到來的日均保留金額，不把今天已生效額度算進去

預算模組現在也能把「真正沒花掉的預算」直接轉進存錢罐，而且分成兩條規則線：

- 分類項目別預算存款：`daily_average` 項目在每個已結束日做日結轉，固定月額項目在月底結轉
- 整月總額預算存款：月底把沒有啟用項目別預算存款的分類剩餘額加總後，轉進指定存錢罐

這個流程的幾個重要特性是：

- 一律以帳本時區判斷，不用裝置目前所在時區
- 日結轉只補到昨天，月結轉只補到上一個完整月份
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
- 收入與支出雙視角
- 分類占比
- 支出分類分析會納入正向附加項目，將手續費、服務費等附加金額拆成獨立分析列，主分類金額會扣除該附加金額以維持總支出一致
- 帳戶彙總
- 細項頁
- 列印 / 匯出頁
- 圓餅圖可直接點擊查看目前最大分類 / 帳戶明細，並提供 hover / press 回饋
- 圓餅圖尺寸會隨較窄螢幕縮放，避免固定 220px 在小裝置失衡

報表輸出除了 CSV，也支援列印版面與 PDF 流程，適合：

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

這讓使用者能把零散的報銷彙整成真正可提交的請款資料。請款單完成後，匯入的原報銷交易會被視為已報銷，報銷清單、資產頁未報銷金額與狀態同步邏輯都會採用同一個已完成請款單來源；若請款單還原後再次完成，先前軟刪的入帳交易也會釋放冪等鍵，避免同一張請款單重新入帳時撞到唯一鍵。

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

訂閱扣款日以當天開始為扣款時間點；一進入扣款日就會視為本期已到期，列表中的「下次扣款」也會推進到下一個週期，不會等到該日結束後才更新。排程日期會以純日期和 App 預設時區正規化，避免在 UTC / CI 執行環境中把台北時間午夜誤判成前一天。

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
- 使用 Email 邀請
- 接受邀請後下載到本機
- 自動同步開關
- 取消共享

這代表它不是單純把資料丟上雲端，而是有共享身分與同步關係的設計。

### 6.3 Google Drive 帳本同步

這個功能和「備份」不同。

帳本同步的特性是：

- 以帳本為單位開啟
- 資料異動後即時同步到 Google Drive `appDataFolder`
- 在其他裝置可拉回最新版本
- 只有選定帳本會同步

適合跨裝置持續作業，而不是只做災難復原。

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

## 9. 銀行同步

### 9.1 銀行同步現況

銀行同步相關頁面與流程已存在，但目前需要分清楚「能力存在」與「實際開放條件」：

- 屬於會員功能
- 入口受 feature flag / API 設定控制
- 頁面文案已標示 sandbox 性質
- 可建立銀行連線、查看同步狀態、管理要同步的帳戶

所以這不是完全未做，而是屬於已建流程、仍受條件控制的功能。

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

**版本**：v1.0.6（SMB-165）；Android 原生插件 v1.0.8（SMB-168）；平台挑戰偵測 v1.0.9（SMB-170）；官方網址校正 v1.0.9（SMB-173）；帳密 IV 修正 v1.0.13（SMB-174）；自動化流程可見化 + 失敗診斷分類 v1.0.15（SMB-174 Restart）；驗證碼讀取與載具清單資料偵測修正 v1.0.16（SMB-179）；載具流程四大問題修復 v1.0.17；查詢頁穩定修復 v1.0.18（SMB-180）；UI 問題審查修復 v1.0.22（SMB-165 審查）
**狀態**：Android 原生插件保留 WebView 自動化流程，但會先偵測財政部站台的防自動化/Cloudflare challenge；被平台擋下時回傳明確錯誤，不再只顯示 `E-invoice automation failed`。穩定正式匯入仍應改接財政部電子發票官方 API 與後端代理。

### 功能說明
透過 4 步驟精靈，讓使用者輸入財政部電子發票平台（einvoice.nat.gov.tw）帳號、設定查詢條件、選取發票後批量匯入至 StrawMoneyBook 帳本。

### 資料庫
- `einvoice_credentials`：加密儲存手機號碼與密碼（AES-256-GCM + PBKDF2），手機號碼與密碼各自保存對應 IV，避免記住帳號後密碼無法正確還原
- `einvoice_invoice_imports`：發票匯入記錄，`invoice_number` UNIQUE 防止重複匯入

### 精靈步驟
1. **帳號設定**：輸入手機號碼/密碼，可勾選「記住帳號（加密儲存）」，表單區塊使用自然高度排列，避免手機畫面出現過多空白
2. **查詢條件**：日期區間（預設近 3 個月）、發票狀態、買方統編、品名關鍵字
3. **選取發票**：顯示抓取結果，支援全選/單選；目前平台不支援自動抓取時顯示說明提示
4. **確認匯入**：預覽待匯入清單，確認後寫入資料庫

### 安全設計
- 帳密絕不以明文儲存，以 AES-256-GCM + PBKDF2（100,000 迭代）加密
- 加密金鑰衍生自裝置 UUID（localStorage 綁定，首次產生後固定）
- 每次加密使用隨機 12-byte IV

### Android 原生自動化（SMB-168, v1.0.8）
- `EInvoiceAutomation` Capacitor 插件（`registerPlugin('EInvoiceAutomation')`）透過隱藏 WebView 自動操作 `einvoice.nat.gov.tw`
- 登入流程：選取手機條碼分頁 → 填入手機號碼/密碼 → CAPTCHA OCR（TesseractBridge，numeric 模式，4 位數字）→ 送出 → 最多重試 3 次
- 查詢流程：填入日期區間（轉換為民國年格式 YYYmmdd）、發票狀態、統編、品名 → 解析多頁發票清單 → 回傳 JSON
- 發票欄位：`invoiceNumber`、`amount`、`invoiceDate`（timestamp ms）、`merchantName`、`carrierName`、`buyerTaxId`
- `isEInvoiceAutomationSupported()` 在 Android native 回傳 `true`，其他平台（Web、iOS）回傳 `false`
- **SMB-166 (v1.0.8)**：Step 2 加入平台守衛 `canProceed = platformSupported && dateRange_valid`；非 Android 平台「下一步」禁用並顯示開發中提示
- **SMB-170 (v1.0.9)**：修正 `evaluateJavascript` 在 UI thread 內等待 callback 的死鎖風險，改由背景 thread 等待結果，避免每次腳本執行都逾時並導致自動化流程失敗；登入頁與查詢頁載入後也會偵測 Cloudflare / 防自動化 challenge，命中時回傳 `einvoice_platform_challenge` 與可診斷訊息；Activity 被取消且沒有錯誤 payload 時改回傳 `einvoice_automation_canceled`，避免前端只看到通用 `E-invoice automation failed`。
- **SMB-172**：Debug Page 新增「載具抓取紀錄」區塊，透過 `einvoice-debug.service.js` 追蹤每次 `scrape`（抓取）和 `import`（匯入）操作；記錄欄位包含手機號碼（前 4 碼可見其餘遮蔽）、查詢日期區間、操作狀態（running / ok / error）、耗時、抓取發票數、匯入 / 跳過 / 失敗筆數及錯誤代碼與訊息；i18n 同步新增 zh-TW / en / ja key；匯出 debug log 的 JSON payload 也加入 `einvoice_calls` 欄位。
- **SMB-173 (v1.0.9)**：Android WebView 自動化改用財政部電子發票整合服務平台目前的登入與查詢路徑：`/accounts/login` 與 `/portal/btc/mobile/btc502w/search`；舊的 `/btc502w/BTCIndex`、`/btc502w/BTCInvController` 不再作為入口 URL，避免官方路由變更時直接落到 404 或錯誤頁。官方登入頁的手機條碼 / 載具模式選取也改為掃描文字、label、radio / checkbox、select option 與 data/aria 屬性，填入手機號碼、密碼與驗證碼時會觸發完整 input/change/keyup/blur 事件；找不到欄位時回傳 `phone_missing`、`password_missing` 或 `captcha_missing` 等診斷原因。
- **SMB-174 (v1.0.13)**：修正「記住帳號」的密碼 IV 遺失問題；手機號碼與密碼現在會分別保存 AES-GCM IV，既有資料庫透過 migration 033 補上 `password_iv` 欄位，新儲存的憑證可在下一次進入精靈時正確還原並帶入 Android 自動化流程。
- **SMB-174 Restart (v1.0.15)**：自動化流程徹底重做為「混合自動 + 手動驗證碼 fallback」，保證能完成登入。回應 Tester「我沒有看到他有輸入」與「請讓他能完整完美的工作」。
- **SMB-179 (v1.0.16)**：驗證碼讀取不再只依賴 `<img>` canvas data URL；若 canvas 因站台保護或背景圖呈現而讀不到，會改由 Android WebView 可見區域裁切驗證碼元素做 OCR，並把 Tesseract numeric mode 收斂成純數字白名單與多組放大 / 灰階 / 高對比 / 二值化前處理。登入後若站台跳到「載具清單資料」或新版發票結果頁，也會以頁面文字、發票號碼 pattern、`role=row` / card / list 結構偵測與解析，不再只吃舊 `invTable` selector，且解析時避免把 8 位買方統編誤判成發票金額。
- **SMB-180 (v1.0.18)**：登入成功後進入 btc502w 查詢頁時，`fetchInvoices` 會對查詢表單最多輪詢 10 秒；`buildFillQueryFormScript` 優先鎖定 `btc502wQ.qryDateS`、`btc502wQ.qryDateE`、`btc502wQ.invStatus`、`btc502wQ.buyerBan`、`btc502wQ.keyword` 欄位，表單尚未渲染時回 `false` 讓 Java 重試，已在結果頁時則維持直接成功。若最後仍找不到表單，會拋 `einvoice_query_form_missing` 並附上當前 URL、title 與頁面摘要，協助判斷平台改版、登入失效或跳轉錯頁。

  **新流程（5 階段，狀態列即時顯示）**：
  1. `正在開啟電子發票平台…` — `loadUrl(LOGIN_URL)` 並偵測 Cloudflare 挑戰
  2. `選取手機條碼載具…` — `selectMobileCarrier` + `waitForMobileCarrierLoginFormStable`
  3. `自動填入帳號與密碼…` — 新 `buildFillCredentialsOnlyScript()` 只填手機/密碼，不送出、不觸碰驗證碼，使用者可即時確認
  4. `自動辨識驗證碼…（嘗試 1/2 → 2/2）` — OCR + `buildSubmitLoginScript`，失敗則重整驗證碼再試（最多 `OCR_MAX_ATTEMPTS=2` 次）
  5. **若 OCR 仍失敗 → 手動模式**：`驗證碼自動辨識失敗，請看下方驗證碼，輸入後按登入按鈕`。重整驗證碼、清空驗證碼欄位（`buildClearCaptchaInputScript`）、聚焦驗證碼欄位並 scrollIntoView（`buildFocusCaptchaInputScript`），等使用者親自輸入並按平台登入按鈕；偵測到 URL 離開 `/accounts/login` 即 `登入成功，正在抓取發票…` 並繼續抓取流程。

  **核心元件**：
  - `EInvoiceAutomationActivity`：移除 `setAlpha(0.01f)`，WebView 全可見、白底；頂部說明列為動態 `TextView statusTitle` + 取消鈕，新增 `postStatus(String)` 透過 `mainHandler.post` 從背景 thread 安全更新；`AUTOMATION_TIMEOUT_MS` 從 120s 延長到 180s 以容納手動 captcha 等待。`onDestroy` 一併清空 `statusTitle` 避免回呼到已釋放 view。
  - `EInvoiceAutomation`：常數重整為 `OCR_MAX_ATTEMPTS=2 / AUTO_LOGIN_WAIT_MS=12000 / MANUAL_LOGIN_WAIT_MS=90000`；`query()` 多載新增 `Consumer<String> statusUpdater`；`BrowserSession` 持有 `statusUpdater` 並提供 `setStatus(String)`；`performLogin` 重寫為自動 + 手動 fallback；`waitForLoginSuccess` 改接受 `timeoutMs` 參數，靈活控制自動/手動兩段等待時間；`isFillCredentialsResultSuccess` / `describeFillCredentialsFailure` 提供 fill 階段的成功/失敗判定。`classifyLoginFailure` 仍保留並依舊區分 `einvoice_captcha_image_missing` / `einvoice_captcha_recognition_failed` / `einvoice_login_failed`（附帶 `buildPageErrorDetailScript` 擷取的站台原文錯誤）。
  - 新 JS scripts：
    - `buildFillCredentialsOnlyScript(phone, password)` — 只填手機/密碼，回傳 `{ filled, reason, missing }`，不點 submit、不觸碰驗證碼
    - `buildClearCaptchaInputScript()` — 清空驗證碼欄位（OCR 失敗時讓使用者輸入新值不會被舊值困擾）
    - `buildFocusCaptchaInputScript()` — `scrollIntoView` + `focus` + `select` 引導使用者輸入

  **測試**：
  - Java 單元測試新增 `fillCredentialsOnlyScriptFillsPhoneAndPasswordWithoutSubmitting`、`clearCaptchaInputScriptOnlyResetsCaptchaFieldValue`、`focusCaptchaInputScriptScrollsAndFocusesCaptchaField`、`isFillCredentialsResultSuccessAcceptsBooleanTrueAndRejectsNonJsonObjectValues`、`hybridFlowTimingConstantsAreReasonableForUserManualCaptcha`，加上原本的 5 個 `pageErrorDetailScript*` / `classifyLoginFailure*` 共 10 個新測試。
  - `simulate-einvoice-login-flow.mjs` 加 Step 6A（站台錯誤擷取）、Step 8（自動填帳密不送出 / 不觸碰驗證碼）、Step 9（手動模式 focus/clear），共 32 項全通過。

- **v1.0.17（載具流程四大問題修復）**：
  - **問題 1：OCR 識別失敗**
    - `TesseractBridge.recognizeSegmentedCaptcha`：分段識別失敗時改為放大 2x 後 PSM_SINGLE_CHAR 重試，仍失敗才放棄，提升低品質驗證碼的識別率
    - `EInvoiceAutomation.selectBestCandidate`：同分時以原始置信度作 tie-breaker，加入 Log 輸出協助追查
    - `EInvoiceAutomation.recognizeNumericCaptcha`：Bitmap variants 在 `try/finally` 中回收，修復長時間執行時的記憶體洩漏
  - **問題 2：跳轉發票頁後出現「找不到帳號密碼填寫處」**
    - `waitForMobileCarrierLoginFormStable`：8 秒後表單完全未出現時直接拋出 `einvoice_login_form_missing`（附帶載具快照與表單快照），而非靜默繼續讓後續 fill 腳本在未就緒表單上執行；表單部分可見時額外等 2 秒
    - `buildFillCredentialsOnlyScript`：填入失敗時在回傳物件附帶 `formDiag`（當前頁面 URL + 可見 input 列表），方便排查平台 DOM 變動
    - `describeFillCredentialsFailure`：從 `formDiag.url` 讀取頁面 URL 加入錯誤訊息
  - **問題 3：未到達發票頁面卻顯示「無任何發票」**
    - `fetchInvoices` 的 `waitForResults` 30 秒超時後拋出 `einvoice_query_results_timeout`（附帶當前頁面 URL / 標題），而非靜默返回空陣列使前端誤顯空狀態
    - `EInvoiceStep3Select.vue`：`onMounted` 中 `isEInvoiceAutomationSupported()` 判斷移入 try 區塊，確保 `isScraping` 在所有路徑（含平台不支援）都由 `finally` 正確重置為 false
  - **問題 4：金額解析誤吃買方統編**
    - `buildParseInvoiceListScript` 中的 `parseAmount`：8 位數（統編格式）無條件排除，不受 `amountLabel` 影響，避免「金額 NT\$xxx 買方統編 12345678」類型的行誤把統編解析為金額
  - **測試**：Java 單元測試新增 `fillCredentialsFailureScriptIncludesFormDiagnostics`、`parseAmountScriptUnconditionallyExcludesEightDigitNumbers`、`waitForResultsTimeoutErrorCodeIsCorrect`；`simulate-einvoice-login-flow.mjs` 新增 Step 11（空白頁 waitForResults）、Step 12（含金額標籤時統編不誤判），全套 41/41 通過

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
