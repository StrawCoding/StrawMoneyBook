import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const uiRoot = join(frontendDir, 'src/ui')
const pkgVersion = JSON.parse(readFileSync(join(frontendDir, 'package.json'), 'utf8')).version

const CARD_MARKUP_RE = /\bcard\s+panel\b|class="[^"]*\bcard\s+panel\b|class='[^']*\bcard\s+panel\b/g
const CARD_CLASS_RE = /(?:^|[\s"'`(])(?:[\w-]*card[\w-]*)(?=[\s"'`)\]:])/gi
const PANEL_RE = /\bpanel\b/g

/** @type {{ id: string, label: string, hint: string }[]} */
const CLASSIFY_RULES = [
  { id: 'A', label: 'A · 必須移除', hint: '設定列、列表、toggle、selector、普通導航 row' },
  { id: 'B', label: 'B · 可保留 Card', hint: 'Summary / Entity / Dashboard widget / 連線實體卡' },
  { id: 'C', label: 'C · 人工判斷', hint: '摘要 + 列表複合、wizard、多 step、dialog 內 card' },
]

function walkVueFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      walkVueFiles(abs, out)
      continue
    }
    if (name.endsWith('.vue')) out.push(abs)
  }
  return out
}

function classifyFile(relPath, content, cardPanelCount) {
  const lower = relPath.toLowerCase()
  const name = lower.split('/').pop() ?? ''

  if (cardPanelCount === 0 && !/\bcard\b/.test(content)) {
    return { tier: 'OK', reason: '無 card.panel / 已 flow 化' }
  }

  if (/settings\.vue$/.test(name)) {
    return { tier: 'OK', reason: '設定 hub 已 Section + Row（無 card.panel）' }
  }

  if (/home|hero|summary|dashboard|membership-compare|connection-card|stats-panel|analytics-panel|health-panel/.test(content + lower)) {
    if (/adminpage|membershipbenefits|banksync|creditcard/i.test(relPath) && cardPanelCount > 0) {
      return { tier: 'C', reason: '儀表／摘要與列表或 step 混在同一頁，需拆 Section + 保留 SummaryCard' }
    }
  }

  if (/SettingsAdminPage|dashboard-hero|stats-panel|analytics-panel|membership-compare-panel/.test(content)) {
    return { tier: 'B', reason: 'Admin／會員方案矩陣：Dashboard 摘要 widget 可保留 Card' }
  }

  if (/connection-card|entity|account-detail|credit-cards|HomeBudgetSummary|HomeCreditSummary|HomeAssetSummary/.test(content + lower)) {
    return { tier: 'B', reason: 'Entity／連線／首頁摘要：具獨立財務語意' }
  }

  if (/SettingsBankSync|SettingsCarrierSync|SettingsDataManagement|SettingsSharedLedger|SettingsAutoBackup|wizard|step ===|reset-dialog|operation-progress/.test(content + relPath)) {
    return { tier: 'C', reason: '多 panel／wizard／確認 dialog：需拆 section，dialog 保留浮層 card' }
  }

  if (/SettingsAccountPage|login|session|forgotPassword/.test(relPath)) {
    return { tier: 'C', reason: '帳戶登入狀態機多區塊，逐區改 Section' }
  }

  if (/dialog|bottomsheet|overlay|AppDialog|restore-dialog/.test(content) && cardPanelCount <= 2) {
    return { tier: 'C', reason: '浮層內 card 通常保留（Dialog 語意）' }
  }

  if (/settings\//i.test(relPath) && cardPanelCount > 0) {
    return { tier: 'A', reason: '設定子頁 card.panel：應改 HabitatSection + Row' }
  }

  if (/ListPage|SearchPage|CategoryPage|LedgerPage|IconPicker/.test(relPath) && cardPanelCount > 0) {
    return { tier: 'A', reason: '列表／選擇頁：應 ListGroup + Row，非 Card 列表' }
  }

  if (cardPanelCount > 0) {
    return { tier: 'C', reason: '非設定頁，需對照是否 Summary 或列表' }
  }

  return { tier: 'C', reason: '含 card 類名但無 card.panel，檢查是否假扁平' }
}

function analyzeFile(absPath) {
  const content = readFileSync(absPath, 'utf8')
  const rel = relative(join(frontendDir, 'src'), absPath).replace(/\\/g, '/')
  const cardPanelMatches = content.match(CARD_MARKUP_RE) ?? []
  const cardPanelCount = cardPanelMatches.length
  const panelCount = (content.match(PANEL_RE) ?? []).length
  const cardTokens = new Set(
    (content.match(CARD_CLASS_RE) ?? [])
      .map((t) => t.trim().replace(/^['"(]+/, '').replace(/['")]+$/, ''))
      .filter((t) => t.length > 2 && !t.startsWith('credit-card')),
  )
  const { tier, reason } = classifyFile(rel, content, cardPanelCount)
  return {
    rel,
    cardPanelCount,
    panelCount,
    cardTokens: [...cardTokens].slice(0, 12),
    tier,
    reason,
  }
}

const allVue = walkVueFiles(uiRoot)
const rows = allVue.map(analyzeFile).sort((a, b) => {
  const order = { A: 0, C: 1, B: 2, OK: 3 }
  return (order[a.tier] ?? 9) - (order[b.tier] ?? 9) || b.cardPanelCount - a.cardPanelCount
})

const settingsRows = rows.filter((r) => r.rel.includes('ui/views/settings'))
const counts = {
  A: rows.filter((r) => r.tier === 'A').length,
  B: rows.filter((r) => r.tier === 'B').length,
  C: rows.filter((r) => r.tier === 'C').length,
  OK: rows.filter((r) => r.tier === 'OK').length,
}
const settingsCardPanels = settingsRows.reduce((n, r) => n + r.cardPanelCount, 0)

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function tierTag(tier) {
  const cls = { A: 'tag-a', B: 'tag-b', C: 'tag-c', OK: 'tag-ok' }[tier] ?? 'tag-c'
  return `<span class="tag ${cls}">${esc(tier)}</span>`
}

function tableBody(list) {
  return list.map((r) => `<tr>
    <td>${tierTag(r.tier)}</td>
    <td><code>${esc(r.rel)}</code></td>
    <td class="num">${r.cardPanelCount}</td>
    <td class="num">${r.panelCount}</td>
    <td class="tokens">${r.cardTokens.map((t) => `<code>${esc(t)}</code>`).join(' ') || '—'}</td>
    <td>${esc(r.reason)}</td>
  </tr>`).join('')
}

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>StrawMB 去區塊化掃描 — v${esc(pkgVersion)}</title>
  <style>
    :root { color-scheme: dark; --bg:#0d0d10; --card:#1c1c22; --border:rgba(255,255,255,.12); --text:#f0f0f5; --muted:#9999b4; --primary:#f5a623; --a:#f87171; --b:#34d399; --c:#fbbf24; --ok:#94a3b8; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 20px 14px 48px; line-height: 1.5; }
    .wrap { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.45rem; margin: 0 0 8px; }
    .meta { color: var(--muted); font-size: 0.88rem; margin-bottom: 16px; }
    .stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 24px; }
    .stat { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; min-width: 120px; }
    .stat strong { display: block; font-size: 1.35rem; }
    h2 { font-size: 1.05rem; color: var(--primary); margin: 28px 0 10px; }
    .callout { border-left: 3px solid var(--primary); padding: 10px 12px; background: color-mix(in srgb, var(--primary) 8%, var(--card)); margin: 12px 0; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th, td { border-bottom: 1px solid var(--border); padding: 8px 6px; vertical-align: top; text-align: left; }
    th { color: var(--muted); font-weight: 650; position: sticky; top: 0; background: var(--bg); }
    code { color: #f7c26b; font-size: 0.78rem; word-break: break-all; }
    .num { text-align: center; width: 52px; }
    .tokens code { margin-right: 4px; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
    .tag-a { background: color-mix(in srgb, var(--a) 22%, transparent); color: #fecaca; }
    .tag-b { background: color-mix(in srgb, var(--b) 22%, transparent); color: #a7f3d0; }
    .tag-c { background: color-mix(in srgb, var(--c) 22%, transparent); color: #fde68a; }
    .tag-ok { background: color-mix(in srgb, var(--ok) 22%, transparent); color: #cbd5e1; }
    ul.legend { margin: 8px 0; padding-left: 1.2rem; color: var(--muted); font-size: 0.88rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>StrawMoneyBook — 去區塊化 / 去卡片化掃描</h1>
    <p class="meta">v${esc(pkgVersion)} · 掃描 <code>frontend/src/ui/**/*.vue</code> · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
    <div class="callout">分類為 heuristics（路徑 + 關鍵 class），<strong>C 類請人工確認</strong>。Batch 1 已完成：語言／安全／關於／版本／個人化／開發者 Debug → <code>HabitatSection</code>。</div>
    <ul class="legend">
      ${CLASSIFY_RULES.map((r) => `<li><strong>${esc(r.label)}</strong> — ${esc(r.hint)}</li>`).join('')}
    </ul>
    <div class="stats">
      <div class="stat"><strong>${counts.A}</strong> A 必須移除</div>
      <div class="stat"><strong>${counts.C}</strong> C 人工判斷</div>
      <div class="stat"><strong>${counts.B}</strong> B 可保留</div>
      <div class="stat"><strong>${counts.OK}</strong> OK / 已 flow</div>
      <div class="stat"><strong>${settingsCardPanels}</strong> Settings 剩餘 card.panel 次數</div>
    </div>
    <h2>Settings 目錄（優先）</h2>
    <table>
      <thead><tr><th>類</th><th>檔案</th><th>card.panel</th><th>panel</th><th>card 類名</th><th>原因</th></tr></thead>
      <tbody>${tableBody(settingsRows)}</tbody>
    </table>
    <h2>全 UI Vue 檔</h2>
    <table>
      <thead><tr><th>類</th><th>檔案</th><th>card.panel</th><th>panel</th><th>card 類名</th><th>原因</th></tr></thead>
      <tbody>${tableBody(rows)}</tbody>
    </table>
  </div>
</body>
</html>`

const outPath = join(frontendDir, '.artifacts/smb-decard-scan-report.html')
writeFileSync(outPath, html, 'utf8')
console.log(outPath)
console.log(JSON.stringify({ counts, settingsCardPanels, files: rows.length }, null, 2))
