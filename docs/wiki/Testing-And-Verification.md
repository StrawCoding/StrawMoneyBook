# Testing-And-Verification

## 最低驗收

```bash
npm run test:node --prefix frontend
npm run test --prefix backend
npm run build:web --prefix frontend
npm run check --prefix frontend
```

改到網頁元件／路由／錯誤碼 UI → 再跑 [Playwright-App-Shell](Playwright-App-Shell) 對應 suite。

## 測試金字塔（本方案起強制）

- **禁止**為新行為新增 `*-source.test.js`（讀檔 `assert.match` 鎖死重構）。
- 優先：service／repository（sql.js）、Robolectric（Wear 原生）、Playwright app-shell。
- 既有 source 測試改到時再換成行為測試，不要無故刪掉還在保護的合約。

## Playwright 怎麼選

- 設定殼／首頁／功能列表：`playwright:ui-layout`
- 銀行：`playwright:bank-sync`（已進 CI）
- 載具：`playwright:carrier-sync`
- 預算：`budget-save` / `budget-cross-month` / `budget-pay-cycle`
- 分析匯出：`playwright:analysis-export`

`frontend && npm run check` 對齊 CI 的 Node+build，**不含** Playwright。

## 引用

- [`frontend/package.json`](../../frontend/package.json)
- [CI-CD-And-Gates](CI-CD-And-Gates)
- [Playwright-App-Shell](Playwright-App-Shell)
