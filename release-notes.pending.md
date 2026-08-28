# Pending Release Notes

- 華南銀行同步 Phase A：失敗時留下去識別化 H1/H2 debug probe 與網路觀察（不重放請求）；`hua_nan_transaction_query_failed` 不再被當成需要重新連結。交易明細合約仍未凍結，需真機 trace 後才能治本。

---

## v1.4.5
- 恢復傳統／現代雙介面風格：傳統維持現行 Apple HIG 清單分組；現代改為 Straw Habitat 生活色域（圓滑色島、分區色彩、A/B/C/D 主題全留）。5 tab、FAB、首頁區塊不刪。

## v1.4.4
- 修復會員登入「已過期／需重新登入」：refresh 已 rotate 但客戶端逾時時，60 秒內重放舊 token 改走 family head 再續發，不再誤判 reuse；grace 外真 reuse 會先 commit family revoke 再丟錯（避免 SQLite throw 回滾）。前端忽略過期的 refresh 回應。

## v1.4.2
- 全螢幕記帳頁（快速新增／AI／問答）與其他 hideAppChrome 頁恢復與一般頁等價的頂部 status-bar／safe-area 預留；BottomNav 與品牌頂欄仍隱藏。

## v1.4.1
- 全產品優化方案與官方 Wiki（https://strawcoding.github.io/StrawMoneyBookWiki/ Operations）；分析頁改 SQL 彙總避免「全部」全量載入；預算頁本體可切換曆月／發薪週期；長表單隱藏 BottomNav；載具 API 設定不再因 PROD／native 假陽性；銀行同步 Playwright 納入 CI；交易列表啟用 content-visibility 虛擬化。
