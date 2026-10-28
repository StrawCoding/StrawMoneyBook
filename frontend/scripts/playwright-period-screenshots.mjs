import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

import { createPlaywrightCliRunner } from './playwright-cli-runtime.mjs'

const execFileAsync = promisify(execFile)
const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
// Node fetch rejects port 4190 ("bad port"); keep off that value.
const previewPort = Number(process.env.PERIOD_SCREENSHOT_PORT || 4192)
const baseUrl = `http://127.0.0.1:${previewPort}`
const outDir = resolve(process.env.PERIOD_SCREENSHOT_DIR || join(frontendDir, '.artifacts/period-screenshots'))

const { runPlaywrightCli, ensurePlaywrightChromium } = createPlaywrightCliRunner({
  label: 'period-screenshots',
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

function pngToDataUrl(filePath) {
  const buf = readFileSync(filePath)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function buildHtml(manifest) {
  const labels = {
    '01-home-period-default': '首頁 · 目前期間',
    '02-home-period-after-next': '首頁 · 下一期（動畫後）',
    '03-analysis-period-default': '分析 · 目前期間',
    '04-analysis-period-after-next': '分析 · 下一期（動畫後）',
    '05-budget-period-default': '預算 · 月曆檢視',
    '06-budget-calendar-after-next': '預算 · 下一月（動畫後）',
    '07-calendar-month-default': '日曆 · 目前月份',
    '08-calendar-month-after-next': '日曆 · 下一月（動畫後）',
  }
  const cards = manifest.files.map((name) => {
    const base = name.replace(/\.png$/u, '')
    const title = labels[base] || base
    const src = pngToDataUrl(join(outDir, name))
    return `<figure class="shot"><figcaption>${title}</figcaption><img src="${src}" alt="${title}" loading="lazy" /></figure>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SMB 期間切換 · 各頁截圖</title>
  <style>
    :root { color-scheme: dark; --bg: #12141a; --card: #1c2029; --text: #e8eaef; --muted: #9aa3b2; --accent: #e8a317; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    header { padding: 24px 20px 12px; max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 1.35rem; }
    p { margin: 0; color: var(--muted); font-size: 0.92rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 16px 20px 32px; max-width: 1200px; margin: 0 auto; }
    .shot { margin: 0; background: var(--card); border-radius: 12px; overflow: hidden; border: 1px solid #2a3140; }
    .shot figcaption { padding: 10px 12px; font-size: 0.85rem; font-weight: 600; border-bottom: 1px solid #2a3140; }
    .shot img { display: block; width: 100%; height: auto; background: #000; }
    .note { max-width: 1200px; margin: 0 auto 24px; padding: 0 20px; font-size: 0.85rem; color: var(--muted); }
    .note strong { color: var(--accent); font-weight: 600; }
  </style>
</head>
<body>
  <header>
    <h1>StrawMoneyBook · 期間／日期切換各頁預覽</h1>
    <p>Playwright Chromium · 390×844 手機視窗 · ${manifest.baseOrigin} · v1.5.65 預覽 bundle</p>
  </header>
  <p class="note"><strong>說明：</strong>與 CI <code>playwright:ui-layout</code> 相同環境（非實機 ADB）。每頁含「預設」與「步進下一期／月」後定格，供確認 <code>PeriodContentTransition</code> 整體過場。</p>
  <div class="grid">${cards}</div>
</body>
</html>`
}

console.log('--- Playwright: period shift page screenshots ---')
mkdirSync(outDir, { recursive: true })

let preview = null
if (!process.env.PERIOD_SCREENSHOT_SKIP_BUILD) {
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

preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
  cwd: frontendDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
})

try {
  await waitForPreviewReady()
  if (preview.exitCode != null) {
    const errText = `${preview.stderr?.read?.() ?? ''}`
    throw new Error(`vite preview exited early (code=${preview.exitCode}): ${errText}`)
  }
  await ensurePlaywrightChromium()
  await runPlaywrightCli(['delete-data'], { timeout: 120000 })
  await runPlaywrightCli(['open', `${baseUrl}/`], { timeout: 120000 })
  await runPlaywrightCli(['resize', '390', '844'])

  process.env.PERIOD_SCREENSHOT_DIR = outDir
  const flow = await runPlaywrightCli([
    'run-code',
    '--filename',
    'scripts/playwright-period-screenshots.spec.mjs',
  ], { timeout: 600000 })
  if (flow.stdout) process.stdout.write(flow.stdout)
  if (flow.stderr) process.stderr.write(flow.stderr)

  const files = [
    '01-home-period-default.png',
    '02-home-period-after-next.png',
    '03-analysis-period-default.png',
    '04-analysis-period-after-next.png',
    '05-budget-period-default.png',
    '06-budget-calendar-after-next.png',
    '07-calendar-month-default.png',
    '08-calendar-month-after-next.png',
  ]
  for (const name of files) {
    const full = join(outDir, name)
    if (!existsSync(full)) {
      throw new Error(`missing screenshot ${full}`)
    }
  }
  const manifest = { baseOrigin: baseUrl, files }
  const htmlPath = join(outDir, 'smb-period-shift-screenshots.html')
  writeFileSync(htmlPath, buildHtml(manifest), 'utf8')
  console.log(`Wrote ${htmlPath}`)
  console.log(`PNG dir: ${outDir}`)
} finally {
  if (preview?.pid) {
    try {
      spawn('pkill', ['-P', String(preview.pid)], { stdio: 'ignore' })
    } catch {
      // ignore
    }
    preview.kill('SIGTERM')
  }
  stopPreviewOnPort(previewPort)
  await delay(400)
  await runPlaywrightCli(['close'], { raw: true }).catch(() => {})
}
