import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('電子發票匯入改用命名階段，不再只顯示無名圓點', () => {
  const source = read('src/ui/views/einvoice/EInvoiceImportWizardPage.vue')

  assert.match(source, /STAGE_KEYS/)
  assert.match(source, /einvoice\.stage1/)
  assert.match(source, /stage-name/)
  assert.doesNotMatch(source, /v-for="n in 4"/)
})

test('電子發票匯入使用全螢幕流程，避免底部導覽覆蓋內容', () => {
  const router = read('src/ui/router/index.js')
  const app = read('src/ui/App.vue')

  assert.match(router, /name: 'einvoice-import',[\s\S]*hideAppChrome: true/)
  assert.match(app, /const hideAppChrome = computed/)
  assert.match(app, /<BottomNav v-if="hasLedgers && !isBooting && !showGuidedFlow && !hideAppChrome"/)
  assert.match(app, /full-screen-route/)
})

test('電子發票抓取流程具備取消、重試與狀態化錯誤回饋', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep3Select.vue')

  assert.match(source, /handleCancel/)
  assert.match(source, /handleRetry/)
  assert.match(source, /status_cancelled/)
  assert.match(source, /status_timeout/)
  assert.match(source, /status_failed/)
  assert.match(source, /back_to_query/)
})

test('電子發票 store 使用 generation token 丟棄過期抓取結果並清除下游狀態', () => {
  const source = read('src/ui/stores/einvoice-import.store.js')

  assert.match(source, /scrapeGeneration/)
  assert.match(source, /startScrape/)
  assert.match(source, /commitScrapeResult\(token, list\)/)
  assert.match(source, /scrapeGeneration\.value !== token/)
  assert.match(source, /cancelScrape/)
  assert.match(source, /clearScrapeResults/)
  assert.match(source, /selectedInvoiceNumbers\.value = new Set\(\)/)
})

test('新增電子發票流程文字具備繁中、英文、日文 i18n', () => {
  const source = read('src/ui/services/i18n.service.js')
  const keys = [
    'einvoice.stage1',
    'einvoice.stage2',
    'einvoice.stage3',
    'einvoice.stage4',
    'einvoice.step3.cancel',
    'einvoice.step3.retry',
    'einvoice.step3.back_to_query',
    'einvoice.step3.status_cancelled',
    'einvoice.step3.status_timeout',
    'einvoice.step3.status_failed',
    'einvoice.step3.status_not_supported',
  ]

  for (const key of keys) {
    const matches = source.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) ?? []
    assert.equal(matches.length, 3, `${key} should exist in zh-TW, en, ja`)
  }
})
