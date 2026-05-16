# Pending Release Notes

---

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
