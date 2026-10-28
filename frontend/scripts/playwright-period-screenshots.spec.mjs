async (page) => {
  // run-code sandbox has no process.env; path is written by playwright-period-screenshots.mjs
  const outDir = '/mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend/.artifacts/period-screenshots'

  page.setDefaultTimeout(12000)
  page.setDefaultNavigationTimeout(15000)

  const initialUrl = String(page.url())
  const baseOrigin = initialUrl.match(/^https?:\/\/[^/]+/u)?.[0] ?? 'http://127.0.0.1:4192'

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    localStorage.setItem('strawmoneybook.ui.layout', 'modern')
  })

  async function snap(name) {
    const file = `${outDir}/${name}.png`
    await page.screenshot({ path: file, fullPage: false })
    return file
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
      await page.getByRole('button', { name: /Next|下一步|次へ/u }).first().click()
      await page.waitForTimeout(900)
      await page.locator('.welcome-root input.input').first().fill(`Period Shot ${Date.now()}`)
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

  async function waitPeriodSettled() {
    await page.waitForTimeout(450)
  }

  async function captureHome() {
    await page.goto(`${baseOrigin}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid=home-period-chrome]')
    await page.waitForSelector('[data-testid=home-transaction-feed]')
    await snap('01-home-period-default')
    await page.locator('[data-testid=home-period-next]').click()
    await waitPeriodSettled()
    await snap('02-home-period-after-next')
  }

  async function captureAnalysis() {
    await page.goto(`${baseOrigin}/analysis`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid=analysis-period-chrome]')
    await page.waitForSelector('[data-testid=analysis-big-numbers]')
    await snap('03-analysis-period-default')
    await page.locator('[data-testid=analysis-period-next]').click()
    await waitPeriodSettled()
    await snap('04-analysis-period-after-next')
  }

  async function captureBudget() {
    await page.goto(`${baseOrigin}/budget`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid=budget-display-page]', { timeout: 30000 })
    await page.waitForSelector('[data-testid=budget-month-calendar], [data-testid=budget-display-view-calendar]', { timeout: 30000 }).catch(() => {})
    const calBtn = page.locator('[data-testid=budget-display-view-calendar]')
    if (await calBtn.count()) await calBtn.click()
    await page.waitForSelector('[data-testid=budget-month-calendar]', { timeout: 15000 })
    await snap('05-budget-period-default')
    await page.locator('[data-testid=budget-calendar-next-month]').click()
    await waitPeriodSettled()
    await snap('06-budget-calendar-after-next')
  }

  async function captureCalendar() {
    await page.goto(`${baseOrigin}/transactions/calendar`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid=calendar-view]')
    await page.waitForSelector('.calendar-grid')
    await snap('07-calendar-month-default')
    await page.locator('.month-head button').last().click()
    await waitPeriodSettled()
    await snap('08-calendar-month-after-next')
  }

  await completeOnboarding()
  await captureHome()
  await captureAnalysis()
  await captureBudget()
  await captureCalendar()

}
