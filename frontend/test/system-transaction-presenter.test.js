import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getSystemTransactionIcon,
  getSystemTransactionLabel,
  getSystemTransactionType,
  SECURITY_SETTLEMENT_ICON,
} from '../src/ui/utils/system-transaction-presenter.js'

test('securities principal adjustment gets chart-line icon instead of empty 結餘', () => {
  const tx = {
    type: 'adjustment',
    category_id: null,
    category_name: '',
    note: '證券交割 2330 buy 本金',
    external_ref_id: 'stx_abc_1',
    origin_type: 'manual',
  }
  assert.equal(getSystemTransactionType(tx), 'security_principal')
  assert.equal(getSystemTransactionLabel(tx), '證券本金')
  assert.equal(getSystemTransactionIcon(tx), SECURITY_SETTLEMENT_ICON)
  assert.equal(SECURITY_SETTLEMENT_ICON, 'fa-solid fa-chart-line')
})

test('securities pnl uses chart-line even when category icon is missing', () => {
  const tx = {
    type: 'income',
    category_id: 'cat_pnl',
    category_name: '投資損益',
    note: '證券交割 2330 sell 損益',
    external_ref_id: 'stx_abc_2',
    origin_type: 'manual',
    category_icon: '',
  }
  assert.equal(getSystemTransactionType(tx), 'security_pnl')
  assert.equal(getSystemTransactionLabel(tx), '')
  assert.equal(getSystemTransactionIcon(tx), 'fa-solid fa-chart-line')
})

test('refund and advance detection still win over unrelated notes', () => {
  assert.equal(getSystemTransactionType({ note: '退款：超商', category_name: '退款' }), 'refund')
  assert.equal(getSystemTransactionIcon({ note: '報銷代收', external_ref_id: 'radv_1' }), 'fa-solid fa-hand-holding-dollar')
})

test('securities icon wiring is present on feed presenter and detail rows', () => {
  const root = resolve(import.meta.dirname, '..')
  const page = readFileSync(resolve(root, 'src/ui/views/securities/SecurityDetailPage.vue'), 'utf8')
  const service = readFileSync(resolve(root, 'src/core/services/security.service.js'), 'utf8')
  const feed = readFileSync(resolve(root, 'src/ui/components/home/HomeTransactionFeed.vue'), 'utf8')
  assert.match(page, /data-testid="securities-tx-icon"/)
  assert.match(page, /fa-solid fa-arrow-trend-up/)
  assert.match(page, /fa-solid fa-arrow-trend-down/)
  assert.match(service, /ensureInvestmentPnlCategoryIcon/)
  assert.match(service, /fa-solid fa-chart-line/)
  assert.match(feed, /getSystemTransactionIcon/)
})
