async (page) => {
  page.setDefaultTimeout(7000)
  page.setDefaultNavigationTimeout(10000)
  const initialUrl = String(page.url())
  const baseOrigin = initialUrl.match(/^https?:\/\/[^/]+/u)?.[0] ?? 'http://127.0.0.1:4178'

  await page.evaluate(() => {
    localStorage.setItem('strawmoneybook.ui.layout', 'modern')
  })
  await page.goto(`${baseOrigin}/budget`, { waitUntil: 'domcontentloaded', timeout: 10000 })
  await completeOnboarding()
  await navigateToDisplay()

  await page.waitForSelector('[data-testid="budget-display-page"]')
  await page.waitForSelector('[data-testid="budget-month-calendar"]')
  await page.waitForSelector('[data-testid="budget-category-table"]')
  await page.waitForSelector('[data-testid="bottom-nav"]')
  await page.locator('[data-testid="budget-display-settings"]').click()
  await page.waitForURL(/\/budget\/settings/)
  await page.waitForSelector('[data-testid="budget-page-period-settings"]')
  await page.waitForSelector('[data-testid="budget-page-period-pay-cycle"]')

  const categoryName = await createBudgetItemWithPayCycle(25)
  await page.goto(`${baseOrigin}/budget`, { waitUntil: 'domcontentloaded', timeout: 10000 })
  await navigateToDisplay()

  await page.waitForSelector('[data-testid="budget-display-period-previous"]')
  await page.waitForSelector('[data-testid="budget-month-calendar"]')
  const fadedCount = await page.locator('.day-cell.faded').count()
  if (fadedCount < 1) throw new Error('pay-cycle calendar should fade days outside the current period')
  const inPeriodDay = page.locator('.day-cell[data-in-period="true"]:not(.empty)').first()
  await inPeriodDay.click()
  await page.waitForSelector('[data-testid="budget-day-detail"]')

  const tableText = String(await page.locator('[data-testid="budget-category-table"]').innerText())
  if (!tableText.includes(categoryName)) throw new Error(`category table missing ${categoryName}\n${tableText}`)
  if (!/1,200|1200/.test(tableText)) throw new Error(`category table missing budget amount\n${tableText}`)
  const iconCount = await page.locator('[data-testid="budget-category-table"] svg, [data-testid="budget-category-table"] .row-icon').count()
  if (iconCount < 1) throw new Error('category table should render an icon')

  function assert(condition, message) {
    if (!condition) throw new Error(message)
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
      await page.locator('.welcome-root input.input').fill(`Budget Display Ledger ${Date.now()}`)
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

  async function navigateToDisplay() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const ready = await page.evaluate(() => (
        window.location.pathname === '/budget'
        && Boolean(document.querySelector('[data-testid="budget-display-page"]'))
        && Boolean(document.querySelector('[data-testid="bottom-nav"]'))
      ))
      if (ready) return
      await page.waitForTimeout(400)
    }
    throw new Error(`budget display not ready: ${page.url()}`)
  }

  async function createBudgetItemWithPayCycle(payDay) {
    await page.getByRole('button', { name: /Add Item|新增項目|項目を追加/u }).click()
    await page.waitForTimeout(700)
    await page.getByTestId('budget-item-period-pay-cycle').click()
    await page.getByTestId('budget-item-pay-day').fill(String(payDay))
    const categoryName = String(await page.locator('.form-wrap .custom-select .text').first().textContent()).trim()
    assert(Boolean(categoryName), 'budget item category should be preselected')
    await page.locator('.form-wrap input.input[type="number"]').last().fill('1200')
    await page.locator('button.btn.primary').filter({ hasText: /Save|儲存|保存/u }).click()
    await page.waitForTimeout(1800)
    return categoryName
  }
}
