import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const viewsDir = resolve(import.meta.dirname, '../src/ui/views')

/** Route-level pages that use bespoke shells (still Habitat-aligned). */
const CUSTOM_SHELL = new Set([
  'home.vue',
  'analysis.vue',
  'assets.vue',
])

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

/** Onboarding uses view-root + global card tokens. */
const ONBOARDING_ROOT = new Set([
  'WelcomePage.vue',
  'PostSetupIntroPage.vue',
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

test('routed views use HabitatPageShell or approved custom/onboarding shells', () => {
  const missing = []
  for (const filePath of listVueFiles(viewsDir)) {
    const base = filePath.slice(filePath.lastIndexOf('/') + 1)
    if (CUSTOM_SHELL.has(base) || EMBEDDED_OR_STEP.has(base) || ONBOARDING_ROOT.has(base)) continue
    const source = readFileSync(filePath, 'utf8')
    const hasShell = /HabitatPageShell/.test(source)
    const hasModernRoot = /view-root[\s\S]*-modern/.test(source)
    if (!hasShell && !hasModernRoot) {
      missing.push(filePath.replace(`${viewsDir}/`, ''))
    }
  }
  assert.deepEqual(missing, [], `Missing Habitat shell: ${missing.join(', ')}`)
})
