# StrawMB 全產品優化方案

**版本：** 2026-08-27（對齊產品 **v1.4.0**）  
**性質：** 官方 backlog + 驗收閘。操作細節以本 Wiki 其他頁為準，不另造流程。  
**HTML 報告：** [`docs/audits/smb-full-product-optimization-20260827/strawmb-full-product-optimization-plan.html`](../audits/smb-full-product-optimization-20260827/strawmb-full-product-optimization-plan.html)  
**剩餘技術手法（v1.4.6；T-01／T-02 已落地）：** [Technical-Optimization](Technical-Optimization)

權威發布站：[https://strawcoding.github.io/StrawMoneyBookWiki/](https://strawcoding.github.io/StrawMoneyBookWiki/)（Operations）。主 repo `docs/wiki/` 是同步來源快照。

## 現況摘要

- SMB-130 具名拆分（core 不再碰 Pinia／router、view 不直打 `transaction.repo`、後端 route-table）**多已落地**；[`docs/architecture-review-smb-130.md`](../architecture-review-smb-130.md) 仍像實作前快照。
- 銀行 Architecture B 程式大半完成；**第一銀行 Phase 0C 真機、華南 H1/H2 登入後 DOM 未凍**。詳見 [Sync-Architecture-B](Sync-Architecture-B)。
- 分析「全部」曾把整本帳本載入主執行緒做多次 JS 聚合（P0）。
- Play patch 預設軌道是 `internal`（[`frontend/android/play-testing-channel.json`](../../frontend/android/play-testing-channel.json)）。**未拍板前不改軌道。**

## 階段與驗收

| 階段 | 內容 | 驗收 |
|---|---|---|
| 文件閘 | 本方案 + Closeout／APK／app-shell／發薪／Wear／Arch B wiki | README 索引 wiki；連結可點；不另造 SOP |
| A 找得到 | 預算頁帳本層曆月／發薪切換；PostSetup 指向「功能→進階」；長表單 `hideAppChrome` | `playwright:budget-pay-cycle`、`playwright:ui-layout` |
| B 分析效能 | SQL `GROUP BY`／query service，禁止分析頁全量載入 | Node test 對齊 breakdown 語意；`playwright:analysis-export` |
| C 同步真 | 載具 configured 治本；銀行同步產品面已移除 | 載具 Playwright／health 不得當登入成功 |
| D 金字塔 | 禁止新 `*-source.test.js`；列表虛擬化；SMB-130 文件對齊。**不要**刪 traditional／`apple-ui.css`（雙 layout 是產品決策） | 新行為用 service／Playwright／Robolectric。剩餘手法見 [Technical-Optimization](Technical-Optimization) |

**排除：** iOS widget（獨立產品線）。

## 發版規則（摘要）

權威頁：[Closeout-And-Versioning](Closeout-And-Versioning)。寫碼階段**禁止**手動 bump／`gpr`。唯一發版：`cd frontend && npm run gpr`。

## 相關 audit（歷史，勿當未開工）

- 銀行計畫 v1.1.1：`docs/audits/bank-sync-20260816/`
- SMB-130：`docs/architecture-review-smb-130.md`
- 優化技術（剩餘）：[Technical-Optimization](Technical-Optimization) · HTML `docs/audits/smb-tech-optimization-20260828/`

## 導覽

- [Technical-Optimization](Technical-Optimization)
- [Home](Home)
- [Closeout-And-Versioning](Closeout-And-Versioning)
- [Playwright-App-Shell](Playwright-App-Shell)
- [Android-Native-Bank-APK](Android-Native-Bank-APK)
- [Payroll-Cycle-Budget](Payroll-Cycle-Budget)
- [Wear-Companion](Wear-Companion)
- [Sync-Architecture-B](Sync-Architecture-B)
