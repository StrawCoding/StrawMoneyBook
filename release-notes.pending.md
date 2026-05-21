# Pending Release Notes

---

## v1.2.25
- (SMB-209) 依載具 project 技術文檔補齊電子發票 Step 1「清除已儲存載具資料」入口：載入加密儲存的手機條碼 / 查詢碼後可直接清除本機憑證，畫面同步清空欄位並關閉記住載具，三語 i18n、功能地圖與詳細文件同步更新

## v1.2.24
- (SMB-213) 修復 Android Google 自動備份重新授權仍可能一直停在「登入中」的問題：補上 MainActivity 對 Capgo SocialLogin Google offline authorization activity result 的轉送，讓 server auth code 授權 PendingIntent 回來後會交給 `SocialLoginPlugin.handleGoogleLoginIntent(...)` 完成 promise，不再等到 timeout

## v1.2.23
- (SMB-209) 修復電子發票載具匯入 Step 1「下一步」即使在合法格式下仍可能維持 disabled 的問題：新增手機條碼與查詢碼行內驗證錯誤訊息，讓使用者清楚看到欄位格式不符或查詢碼過短的原因；修正 `normalizeBarcode` 未正確去除條碼內部空白的 bug（輸入含內部空白之條碼時，去除空白後的值未回寫 store，導致下一步判斷與儲存行為不一致）

## v1.2.22
- (SMB-214) 借出借入還款支援利息：新增 / 編輯還款時若輸入金額超過剩餘本金，超出部分自動計為利息並建立「借貸利息」分類的獨立交易（借出為利息收入、借入為利息支出）；還款表單即時顯示「超出本金部分 X 元將計為利息」預覽；建立借貸時已設定預設利息者，仍以本金加預設利息為上限

## v1.2.21
- (SMB-213) 修復 Android Google 自動備份連線畫面「一直呈現登入中」的問題；根因：Credential Manager bottom UI（`style: 'bottom'`）與 server auth code flow（`mode: 'offline'`）不相容，Credential Manager 無法在 Android 回傳 serverAuthCode，導致 exchange 失敗後 fallback 觸發第二個互動登入對話框，使用者若不與第二個對話框互動，將卡住長達 150 秒；修復方式：`googleSignIn` 第一次登入嘗試改依模式選擇 UI style，server auth code mode 使用 `style: 'standard'`（傳統 Google 登入，可靠回傳 serverAuthCode），online mode 仍使用 `style: 'bottom'`（保留 SMB-191 的 NoCredentialException graceful fallback）

## v1.2.20
- (SMB-209) 修復電子發票載具匯入 Step 1「下一步」在合法手機條碼含 `+ . -` 符號時仍保持 disabled 的問題；前端與 backend `cardNo` 驗證同步允許 `/` 後 7 位英數字或 `+ . -`，並更新三語格式提示，避免合法載具條碼被阻擋或前後端規則不一致

## v1.2.19
- (SMB-212) 分類管理新增「預設記帳設定」區塊：可在分類明細頁分別設定「預設紀錄收支」、「預設紀錄預算」、「預設報銷」開關；選取該分類新增交易時，對應的記帳選項將自動套用分類預設值；現有分類的預設值與原本記帳行為一致（紀錄收支開、紀錄預算開、報銷關）

## v1.2.18
- (SMB-213) 修復 Google 自動備份在未設定 `VITE_GOOGLE_OAUTH_API_ORIGIN` 等明確 env 變數時，native 平台的 `resolveServerAuthCodeFlowEnabled` 判斷落回 online mode（無 refresh token，access token ~55 分鐘到期），造成頻繁需要重新授權才能自動備份；修復方式：在明確 env 判斷之後，補回以 `GOOGLE_OAUTH_DEFAULT_ORIGIN`（`https://api.strawmb.com`）為 fallback 的 `isAbsoluteHttpUrl` 檢查，讓 native 預設即啟用 server auth code flow（長效 refresh token），不再需要額外設定 env 才能正常運作

## v1.2.17
- (SMB-211) 修復交易搜尋無法用「借出 / 借入 / 歸還（還款）/ 收回（收回借款）」等借貸顯示條件搜尋借貸交易的問題；搜尋 SQL 會納入借貸方向、往來對象與畫面顯示標籤

## v1.2.16
- (SMB-209) 載具匯入改為手機條碼 + 查詢碼 + backend 官方 API proxy，移除舊 WebView/OCR 方案

## v1.2.15
- (SMB-210) 借出 / 借入交易（含還款與利息）建立時預設不計入收支紀錄與預算；使用者可於交易明細頁手動開啟

## v1.2.16
- (SMB-209) 載具 / 電子發票匯入刪除舊 WebView/OCR 自動化查詢入口，重做為手機條碼 + 查詢碼 + backend 官方 API proxy 流程；保留命名階段、取消 / 重試 / 逾時 / 失敗回饋與 generation token 防舊結果覆蓋，並移除舊發票狀態篩選殘留；backend 端補上 X-Straw-Client-Key 驗證、電子發票專用 rate limit、日期 / 查詢碼驗證與過多頁數防靜默截斷；Step 2 預設查詢區間改為最近 62 天並顯示提示，避免預設 3 個月直接超過後端單次查詢上限而抓不到發票

## v1.2.14
- (SMB-209) 重新設計電子發票載具匯入計畫，移除無名四點式舊流程呈現，改為「帳號驗證 / 查詢條件 / 抓取發票 / 確認匯入」命名階段；抓取階段新增取消、重試、修改查詢條件與失敗 / 逾時 / 取消明確回饋，並以 generation token 丟棄已取消或舊查詢的晚回結果，避免新舊資料混用

## v1.2.13
- (SMB-165) 電子發票匯入 Step 4 新增「同步建立支出交易」選填區塊；選取帳戶與分類後，匯入時會依發票金額與日期自動建立支出交易並記錄 transaction_id，方便後續帳本查詢；未選擇時維持舊行為（僅存匯入紀錄）

## v1.2.11
- (SMB-192) 修復自動備份設定頁載入或背景刷新時會自動觸發 Google 互動登入，導致 Google 備份面板卡住或反覆顯示登入錯誤的問題；現在頁面刷新只做靜默恢復，使用者按下登入 / 重新登入才開啟 Google 登入流程
- (SMB-192) 修復 Google 備份 native server auth code 交換誤用官網 / 隱私權政策靜態網域造成 `405 Not Allowed` 的問題；OAuth exchange / refresh 預設改走 `https://api.strawmb.com`，後端也註冊 `/api/google/oauth/*` 路由，避免正式 App 連到靜態網站主機

## v1.2.10
- (SMB-191) 修復 Android Google 自動備份首次互動登入未觸發 SocialLogin fallback，導致部分帳號顯示 Google Sign-In failed 而無法完成登入的問題

## v1.2.6
- 修復訂閱自動扣款與存錢罐自動存入在非 App 預設時區帳本的跨日邊界可能提早或延後觸發的問題，現在到期日判斷會使用帳本時區
- 修復借貸單筆新增 / 編輯還款可輸入超過剩餘金額，導致超額部分被誤拆成利息或產生超額入帳的問題

## v1.2.4
- (SMB-188) 在 PostSetupIntro 初始導覽頁新增「共同帳本」與「帳本同步（Google Drive）」兩個說明步驟

## v1.2.5
- (SMB-189) 擴充帳本載入前的自動資料修復，會處理交易遺失帳戶 / peer 帳戶 / 分類引用與無法成對或金額不平衡的轉帳群組，避免壞帳本資料持續阻斷查詢
- (SMB-190) 資料管理頁匯出全部帳本 JSON 與 CSV 時改用帶時間戳的檔名，避免重複匯出覆蓋同一路徑檔案

## v1.2.7
- (SMB-186) 修復 Google 自動備份在 native 平台因 server auth code flow 判斷僅依賴明確 env 變數而意外落回 online mode（無 refresh token），導致 access token (~55 分鐘) 到期後必須手動重新授權
- (SMB-186) 修復 `resolveGoogleProfileForConnect` 在 silent token 失敗但 profile 有快取時，不觸發新的 `googleSignIn`，造成 `connected: true` 存入卻沒有有效 token，下次自動備份立即失敗

## v1.2.1
- (SMB-187 / v1.2.4) 修復共同帳本同步 / 匯入快照時，孤兒引用資料可能造成 SQLite `FOREIGN KEY constraint failed (code 1811)` 中斷，並在遠端快照替換失敗時嘗試復原原本本機帳本
- (SMB-186 / v1.2.3) 修復 Google 自動備份重新授權成功後，設定頁仍可能保留「需要重新授權後才能自動備份」過期診斷
- (SMB-185) 修復自動備份模擬腳本中 Google Auth mock 路徑錯誤，導致 `autoConnectGoogleBackup` 自動備份檢查失敗
- 修復 Google Web Client ID 缺少或環境命名不一致時，帳號頁 Google 登入區塊整段消失，並讓帳號登入與 Google 備份共用同一套前端 Client ID 解析
