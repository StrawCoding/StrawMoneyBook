import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('feature list contains the invoice carrier entry', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/ui/views/FeatureListPage.vue'), 'utf8')
  assert.match(source, /isEinvoiceCarrierFeatureEnabled/)
  assert.match(source, /\/invoice-carriers/)
})

test('router exposes invoice carrier list create and detail routes', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/ui/router/index.js'), 'utf8')
  assert.match(source, /name: 'invoice-carriers'/)
  assert.match(source, /path: '\/invoice-carriers\/new'/)
  assert.match(source, /path: '\/invoice-carriers\/:id'/)
  assert.match(source, /EINVOICE_CARRIER_ROUTE_NAMES/)
  assert.match(source, /isEinvoiceCarrierFeatureEnabled\(\)/)
})

test('main app auto-sync dispatcher is gated by invoice carrier feature availability', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/main.js'), 'utf8')
  assert.match(source, /isEinvoiceCarrierFeatureEnabled/)
  assert.doesNotMatch(source, /isEinvoiceCarrierApiConfigured\(\)/)
})

test('invoice carrier pages self-redirect to features when the feature is unavailable', () => {
  const listSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/invoice-carriers/InvoiceCarrierPage.vue'), 'utf8')
  const createSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/invoice-carriers/InvoiceCarrierCreatePage.vue'), 'utf8')
  const detailSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/invoice-carriers/InvoiceCarrierDetailPage.vue'), 'utf8')

  assert.match(listSource, /isEinvoiceCarrierFeatureEnabled/)
  assert.match(listSource, /router\.replace\(\{ name: 'features' \}\)/)

  assert.match(createSource, /isEinvoiceCarrierFeatureEnabled/)
  assert.match(createSource, /router\.replace\(\{ name: 'features' \}\)/)

  assert.match(detailSource, /isEinvoiceCarrierFeatureEnabled/)
  assert.match(detailSource, /router\.replace\(\{ name: 'features' \}\)/)
})

test('invoice carrier create page uses native progress flow instead of captcha UI', () => {
  const createSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/invoice-carriers/InvoiceCarrierCreatePage.vue'), 'utf8')

  assert.match(createSource, /progressText/)
  assert.match(createSource, /startSubmitProgress/)
  assert.match(createSource, /einvoice_password_change_required/)
  assert.doesNotMatch(createSource, /createInvoiceCarrierLinkSession/)
  assert.doesNotMatch(createSource, /captcha_image_data_url/)
  assert.doesNotMatch(createSource, /captcha_image_src/)
  assert.doesNotMatch(createSource, /captchaErrorMessage/)
})

test('developer debug page subscribes to the invoice carrier trace feed', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/ui/views/settings/SettingsDeveloperDebugPage.vue'), 'utf8')

  assert.match(source, /getEinvoiceCarrierDebugTraceSnapshot/)
  assert.match(source, /subscribeEinvoiceCarrierDebugTrace/)
  assert.match(source, /exportDebugLogs/)
  assert.match(source, /saveJsonFileToDevice/)
  assert.match(source, /downloadJsonFile/)
  assert.match(source, /debug_page\.key\.einvoice_calls/)
  assert.match(source, /debug_page\.key\.einvoice_steps/)
})
