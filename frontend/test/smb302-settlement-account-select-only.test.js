import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('smb302: settlement account is select-only (no mark gate in UI/service/i18n)', () => {
  const service = readFileSync(resolve(root, 'src/core/services/security.service.js'), 'utf8')
  const store = readFileSync(resolve(root, 'src/ui/stores/security.store.js'), 'utf8')
  const listPage = readFileSync(resolve(root, 'src/ui/views/securities/SecuritiesListPage.vue'), 'utf8')
  const detailPage = readFileSync(resolve(root, 'src/ui/views/securities/SecurityDetailPage.vue'), 'utf8')
  const accountDetail = readFileSync(resolve(root, 'src/ui/views/accounts/AccountDetailPage.vue'), 'utf8')
  const assetMgmt = readFileSync(resolve(root, 'src/ui/views/accounts/AssetAccountManagementPage.vue'), 'utf8')
  const i18n = readFileSync(resolve(root, 'src/ui/services/i18n.service.js'), 'utf8')
  const playwright = readFileSync(resolve(root, 'scripts/playwright-ui-layout.mjs'), 'utf8')

  assert.match(listPage, /data-testid="securities-create-settlement"/)
  assert.doesNotMatch(listPage, /mark_settlement|markSelectedSettlement|標記為交割|settlement_badge/)
  assert.doesNotMatch(detailPage, /markSettlement|settlement_badge/)
  assert.doesNotMatch(accountDetail, /is_settlement_label|account-is-settlement|editIsSettlement/)
  assert.doesNotMatch(assetMgmt, /is_settlement_label|account-create-is-settlement|accountIsSettlementInput/)
  assert.doesNotMatch(i18n, /mark_settlement|is_settlement_label|標記為交割/)
  assert.doesNotMatch(service, /AND is_settlement = 1/)
  assert.match(service, /listSettlementAccounts/)
  assert.match(service, /listCandidateSettlementAccounts/)
  assert.doesNotMatch(store, /markSettlement|markAccountAsSettlement/)
  assert.match(store, /listCandidateSettlementAccounts/)
  assert.match(playwright, /smb302|select-only|no.?mark|securities-create-settlement/i)
})

test('smb302: createSecurity still requires settlement_account_id selection', () => {
  const repo = readFileSync(resolve(root, 'src/core/repositories/security.repo.js'), 'utf8')
  assert.match(repo, /請選擇交割帳戶/)
  assert.match(repo, /settlement_account_id/)
})
