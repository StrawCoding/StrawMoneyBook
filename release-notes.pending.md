# Pending Release Notes

---

## v1.2.4
- (SMB-188) 在 PostSetupIntro 初始導覽頁新增「共同帳本」與「帳本同步（Google Drive）」兩個說明步驟

## v1.2.5
- (SMB-189) 擴充帳本載入前的自動資料修復，會處理交易遺失帳戶 / peer 帳戶 / 分類引用與無法成對或金額不平衡的轉帳群組，避免壞帳本資料持續阻斷查詢
- (SMB-190) 資料管理頁匯出全部帳本 JSON 與 CSV 時改用帶時間戳的檔名，避免重複匯出覆蓋同一路徑檔案

## v1.2.1
- (SMB-187 / v1.2.4) 修復共同帳本同步 / 匯入快照時，孤兒引用資料可能造成 SQLite `FOREIGN KEY constraint failed (code 1811)` 中斷，並在遠端快照替換失敗時嘗試復原原本本機帳本
- (SMB-186 / v1.2.3) 修復 Google 自動備份重新授權成功後，設定頁仍可能保留「需要重新授權後才能自動備份」過期診斷
- (SMB-185) 修復自動備份模擬腳本中 Google Auth mock 路徑錯誤，導致 `autoConnectGoogleBackup` 自動備份檢查失敗
- 修復 Google Web Client ID 缺少或環境命名不一致時，帳號頁 Google 登入區塊整段消失，並讓帳號登入與 Google 備份共用同一套前端 Client ID 解析
