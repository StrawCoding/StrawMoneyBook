import { test } from '@playwright/test'

test('smb151 setup probe', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/budget')
  await page.waitForTimeout(10000)
  console.log('URL', page.url())
  console.log('BODY', (await page.locator('body').innerText()).slice(0, 2000))
})
