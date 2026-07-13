async (page) => {
  page.setDefaultTimeout(7000)
  page.setDefaultNavigationTimeout(10000)
  const runtimeErrors = []
  page.on('pageerror', (error) => {
    runtimeErrors.push(`pageerror: ${error?.message ?? error}`)
  })
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' || /\[budget-period\].*failed/u.test(text)) {
      runtimeErrors.push(`console: ${text}`)
    }
  })
  const initialUrl = String(page.url())
  const baseOrigin = initialUrl.match(/^https?:\/\/[^/]+/u)?.[0] ?? 'http://127.0.0.1:4177'
  await installMockDate()
  await setAppDateIso('2026-07-13T12:00:00+08:00')
  await page.goto(`${baseOrigin}/budget`, { waitUntil: 'domcontentloaded', timeout: 10000 })
  await page.evaluate(() => {
    localStorage.setItem('strawmoneybook.ui.layout', 'modern')
  })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 })
  await performWelcomeSetup()
  await finishIntroIfVisible()
  await navigateToBudget()
  await assertBodyMatches(/Monthly Budget|每月預算|月預算|月間予算/u)
  await assertBodyDoesNotMatch(/Next pay day|下次發薪日|次の給与日/u)

  const itemCategory = await createBudgetItemWithPayCycle(25)
  await assertBodyMatches(/Pay Cycle Budget|發薪週期預算|給与サイクル予算/u)
  await assertRangeVisible('2026-06-25', '2026-07-24')
  await assertBodyMatches(/Next pay day|下次發薪日|次の給与日/u)
  await navigateToHome()
  await assertBodyMatches(/Next pay day|下次發薪日|次の給与日/u)
  await assertNoInvalidTimeValue('home pay-cycle startup')
  await navigateToBudget()
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 })
  await navigateToBudget()
  await assertRangeVisible('2026-06-25', '2026-07-24')
  await assertNoInvalidTimeValue('budget pay-cycle reload')

  await editBudgetItemBackToCalendar(itemCategory)
  await assertBodyMatches(/Monthly Budget|每月預算|月預算|月間予算/u)
  await assertBodyDoesNotMatch(/Next pay day|下次發薪日|次の給与日/u)

  await createContainerWithPayCycle(31)
  await assertBodyMatches(/Pay Cycle Budget|發薪週期預算|給与サイクル予算/u)
  await assertRangeVisible('2026-06-30', '2026-07-30')
  await assertBodyMatches(/Pay Cycle Pool/u)
  await setAppDateIso('2026-07-30T23:59:00+08:00')
  await triggerBudgetLifecycleRefresh()
  await assertRangeVisible('2026-06-30', '2026-07-30')
  await setAppDateIso('2026-07-31T00:00:00+08:00')
  await triggerBudgetLifecycleRefresh()
  await assertRangeVisible('2026-07-31', '2026-08-30')
  await navigateToHome()
  await assertRangeVisible('2026-07-31', '2026-08-30')
  await navigateToBudget()
  await setAppDateIso('2026-08-01T12:00:00+08:00')
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 })
  await navigateToBudget()
  await assertRangeVisible('2026-07-31', '2026-08-30')
  await assertNoInvalidTimeValue('month-start pay-cycle reload')
  await setAppDateIso('2026-03-01T12:00:00+08:00')
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 })
  await navigateToBudget()
  await assertRangeVisible('2026-02-28', '2026-03-30')
  await assertNoInvalidTimeValue('short-month pay-cycle reload')
  await assertNoBudgetPeriodRuntimeFailure()

  function assert(condition, message) {
    if (!condition) throw new Error(message)
  }

  async function installMockDate() {
    await page.addInitScript(() => {
      const RealDate = Date
      const readMockNow = () => {
        const raw = localStorage.getItem('__smb_playwright_now')
        const parsed = raw ? RealDate.parse(raw) : NaN
        return Number.isFinite(parsed) ? parsed : RealDate.now()
      }
      function MockDate(...args) {
        if (new.target) {
          return args.length ? new RealDate(...args) : new RealDate(readMockNow())
        }
        return args.length ? RealDate(...args) : new RealDate(readMockNow()).toString()
      }
      Object.setPrototypeOf(MockDate, RealDate)
      MockDate.prototype = RealDate.prototype
      MockDate.now = () => readMockNow()
      MockDate.parse = RealDate.parse
      MockDate.UTC = RealDate.UTC
      globalThis.Date = MockDate
    })
  }

  async function setAppDateIso(iso) {
    await page.evaluate((nextIso) => {
      localStorage.setItem('__smb_playwright_now', nextIso)
    }, iso)
  }

  async function triggerBudgetLifecycleRefresh() {
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(1200)
  }

  async function completeOnboarding() {
    await waitForAppState()
    if (await isWelcomeVisible()) {
      await performWelcomeSetup()
      await finishIntroIfVisible()
    }

    let readyTicks = 0
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const state = await page.evaluate(() => ({
        booting: Boolean(document.querySelector('.boot-layer')),
        hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
        welcome: Boolean(document.querySelector('.welcome-root')),
        intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      }))
      if (state.hasBottomNav && !state.welcome && !state.intro) {
        readyTicks += 1
        if (readyTicks >= 4) return
      } else {
        readyTicks = 0
      }
      if (!state.booting && (state.welcome || state.intro)) break
      await page.waitForTimeout(500)
    }

    if (await page.locator('.welcome-root').count()) {
      await performWelcomeSetup()
    }

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await page.evaluate(() => ({
        hasBottomNav: Boolean(document.querySelector('[data-testid=bottom-nav]')),
        welcome: Boolean(document.querySelector('.welcome-root')),
        intro: window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root')),
      }))
      if (state.hasBottomNav && !state.welcome && !state.intro) return
      if (state.intro) {
        await page.getByRole('button', { name: /Start now|先開始使用|Skip|今すぐ始める/u }).click()
      }
      await page.waitForTimeout(500)
    }
    throw new Error('onboarding failed: bottom-nav missing')
  }

  async function performWelcomeSetup() {
    await waitForBody(/Step\s*1\s*\/\s*3|歡迎|Welcome to StrawMoneyBook|ようこそ/u, 'welcome step 1')
    await clickWelcomePrimary()
    await waitForWelcomeStep(2)
    await waitForWelcomeInputCount(1)
    await fillWelcomeInput(0, `Pay Cycle Ledger ${Date.now()}`)
    await clickWelcomeCreate()
    await waitForWelcomeStep(3)
    await waitForWelcomeInputCount(2)
    await fillWelcomeInput(0, 'Cash')
    await fillWelcomeInput(1, 'Wallet')
    await clickWelcomeCreate()
    await page.waitForTimeout(1500)
  }

  async function waitForWelcomeStep(step) {
    const pattern = new RegExp(`(?:Step|步|ステップ)\\s*${step}\\s*/\\s*3|${step}\\s*/\\s*3`, 'u')
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const text = await readBodyText()
      if (pattern.test(text)) return
      await page.waitForTimeout(250)
    }
    throw new Error(`welcome step ${step} not reached`)
  }

  async function waitForWelcomeInputCount(count) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const inputCount = await page.evaluate(() => document.querySelectorAll('.welcome-root input.input').length)
      if (inputCount >= count) return
      await page.waitForTimeout(250)
    }
    throw new Error(`welcome input count ${count} not reached\n${(await readBodyText()).slice(0, 1200)}`)
  }

  async function clickWelcomePrimary() {
    await page.evaluate(() => {
      const button = document.querySelector('.welcome-root .wizard-actions button.btn.primary')
      if (!button) throw new Error('missing welcome primary button')
      button.click()
    })
  }

  async function clickWelcomeCreate() {
    await page.evaluate(() => {
      const button = document.querySelector('.welcome-root button.create-btn')
      if (!button) throw new Error('missing welcome create button')
      button.click()
    })
  }

  async function fillWelcomeInput(index, value) {
    await page.evaluate(({ index: inputIndex, value: inputValue }) => {
      const input = [...document.querySelectorAll('.welcome-root input.input')][inputIndex]
      if (!input) throw new Error(`missing welcome input ${inputIndex}`)
      input.focus()
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (setter) {
        setter.call(input, inputValue)
      } else {
        input.value = inputValue
      }
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, { index, value })
  }

  async function isWelcomeVisible() {
    return page.evaluate(() => (
      Boolean(document.querySelector('.welcome-root'))
      || /Welcome to StrawMoneyBook|歡迎|ようこそ|Step\s+\d+\s*\/\s*3/u.test(document.body?.innerText ?? '')
    ))
  }

  async function waitForAppState() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const ready = await page.evaluate(() => (
        Boolean(document.querySelector('.welcome-root'))
        || Boolean(document.querySelector('[data-testid=bottom-nav]'))
        || Boolean(document.querySelector('.intro-root'))
      ))
      if (ready) return
      await page.waitForTimeout(250)
    }
    throw new Error(`app state not ready\n${(await readBodyText()).slice(0, 1200)}`)
  }

  async function waitForBody(pattern, label) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const body = await readBodyText()
      if (pattern.test(body)) return
      await page.waitForTimeout(250)
    }
    throw new Error(`missing ${label}\n${(await readBodyText()).slice(0, 1200)}`)
  }

  async function navigateToBudget() {
    const currentUrl = String(page.url())
    const origin = currentUrl.match(/^https?:\/\/[^/]+/u)?.[0] ?? currentUrl.replace(/\/.*$/u, '')
    await page.goto(`${origin}/budget`, { waitUntil: 'domcontentloaded', timeout: 10000 })
    await waitForAppState()
    if (await isWelcomeVisible()) {
      await performWelcomeSetup()
      await finishIntroIfVisible()
      await page.goto(`${origin}/budget`, { waitUntil: 'domcontentloaded', timeout: 10000 })
      await waitForAppState()
    }
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await isWelcomeVisible()) {
        await performWelcomeSetup()
        await finishIntroIfVisible()
        await page.goto(`${origin}/budget`, { waitUntil: 'domcontentloaded', timeout: 10000 })
      }
      if (await isIntroVisible()) {
        await finishIntroIfVisible()
        await page.goto(`${origin}/budget`, { waitUntil: 'domcontentloaded', timeout: 10000 })
      }
      const ready = await page.evaluate(() => (
        window.location.pathname === '/budget'
        && Boolean(document.querySelector('.page-title'))
        && [...document.querySelectorAll('button')].some((button) => /Add Item|新增項目|項目を追加/u.test(button.textContent ?? ''))
      ))
      if (ready) return
      await page.waitForTimeout(500)
    }
    const body = String(await page.locator('body').textContent()).slice(0, 1200)
    throw new Error(`budget page not ready: ${page.url()}\n${body}`)
  }

  async function navigateToHome() {
    const currentUrl = String(page.url())
    const origin = currentUrl.match(/^https?:\/\/[^/]+/u)?.[0] ?? currentUrl.replace(/\/.*$/u, '')
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 10000 })
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const ready = await page.evaluate(() => (
        window.location.pathname === '/'
        && Boolean(document.querySelector('[data-testid=bottom-nav]'))
        && /Next pay day|下次發薪日|次の給与日/u.test(document.body?.innerText ?? '')
      ))
      if (ready) {
        await triggerBudgetLifecycleRefresh()
        return
      }
      await page.waitForTimeout(500)
    }
    const body = String(await page.locator('body').textContent()).slice(0, 1200)
    throw new Error(`home page not ready with pay-cycle card: ${page.url()}\n${body}`)
  }

  async function finishIntroIfVisible() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const intro = await isIntroVisible()
      if (!intro) return
      await page.getByRole('button', { name: /Start now|先開始使用|Skip|今すぐ始める/u }).click()
      await page.waitForTimeout(500)
    }
  }

  async function isIntroVisible() {
    return page.evaluate(() => (
      window.location.pathname.includes('/welcome/intro') || Boolean(document.querySelector('.intro-root'))
    ))
  }

  async function createBudgetItemWithPayCycle(payDay) {
    await closeOpenOverlayIfAny()
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

  async function editBudgetItemBackToCalendar(categoryName) {
    await closeOpenOverlayIfAny()
    await page.locator('.item-card-btn').filter({ hasText: categoryName }).click()
    await page.waitForTimeout(500)
    await page.locator('button.btn.primary').filter({ hasText: /Edit|編輯|編集/u }).click()
    await page.waitForTimeout(700)
    await page.getByTestId('budget-item-period-calendar').click()
    await page.locator('.form-wrap input.input[type="number"]').last().fill('1300')
    await page.locator('button.btn.primary').filter({ hasText: /Save|儲存|保存/u }).click()
    await page.waitForTimeout(1800)
  }

  async function createContainerWithPayCycle(payDay) {
    await closeOpenOverlayIfAny()
    await page.getByRole('button', { name: /Add Shared Budget Pool|新增共同預算池|共同予算プールを追加/u }).click()
    await page.waitForTimeout(700)
    await page.getByTestId('budget-container-period-pay-cycle').click()
    await page.getByTestId('budget-container-pay-day').fill(String(payDay))
    await page.locator('.form-wrap input.input[type="text"]').fill('Pay Cycle Pool')
    await page.locator('.form-wrap input.input[type="number"]').last().fill('2500')
    await page.locator('button.btn.primary').filter({ hasText: /Save|儲存|保存/u }).click()
    await page.waitForTimeout(1800)
  }

  async function closeOpenOverlayIfAny() {
    if (!(await page.locator('.app-overlay-sheet-mask').count())) return
    await page.evaluate(() => {
      window.dispatchEvent(new Event('app:request-close-overlay'))
    })
    await page.waitForTimeout(500)
  }

  async function readBodyText() {
    return String(await page.locator('body').textContent())
  }

  async function assertBodyMatches(pattern) {
    const body = await readBodyText()
    assert(pattern.test(body), `body did not match ${pattern}\n${body.slice(0, 1200)}`)
  }

  async function assertBodyDoesNotMatch(pattern) {
    const body = await readBodyText()
    assert(!pattern.test(body), `body unexpectedly matched ${pattern}\n${body.slice(0, 1200)}`)
  }

  async function assertRangeVisible(startDate, endDate) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const body = await readBodyText()
      if (body.includes(startDate) && body.includes(endDate)) return
      await page.waitForTimeout(250)
    }
    const body = await readBodyText()
    assert(false, `missing budget period range ${startDate}~${endDate}\n${body.slice(0, 1200)}`)
  }

  async function assertNoInvalidTimeValue(label) {
    await page.waitForTimeout(500)
    const debugSnapshot = await page.evaluate(() => {
      try {
        return JSON.parse(JSON.stringify(window.__SMB_ERROR_LOG__ ?? []))
      } catch {
        return []
      }
    })
    const evidence = [
      ...runtimeErrors,
      ...debugSnapshot.map((entry) => `${entry?.source ?? ''}: ${entry?.message ?? ''} ${entry?.routePath ?? ''}`),
    ].join('\n')
    assert(!/Invalid time value/u.test(evidence), `${label} surfaced Invalid time value\n${evidence}`)
  }

  async function assertNoBudgetPeriodRuntimeFailure() {
    const evidence = runtimeErrors.join('\n')
    assert(!/\[budget-period\].*failed/u.test(evidence), `budget period reload surfaced a runtime failure\n${evidence}`)
  }
}
