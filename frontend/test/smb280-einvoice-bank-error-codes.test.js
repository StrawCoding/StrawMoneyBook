import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('SMB-280: scrape health probe sends cookie-auth headers with credentials include', () => {
  const scrape = read('src/services/einvoice/scrape-api.js')
  assert.match(scrape, /function buildEInvoiceRequestHeaders/)
  assert.match(scrape, /function getEInvoiceCredentialsMode/)
  assert.match(scrape, /probeEInvoiceApiHealth/)
  const healthBlock = scrape.slice(scrape.indexOf('export async function probeEInvoiceApiHealth'))
  assert.match(healthBlock, /buildEInvoiceRequestHeaders\(\)/)
  assert.match(healthBlock, /credentials:\s*getEInvoiceCredentialsMode\(\)/)
  assert.match(scrape, /einvoice_network_failed/)
  assert.match(scrape, /einvoice_query_timeout/)
})

test('SMB-280: backend credentialed CORS treats Cookie / native client as credentialed', () => {
  const http = readFileSync(resolve(root, '../backend/src/collab/http.js'), 'utf8')
  assert.match(http, /function wantsCredentialedCors\(req\)/)
  assert.match(http, /x-straw-native-client/)
  assert.match(http, /headers\?\.cookie/)
  assert.match(http, /einvoice_network_failed/)
})

test('SMB-280: carrier lastError preserves error code for availability', () => {
  const service = read('src/services/einvoice/carrier-sync.service.js')
  const page = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  assert.match(service, /\$\{errorCode\}: \$\{errorMessage\}/)
  assert.match(page, /extractCarrierErrorCode/)
})
