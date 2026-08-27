# Playwright App Shell

## 目的

網頁／UI 驗收必須證明使用者看得到的 **實際 route + app chrome**，不是 welcome 畫面或元件單元假陽性。

## 硬閘

1. **bypass onboarding** 進有 BottomNav 的 app shell（`[data-testid=bottom-nav]`）。
2. 驗 FontAwesome icon 與目標頁，不要在 welcome／post-setup intro 就 PASS。
3. 多步驟／全螢幕流程：檢查 BottomNav／safe-area **有沒有遮住**表單或主 CTA。
4. 長表單 route 應設 `meta.hideAppChrome`（`App.vue` 的 `full-screen-route`），Playwright 斷言該頁 **沒有** BottomNav 與品牌頂欄，但 **仍有** status-bar／safe-area 頂部預留（內容不得貼齊螢幕頂端）。

## 套件對照

| 改動 | suite | CI |
|---|---|---|
| 首頁／導覽／功能列表／設定殼 | `npm run playwright:ui-layout --prefix frontend` | 有 |
| 預算儲蓄 | `playwright:budget-save` | 有 |
| 分析匯出 | `playwright:analysis-export` | 有 |
| 載具同步 | `playwright:carrier-sync` | 有 |
| 跨月預算 | `playwright:budget-cross-month` | 有 |
| 發薪週期 | `playwright:budget-pay-cycle` | 有 |
| 銀行同步設定 | `playwright:bank-sync` | **有（本方案納入 CI）** |

`closeout:verify` 不含 Playwright。Hermes closeout 要加 `--playwright <suite>`。

## 共用 onboarding

各 `frontend/scripts/playwright-*.mjs` 有自己的 `completeOnboarding()`。改 welcome 文案會全套一起炸——改 wizard 時必須重跑相關 suite。

Browsers 路徑：CI 用 `PLAYWRIGHT_BROWSERS_PATH` 指向 `backend/.server-data/playwright-browsers`。本機：

```bash
cd backend && npm run playwright:install-browsers
```

## 引用

- [`frontend/scripts/playwright-ui-layout.mjs`](../../frontend/scripts/playwright-ui-layout.mjs)
- [Testing-And-Verification](Testing-And-Verification)
- [CI-CD-And-Gates](CI-CD-And-Gates)
