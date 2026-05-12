# Pending Release Notes

---

## v1.2.1
- (SMB-185) 修復自動備份模擬腳本中 Google Auth mock 路徑錯誤，導致 `autoConnectGoogleBackup` 自動備份檢查失敗
- 修復 Google Web Client ID 缺少或環境命名不一致時，帳號頁 Google 登入區塊整段消失，並讓帳號登入與 Google 備份共用同一套前端 Client ID 解析
