import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'
import { blockUiDynamicRouteTemplates, blockUiReportRoutes } from './block-ui-report-routes.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewPort = Number(process.env.BLOCK_UI_SHOT_PORT || 4194)
const baseUrl = `http://127.0.0.1:${previewPort}`
const outDir = resolve(frontendDir, '.artifacts/block-ui-shots')
const generatedSpecPath = resolve(frontendDir, 'scripts/playwright-block-ui-screenshots.generated.spec.mjs')

const { runPlaywrightCli, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'block-ui-shots',
  port: previewPort,
})

function stopPreviewOnPort(port) {
  try {
    spawn('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' })
  } catch {
    // ignore
  }
}

async function waitForPreviewReady() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`)
      if (response.ok) return
    } catch {
      // retry
    }
    await delay(500)
  }
  throw new Error(`preview server not ready at ${baseUrl}`)
}

function writeGeneratedSpec() {
  const body = `async (page) => {
  const outDir = ${JSON.stringify(outDir)}
  const staticRoutes = ${JSON.stringify(blockUiReportRoutes)}
  const dynamicTemplates = ${JSON.stringify(blockUiDynamicRouteTemplates)}

  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(20000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => localStorage.setItem('strawmoneybook.ui.layout', 'modern'))

  async function completeOnboarding() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const state = await page.evaluate(() => ({
        booting: Boolean(document.querySelector('.boot-layer')),
        hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
        welcome: Boolean(document.querySelector('.welcome-root')),
        intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      }))
      if (state.hasBottomNav) return
      if (!state.booting && (state.welcome || state.intro)) break
      await page.waitForTimeout(500)
    }
    if (await page.locator('.welcome-root').count()) {
      await page.getByRole('button', { name: /Next|下一步|次へ/u }).first().click()
      await page.waitForTimeout(900)
      await page.locator('.welcome-root input.input').first().fill('Block UI Shot ' + Date.now())
      await page.getByRole('button', { name: /Create Ledger|建立帳本|帳簿を作成/u }).first().click()
      await page.waitForTimeout(2500)
      const inputs = page.locator('.welcome-root input.input')
      await inputs.nth(0).fill('Cash')
      await inputs.nth(1).fill('Wallet')
      await page.getByRole('button', { name: /Create Account|建立帳戶|口座を作成/u }).first().click()
      await page.waitForTimeout(3000)
    }
    if (await page.locator('.intro-root').count()) {
      await page.getByRole('button', { name: /Start now|先開始使用|Skip|今すぐ始める/u }).first().click()
      await page.waitForTimeout(1500)
    }
    await page.waitForSelector('[data-testid=bottom-nav]', { timeout: 60000 })
  }

  async function snap(slug) {
    await page.screenshot({ path: outDir + '/' + slug + '.png', fullPage: false })
  }

  async function settle() {
    await page.waitForTimeout(700)
    if (await page.locator('.boot-layer').count()) {
      await page.waitForSelector('.boot-layer', { state: 'hidden', timeout: 20000 }).catch(() => {})
    }
  }

  async function capturePath(slug, path) {
    const initialUrl = String(page.url())
    const baseOrigin = initialUrl.match(/^https?:\\/\\/[^/]+/u)?.[0] ?? ${JSON.stringify(baseUrl)}
    try {
      await page.goto(baseOrigin + path, { waitUntil: 'domcontentloaded' })
      await settle()
      await snap(slug)
      return { slug, path, ok: true }
    } catch (error) {
      try { await snap(slug + '--failed') } catch { /* ignore */ }
      return { slug, path, ok: false, error: String(error?.message || error) }
    }
  }

  async function resolveDynamicPaths() {
    const initialUrl = String(page.url())
    const baseOrigin = initialUrl.match(/^https?:\\/\\/[^/]+/u)?.[0] ?? ${JSON.stringify(baseUrl)}
    const pickHref = async (path, selector) => {
      await page.goto(baseOrigin + path, { waitUntil: 'domcontentloaded' })
      await settle()
      return page.evaluate((sel) => {
        const el = document.querySelector(sel)
        const href = el?.getAttribute('href') || el?.closest('a')?.getAttribute('href') || ''
        return href.startsWith('/') ? href : ''
      }, selector)
    }
    const ledgerDetailPath = await pickHref('/settings/ledgers', 'a[href^="/settings/ledgers/"]')
    const categoryDetailPath = await pickHref('/settings/categories', 'a[href^="/settings/categories/"]')
    const accountDetailPath = await pickHref('/assets/accounts', 'a[href^="/accounts/"]')
    await page.goto(baseOrigin + '/', { waitUntil: 'domcontentloaded' })
    await settle()
    const transactionDetailPath = await page.evaluate(() => {
      const row = document.querySelector('[data-testid=home-transaction-feed] li, .tx-item, [data-testid^="home-tx-"]')
      const id = row?.getAttribute('data-testid')?.replace(/^home-tx-/, '')
      return id ? '/transactions/' + id : ''
    })
    const transactionEditPath = transactionDetailPath ? transactionDetailPath + '/edit' : ''
    return {
      ledgerDetailPath,
      categoryDetailPath,
      adminUserPath: '',
      accountDetailPath,
      transactionDetailPath,
      transactionEditPath,
      loanDetailPath: '',
      securityDetailPath: '',
      claimSheetDetailPath: '',
    }
  }

  await completeOnboarding()
  const results = []
  for (const route of staticRoutes) {
    results.push(await capturePath(route.slug, route.path))
  }
  const dynamic = await resolveDynamicPaths()
  for (const tpl of dynamicTemplates) {
    const path = dynamic[tpl.pathKey]
    if (!path) {
      results.push({ slug: tpl.slug, path: '', ok: false, error: 'no dynamic path' })
      continue
    }
    results.push(await capturePath(tpl.slug, path))
  }

  await page.evaluate((payload) => {
    window.__BLOCK_UI_SHOT_RESULTS__ = payload
  }, results)
}
`
  writeFileSync(generatedSpecPath, body, 'utf8')
}

function pngToDataUrl(filePath) {
  if (!existsSync(filePath)) return ''
  const buf = readFileSync(filePath)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function buildReportHtml(manifest) {
  const sectionTitles = {
    ref: '參考（已扁平 flow）',
    css: '一、CSS 扁平 · markup 仍 card',
    settings: '二、設定子頁',
    tx: '三、交易／記帳／圖示',
    assets: '四、資產／帳戶',
    loans: '四、借貸',
    claims: '五、請款／報銷',
    einvoice: '六、電子發票',
  }

  const bySection = new Map()
  for (const item of manifest.items) {
    const list = bySection.get(item.section) || []
    list.push(item)
    bySection.set(item.section, list)
  }

  let sectionsHtml = ''
  for (const [section, items] of bySection) {
    const cards = items.map((item) => {
      const src = item.dataUrl || ''
      const status = item.ok
        ? '<span class="tag tag-light">OK</span>'
        : '<span class="tag tag-heavy">略過</span>'
      const img = src
        ? `<img src="${src}" alt="${item.label}" loading="lazy" />`
        : '<p class="muted">無截圖</p>'
      return `<article class="shot-card">
        <header><strong>${item.label}</strong> ${status}<br /><code>${item.path || '—'}</code></header>
        <div class="shot-frame">${img}</div>
      </article>`
    }).join('')
    sectionsHtml += `<h2>${sectionTitles[section] || section}</h2><div class="shot-grid">${cards}</div>`
  }

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>StrawMB 區塊 UI 盤點 + 頁面截圖</title>
  <style>
    :root { color-scheme: dark; --bg: #0d0d10; --card: #1c1c22; --border: rgba(255,255,255,.12); --text: #f0f0f5; --muted: #9999b4; --primary: #f5a623; --primary-soft: #f7c26b; --ok: #34d399; --danger: #f87171; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 20px 14px 40px; line-height: 1.5; }
    .wrap { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 1.45rem; margin: 0 0 8px; }
    .meta { color: var(--muted); font-size: 0.88rem; margin-bottom: 20px; }
    h2 { font-size: 1.05rem; color: var(--primary-soft); margin: 28px 0 12px; }
    .shot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .shot-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .shot-card header { padding: 10px 12px; font-size: 0.82rem; border-bottom: 1px solid var(--border); }
    .shot-frame { background: #000; }
    .shot-frame img { display: block; width: 100%; height: auto; }
    code { color: var(--primary-soft); font-size: 0.78rem; }
    .tag { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 0.72rem; font-weight: 650; }
    .tag-light { background: color-mix(in srgb, var(--ok) 18%, transparent); color: #a7f3d0; }
    .tag-heavy { background: color-mix(in srgb, var(--danger) 22%, transparent); color: #fecaca; }
    .callout { border-left: 3px solid var(--primary); padding: 10px 12px; background: color-mix(in srgb, var(--primary) 8%, var(--card)); margin: 16px 0; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>StrawMoneyBook — 區塊 UI 盤點 + 各頁截圖</h1>
    <p class="meta">Playwright · 390×844 · ${manifest.versionNote} · ${manifest.capturedAt}</p>
    <div class="callout">截圖：390×844 preview（CI 同環境，非 ADB）。<strong>flat pass 2</strong> 後線框月曆／segmented／settings 扁平。修復摘要：<a href="https://download.hermes.wastebase.xyz/smb-ui-flat-repair-report.html" style="color:var(--primary-soft)">smb-ui-flat-repair-report</a>。空帳本動態路由可能略過。</div>
    <p class="meta">markup 盤點：58 檔仍含 <code>card panel</code>；modern 頂層多已視覺扁平。</p>
    ${sectionsHtml}
  </div>
</body>
</html>`
}

console.log('--- Playwright: block UI report page screenshots ---')
mkdirSync(outDir, { recursive: true })
writeGeneratedSpec()

if (!process.env.BLOCK_UI_SHOT_SKIP_BUILD) {
  console.log('Building web preview bundle...')
  await execFileAsync('npm', ['run', 'build:web'], {
    cwd: frontendDir,
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 300000,
  })
}

stopPreviewOnPort(previewPort)
await delay(600)

const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
  cwd: frontendDir,
  stdio: 'ignore',
  env: process.env,
})

try {
  await waitForPreviewReady()
  await ensurePlaywrightChromium()
  await runPlaywrightCli(['delete-data'], { timeout: 120000 })
  await runPlaywrightCli(['open', `${baseUrl}/`], { timeout: 120000 })
  await runPlaywrightCli(['resize', '390', '844'])
  await runPlaywrightCli(['run-code', '--filename', 'scripts/playwright-block-ui-screenshots.generated.spec.mjs'], {
    timeout: 900000,
  })

  const routeMeta = [...blockUiReportRoutes, ...blockUiDynamicRouteTemplates.map((t) => ({
    section: t.section,
    slug: t.slug,
    label: t.label,
    path: `(dynamic ${t.pathKey})`,
  }))]

  const items = routeMeta.map((route) => {
    const pngPath = join(outDir, `${route.slug}.png`)
    const failedPath = join(outDir, `${route.slug}--failed.png`)
    const ok = existsSync(pngPath)
    const usePath = ok ? pngPath : (existsSync(failedPath) ? failedPath : '')
    return {
      ...route,
      ok,
      dataUrl: usePath ? pngToDataUrl(usePath) : '',
    }
  })

  const pkgVersion = JSON.parse(readFileSync(join(frontendDir, 'package.json'), 'utf8')).version
  const html = buildReportHtml({
    items,
    versionNote: `v${pkgVersion} preview (modern)`,
    capturedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
  })

  const htmlPath = join(outDir, 'smb-block-ui-inventory-report.html')
  writeFileSync(htmlPath, html, 'utf8')
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ items: items.map(({ dataUrl, ...rest }) => rest) }, null, 2))
  console.log(`Wrote ${htmlPath}`)
} finally {
  preview.kill('SIGTERM')
  stopPreviewOnPort(previewPort)
  await delay(400)
  await runPlaywrightCli(['close'], { raw: true }).catch(() => {})
}
