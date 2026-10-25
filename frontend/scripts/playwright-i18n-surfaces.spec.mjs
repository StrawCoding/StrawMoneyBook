async (page) => {
  page.setDefaultTimeout(7000)
  page.setDefaultNavigationTimeout(10000)
  const initialUrl = String(page.url())
  const baseOrigin = initialUrl.match(/^https?:\/\/[^/]+/u)?.[0] ?? 'http://127.0.0.1:4188'

  await page.evaluate(() => {
    localStorage.setItem('strawmoneybook.ui.layout', 'modern')
  })
  await page.goto(`${baseOrigin}/loans`, { waitUntil: 'domcontentloaded', timeout: 10000 })
  await completeOnboarding()
  await page.goto(`${baseOrigin}/loans`, { waitUntil: 'domcontentloaded', timeout: 10000 })
  await waitForLoans()

  const zhText = String(await page.locator('section.stack').innerText())
  if (!/借貸清單/.test(zhText)) {
    throw new Error(`zh-TW loans page missing keyed title\n${zhText}`)
  }
  if (await page.locator('h2', { hasText: '借貸清單' }).count() < 1) {
    throw new Error('loans h2 should render t(loans.list_title)')
  }

  await page.evaluate(() => {
    localStorage.setItem('strawmoneybook.locale', 'en')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForLoans()
  const enText = String(await page.locator('section.stack').innerText())
  if (!/\bLoans\b/.test(enText)) {
    throw new Error(`en loans page missing keyed title\n${enText}`)
  }
  if (/借貸清單/.test(enText)) {
    throw new Error(`en loans page still shows hardcoded Chinese title\n${enText}`)
  }

  await page.goto(`${baseOrigin}/reimbursements`, { waitUntil: 'domcontentloaded', timeout: 10000 })
  await page.waitForSelector('section.stack')
  const reimburseText = String(await page.locator('section.stack').innerText())
  if (!/Reimbursements/.test(reimburseText)) {
    throw new Error(`en reimbursements page missing keyed title\n${reimburseText}`)
  }

  await page.goto(`${baseOrigin}/settings/data-management`, { waitUntil: 'domcontentloaded', timeout: 10000 })
  await page.waitForSelector('section.stack')
  const dataText = String(await page.locator('section.stack').innerText())
  if (!/Data Management/.test(dataText)) {
    throw new Error(`en data-management page missing keyed title\n${dataText}`)
  }
  if (/資料管理/.test(dataText) || /（已完成資料檢查）/.test(dataText)) {
    throw new Error(`en data-management page still shows hardcoded Chinese copy\n${dataText}`)
  }

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
      await page.getByRole('button', { name: /Next|下一步|次へ/u }).click()
      await page.waitForTimeout(900)
      await page.locator('.welcome-root input.input').fill(`I18n Surfaces Ledger ${Date.now()}`)
      await page.getByRole('button', { name: /Create Ledger|建立帳本|帳簿を作成/u }).click()
      await page.waitForTimeout(2500)
      await page.locator('.welcome-root input.input').nth(0).fill('Cash')
      await page.locator('.welcome-root input.input').nth(1).fill('Wallet')
      await page.getByRole('button', { name: /Create Account|建立帳戶|口座を作成/u }).click()
      await page.waitForTimeout(3000)
    }

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await page.evaluate(() => ({
        hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
        intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      }))
      if (state.hasBottomNav) return
      if (state.intro) {
        await page.getByRole('button', { name: /Start now|先開始使用|Skip|今すぐ始める/u }).click()
      }
      await page.waitForTimeout(500)
    }
    throw new Error('onboarding failed: bottom-nav missing')
  }

  async function waitForLoans() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const ready = await page.evaluate(() => (
        window.location.pathname === '/loans'
        && Boolean(document.querySelector('section.stack'))
        && Boolean(document.querySelector('[data-testid="bottom-nav"]'))
      ))
      if (ready) return
      await page.waitForTimeout(400)
    }
    throw new Error(`loans page not ready: ${page.url()}`)
  }
}
