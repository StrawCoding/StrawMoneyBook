# StrawMB 優化技術

**版本：** 2026-08-28（對齊產品 **v1.4.6**；T-01／T-02 已落地，尚未 gpr）  
**性質：** 剩餘架構／效能／測試手法與驗收閘。只讀稽核，不是實作授權。  
**HTML 報告：** [`docs/audits/smb-tech-optimization-20260828/strawmb-tech-optimization.html`](../audits/smb-tech-optimization-20260828/strawmb-tech-optimization.html)

全產品方案（找得到／分析主頁 SQL／wiki 閘）見 [Optimization-Plan](Optimization-Plan)，不要把已落地項重開單。

權威發布站：[https://strawcoding.github.io/](https://strawcoding.github.io/)（Operations）。本頁是 in-repo 快照；同步 VitePress 時只加本索引，不另造 SOP。

## 已落地（不要重做）

分析主頁 `loadAnalysisStats` SQL `GROUP BY`、首頁 SQL 彙總＋分頁、staged hydration、路由 lazy import、Vite `manualChunks`、交易索引、後端 route-table、membership 不碰 router、首頁流／搜尋 `content-visibility`、禁新 `*-source.test.js`、Playwright 進 CI。

雙 layout（傳統 `apple-ui.css`／現代 `habitat-ui.css`）是產品決策，**禁止**當「清傳統 CSS」債。

## 剩餘（詳見 HTML）

| ID | 嚴重度 | 摘要 | 狀態 |
|---|---|---|---|
| T-01 | P0 | 分析分類明細 `all` 仍 `listAllTransactionsChunked` | **DONE 2026-08-28**（`loadAnalysisCategoryDetail`） |
| T-02 | P0 | `main.js` FontAwesome 全量 `library.add` | **DONE 2026-08-28**（`fa-icon-registry` 動態註冊） |
| T-03 | P1 | `core` 三處 `from '@/ui/…'` | OPEN |
| T-04 | P1 | `app-runtime.service.js` 633 行神檔 | OPEN |
| T-05 | P1 | `membership.service.js` 971 行 | OPEN |
| T-06 | P1 | 73 個 `*-source.test.js` 鎖重構 | OPEN |
| T-07 | P2 | 分類明細／請款列表尚未 content-visibility | OPEN |

Play `internal` 軌道未拍板不改。銀行 0C／華南 H1/H2 真機閘見 [Sync-Architecture-B](Sync-Architecture-B)。

## 建議順序

T-03 → T-06 → T-04／T-05 → T-07。一次一條管線。T-01／T-02 已於 2026-08-28 落地。

## 排除

iOS widget；改 Play channel；刪 traditional；本文件階段做真機同步；改 schema／API shape。

## 導覽

- [Optimization-Plan](Optimization-Plan)
- [Testing-And-Verification](Testing-And-Verification)
- [Sync-Architecture-B](Sync-Architecture-B)
- [Home](Home)
