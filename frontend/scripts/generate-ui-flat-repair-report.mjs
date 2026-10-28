import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const out = resolve(frontendDir, '.artifacts/smb-ui-flat-repair-report.html')

const rows = [
  { area: '交易月曆 /transactions/calendar', change: 'habitat-line-calendar：日格改透明底 + 細線框；交易列改分隔線列表' },
  { area: '預算 /budget', change: 'BudgetMonthCalendar 線框月曆；發薪期 segmented 按鈕列' },
  { area: '預算設定 /budget/settings', change: '期間 segmented、曆月／發薪 pill、HomeRangePicker 線框選月格' },
  { area: '信用卡 /credit-cards', change: 'habitat-switch 切換；提醒區左色條；主按鈕 pill' },
  { area: '會員方案 /settings/membership-benefits', change: '方案對照改 feature 列 + 雙 tier pill（非 Excel 格線）' },
  { area: '自動填規則新增 /settings/auto-fill-rules/new', change: 'settings-subpage 頂層 card 扁平 + 全站 segmented／pill 按鈕' },
  { area: '記帳提醒 /settings/bookkeeping-reminder', change: 'settings-subpage card → flow 分隔' },
  { area: '分類 /settings/categories', change: 'kind-tabs segmented；列表分隔線' },
  { area: '加值模板 /settings/addon-templates', change: 'settings-subpage 扁平 card' },
  { area: '關於 /settings/about', change: 'settings-subpage 扁平 card' },
  { area: '分類詳情 (dynamic)', change: 'settings-subpage 扁平 + 內層 list 分隔' },
  { area: '請款／報銷詳情與匯入', change: 'claim／reimbursement 多段 card 扁平；detail-block 改分隔線' },
  { area: '其餘 modern 子頁', change: '延伸 habitat-ui.css flat pass 2（含原未點名 settings-subpage）' },
]

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SMB UI 扁平化修復報告</title>
<style>
:root{color-scheme:dark;--bg:#0d0d10;--card:#1c1c22;--border:rgba(255,255,255,.12);--text:#f0f0f5;--muted:#9999b4;--primary:#f5a623;--ok:#34d399}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);padding:24px 16px 48px;line-height:1.55}
.wrap{max-width:920px;margin:0 auto}h1{font-size:1.45rem;margin:0 0 8px}.meta{color:var(--muted);font-size:.88rem;margin-bottom:20px}
table{width:100%;border-collapse:collapse;font-size:.88rem}th,td{border-bottom:1px solid var(--border);padding:10px 12px;text-align:left;vertical-align:top}
th{color:var(--muted)}code{color:var(--primary);font-size:.85em}
.callout{border-left:3px solid var(--primary);padding:10px 14px;background:color-mix(in srgb,var(--primary) 8%,var(--card));margin:16px 0;font-size:.9rem}
</style>
</head>
<body><div class="wrap">
<h1>StrawMoneyBook — 現代 UI 扁平／線框修復報告</h1>
<p class="meta">版本 v1.5.68 · modern layout · habitat-ui.css flat pass 2 · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</p>
<div class="callout">範圍：你點名的頁面 + 同類 settings-subpage／請款報銷／日期選擇器；傳統 layout 不受影響。</div>
<table><thead><tr><th>頁面／區域</th><th>修復摘要</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${r.area}</td><td>${r.change}</td></tr>`).join('')}
</tbody></table>
<p class="meta">驗收建議：Playwright ui-layout／budget-display；modern 下目視確認月曆線框與會員方案對照列。</p>
</div></body></html>`

writeFileSync(out, html, 'utf8')
console.log(out)
