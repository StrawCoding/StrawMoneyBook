# 發薪週期預算

## 語意

帳本層設定，**不是**每個預算項目自己的發薪日。

- 模式：`calendar_month` 或 `pay_cycle`
- `pay_cycle`：從發薪日（含）到下次發薪日前一日（含）
- 發薪日當天 `00:00`（帳本時區）起屬新期；前一日仍屬舊期
- 日均／日池依**實際週期天數**，不能只讓固定額套用週期
- 日曆／交易／分析預設仍是曆月；預算頁與首頁預算卡跟週期走

month key 形如 `pay:YYYY-MM-DD`。

## 使用者入口（必須找得到）

1. **預算頁本體**（`/budget`）：曆月／發薪週期切換 + 發薪日
2. 新增／編輯預算項目 sheet、共同池 sheet
3. 設定 → 帳本詳情（深度連結）

PostSetup／文案不可再寫「從設定啟用進階功能」當主入口。

## 驗收

```bash
npm run playwright:budget-pay-cycle --prefix frontend
```

必覆蓋：跨月、跨年、短月 29/30/31、歷史月相容、同週期重複結算防護、從預算頁（含 app shell）操作。

自動 rollover：首次開啟、reload、App 從背景跨日回前景都要依**當天**重算；不可只靠「上一期／下一期」按鈕。

## 引用

- [`frontend/src/core/services/budget-period.js`](../../frontend/src/core/services/budget-period.js)
- [`frontend/src/core/db/migrations/039_budget_pay_cycle.sql`](../../frontend/src/core/db/migrations/039_budget_pay_cycle.sql)
- [Playwright-App-Shell](Playwright-App-Shell)
