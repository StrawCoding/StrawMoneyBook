import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const viewsDir = resolve(import.meta.dirname, '../src/ui/views')

/** Embedded bookkeeping bodies or wizard step panels — no own shell. */
const EMBEDDED_OR_STEP = new Set([
  'AiAutoBookkeepingPage.vue',
  'QuickAddPage.vue',
  'QnaBookkeepingPage.vue',
  'EInvoiceStep1Account.vue',
  'EInvoiceStep2Query.vue',
  'EInvoiceStep3Select.vue',
  'EInvoiceStep4Confirm.vue',
  'SharedLedgerEmailInvitePanel.vue',
  'SharedLedgerMembersPanel.vue',
  'SharedLedgerSyncStatusPanel.vue',
])

function listVueFiles(dir) {
  const entries = readdirSync(dir)
  return entries.flatMap((entry) => {
    const path = resolve(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) return listVueFiles(path)
    return path.endsWith('.vue') ? [path] : []
  })
}

test('routed views use HabitatPageShell (embedded step panels exempt)', () => {
  const missing = []
  for (const filePath of listVueFiles(viewsDir)) {
    const base = filePath.slice(filePath.lastIndexOf('/') + 1)
    if (EMBEDDED_OR_STEP.has(base)) continue
    const source = readFileSync(filePath, 'utf8')
    const hasShell = /HabitatPageShell/.test(source)
    if (!hasShell) {
      missing.push(filePath.replace(`${viewsDir}/`, ''))
    }
  }
  assert.deepEqual(missing, [], `Missing Habitat shell: ${missing.join(', ')}`)
})
