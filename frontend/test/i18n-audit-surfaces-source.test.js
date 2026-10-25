import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SURFACES = [
  'src/ui/views/loans/LoanListPage.vue',
  'src/ui/views/loans/LoanDetailPage.vue',
  'src/ui/views/loans/LoanCounterpartyDetailPage.vue',
  'src/ui/views/reimbursements/ReimbursementListPage.vue',
  'src/ui/views/reimbursements/ReimbursementEditPage.vue',
  'src/ui/views/reimbursements/ReimbursementAdvanceManagementPage.vue',
  'src/ui/views/reimbursements/ReimbursementOffsetAboutPage.vue',
  'src/ui/views/accounts/AccountDetailPage.vue',
  'src/ui/views/accounts/AssetAccountManagementPage.vue',
  'src/ui/views/accounts/AssetAccountGroupDetailPage.vue',
  'src/ui/views/TransactionSearchPage.vue',
  'src/ui/views/AiAutoBookkeepingPage.vue',
  'src/ui/views/settings/SettingsCategoryDetailPage.vue',
  'src/ui/views/settings/SettingsCategoryGroupDetailPage.vue',
]

const HARDCODED_COPY = [
  /<h2>借貸清單<\/h2>/,
  /<h2>借貸明細<\/h2>/,
  />新增借貸</,
  />報銷統整</,
  />資產帳戶管理</,
  /title="新增借貸"/,
]

test('previously unaudited surfaces import useI18n and drop hardcoded titles', () => {
  for (const relativePath of SURFACES) {
    const source = readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8')
    assert.match(source, /useI18n\(/, `${relativePath} must import useI18n`)
    for (const pattern of HARDCODED_COPY) {
      assert.doesNotMatch(source, pattern, `${relativePath} still has ${pattern}`)
    }
  }
})
