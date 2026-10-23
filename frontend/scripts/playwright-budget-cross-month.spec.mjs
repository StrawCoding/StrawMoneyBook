async (page) => {
  await page.evaluate(() => {
    localStorage.setItem('strawmoneybook.ui.layout', 'modern')
  })
  await completeOnboarding()
  await navigateToBudget()

  await pickBudgetMonth('2026-11')
  await createPool({ name: 'Cross Monthly Pool', amount: 1000, applyThroughMonth: '2027-01' })
  await assertBudgetBodyContains('2026-11', 'Cross Monthly Pool')
  await assertBudgetBodyContains('2026-12', 'Cross Monthly Pool')
  await assertBudgetBodyContains('2027-01', 'Cross Monthly Pool')

  await pickBudgetMonth('2026-02')
  await createPool({
    name: 'Cross Daily Pool',
    amount: 100,
    applyThroughMonth: '2026-03',
    periodMode: 'daily',
    selectFirstCategory: true,
  })
  await assertBudgetBodyContains('2026-02', 'Cross Daily Pool')
  await assertBudgetBodyContains('2026-03', 'Cross Daily Pool')

  await pickBudgetMonth('2026-11')
  await createPool({ name: 'Reverse Range Pool', amount: 100, applyThroughMonth: '2026-10' })
  await assertToastContains(/套用月份格式不正確|invalid|開始月より前/u)
  await closeOpenOverlayIfAny()
  await assertBudgetBodyDoesNotContain('2026-11', 'Reverse Range Pool')

  await pickBudgetMonth('2026-12')
  await createPool({ name: 'Collision Pool', amount: 300 })
  await pickBudgetMonth('2026-11')
  await createPool({ name: 'Collision Pool', amount: 300, applyThroughMonth: '2027-01' })
  await assertToastContains(/2026-12/u)
  await closeOpenOverlayIfAny()
  await assertBudgetBodyDoesNotContain('2027-01', 'Collision Pool')

  await pickBudgetMonth('2027-11')
  const crossItemCategory = await createBudgetItem({ amount: 1234, applyThroughMonth: '2028-01' })
  await assertBudgetBodyContains('2027-11', crossItemCategory)
  await assertBudgetBodyContains('2027-12', crossItemCategory)
  await assertBudgetBodyContains('2028-01', crossItemCategory)

  await pickBudgetMonth('2028-02')
  await createBudgetItem({ amount: 777, applyThroughMonth: '2028-01' })
  await assertToastContains(/套用月份格式不正確|invalid|開始月より前/u)
  await closeOpenOverlayIfAny()

  await pickBudgetMonth('2027-12')
  await createBudgetItem({ amount: 555, applyThroughMonth: '2028-02' })
  await assertToastContains(/2027-12/u)
  await closeOpenOverlayIfAny()
  await assertBudgetBodyDoesNotContain('2028-02', crossItemCategory)

  await pickBudgetMonth('2027-12')
  await editBudgetItemAmount(crossItemCategory, 2222)
  await assertBodyMatches(/2,222|2222/u)
  await pickBudgetMonth('2028-01')
  await assertBodyDoesNotMatch(/2,222|2222/u)

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
      await page.locator('.welcome-root input.input').fill(`Cross Month Ledger ${Date.now()}`)
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

  async function navigateToBudget() {
    await page.locator('[data-testid="bottom-nav-features"]').click()
    await page.waitForTimeout(800)
    await page.locator('a.feature-link[href="/budget/settings"]').click()
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const ready = await page.evaluate(() => (
        window.location.pathname === '/budget/settings'
        && Boolean(document.querySelector('.page-title'))
        && [...document.querySelectorAll('button')].some((button) => /Add Shared Budget Pool|新增共同預算池|共同予算プール/u.test(button.textContent ?? ''))
      ))
      if (ready) return
      await page.waitForTimeout(500)
    }
    throw new Error('budget page not ready')
  }

  async function pickBudgetMonth(monthKey) {
    const [yearText, monthText] = monthKey.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    await page.locator('article.panel .range-picker .trigger').first().click()
    await page.waitForTimeout(300)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const currentYear = await page.locator('.panel-head strong').textContent().then((text) => {
        const matched = String(text ?? '').match(/\d{4}/u)
        return matched ? Number(matched[0]) : null
      })
      if (currentYear === year) break
      await page.locator('.panel-head .nav-btn').nth(currentYear < year ? 1 : 0).click()
      await page.waitForTimeout(200)
    }
    await page.locator('.month-grid .cell-btn').nth(month - 1).click()
    await page.waitForTimeout(900)
    const label = String(await page.locator('article.panel .range-picker .trigger').first().textContent())
    assert(new RegExp(`${year}|${month}`, 'u').test(label), `budget month label mismatch: ${label}`)
  }

  async function createPool({ name, amount, applyThroughMonth = '', periodMode = 'monthly', selectFirstCategory = false }) {
    await closeOpenOverlayIfAny()
    await page.getByRole('button', { name: /Add Shared Budget Pool|新增共同預算池|共同予算プールを追加/u }).click()
    await page.waitForTimeout(700)
    await page.locator('.form-wrap input.input[type="text"]').fill(name)
    if (periodMode === 'daily') {
      await page.locator('.period-mode-btn').nth(1).click()
      await page.waitForTimeout(300)
      if (selectFirstCategory) {
        await page.locator('.category-chip-grid .category-chip').first().click()
        await page.waitForTimeout(200)
      }
    }
    if (applyThroughMonth) {
      await page.locator('.form-wrap input.input[type="month"]').fill(applyThroughMonth)
    }
    await page.locator('.form-wrap input.input[type="number"]').fill(String(amount))
    await page.locator('button.btn.primary').filter({ hasText: /Save|儲存|保存/u }).click()
    await page.waitForTimeout(1200)
  }

  async function createBudgetItem({ amount, applyThroughMonth = '' }) {
    await closeOpenOverlayIfAny()
    await page.getByRole('button', { name: /Add Item|新增項目|項目を追加/u }).click()
    await page.waitForTimeout(700)
    const categoryName = String(await page.locator('.form-wrap .custom-select .text').first().textContent()).trim()
    assert(Boolean(categoryName), 'budget item category should be preselected')
    if (applyThroughMonth) {
      await page.locator('.form-wrap input.input[type="month"]').fill(applyThroughMonth)
    }
    await page.locator('.form-wrap input.input[type="number"]').fill(String(amount))
    await page.locator('button.btn.primary').filter({ hasText: /Save|儲存|保存/u }).click()
    await page.waitForTimeout(1200)
    return categoryName
  }

  async function editBudgetItemAmount(categoryName, amount) {
    await closeOpenOverlayIfAny()
    await page.locator('.item-card-btn').filter({ hasText: categoryName }).click()
    await page.waitForTimeout(500)
    await page.locator('button.btn.primary').filter({ hasText: /Edit|編輯|編集/u }).click()
    await page.waitForTimeout(500)
    const monthInputCount = await page.locator('.form-wrap input.input[type="month"]').count()
    assert(monthInputCount === 0, 'editing an existing budget item must not show cross-month apply-through')
    await page.locator('.form-wrap input.input[type="number"]').fill(String(amount))
    await page.locator('button.btn.primary').filter({ hasText: /Save|儲存|保存/u }).click()
    await page.waitForTimeout(1200)
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

  async function assertBudgetBodyContains(monthKey, text) {
    await pickBudgetMonth(monthKey)
    const body = await readBodyText()
    assert(body.includes(text), `${monthKey} body did not contain ${text}`)
  }

  async function assertBudgetBodyDoesNotContain(monthKey, text) {
    await pickBudgetMonth(monthKey)
    const body = await readBodyText()
    assert(!body.includes(text), `${monthKey} body unexpectedly contained ${text}`)
  }

  async function assertBodyMatches(pattern) {
    const body = await readBodyText()
    assert(pattern.test(body), `body did not match ${pattern}`)
  }

  async function assertBodyDoesNotMatch(pattern) {
    const body = await readBodyText()
    assert(!pattern.test(body), `body unexpectedly matched ${pattern}`)
  }

  async function assertToastContains(pattern) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const toasts = await page.locator('.toast, .toast-item, [class*="toast"]').allTextContents()
      if (toasts.some((text) => pattern.test(text.trim()))) return
      await page.waitForTimeout(300)
    }
    await assertBodyMatches(pattern)
  }
}
