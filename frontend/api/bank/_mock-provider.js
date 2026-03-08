import { normalizeText, simpleHash } from './_utils.js'

const MOCK_MERCHANTS = ['7-ELEVEN', 'Uber', 'FamilyMart', 'PX Mart', 'Starbucks', 'Foodpanda', 'Shopee']
const MOCK_EXPENSE_DESC = ['日常消費', '交通支出', '餐飲支出', '生活用品', '線上購物']
const MOCK_INCOME_DESC = ['薪資入帳', '退款入帳', '轉帳入帳', '利息收入']

function createMockConnectionId(seed) {
  return `mock_conn_${simpleHash(seed)}`
}

function createMockAccounts(connectionId) {
  const base = normalizeText(connectionId)
  return [
    {
      account_id: `${base}_checking`,
      name: 'Mock Checking',
      mask: '1288',
      type: 'depository',
      currency: 'TWD',
    },
    {
      account_id: `${base}_savings`,
      name: 'Mock Savings',
      mask: '7788',
      type: 'depository',
      currency: 'TWD',
    },
    {
      account_id: `${base}_credit`,
      name: 'Mock Credit Card',
      mask: '4466',
      type: 'credit',
      currency: 'TWD',
    },
  ]
}

function pickByIndex(list, index) {
  if (!Array.isArray(list) || !list.length) return ''
  return list[Math.abs(index) % list.length]
}

function createMockTransaction(accountId, seq, offsetHours = 0) {
  const now = Date.now()
  const postedAt = new Date(now - (seq + offsetHours) * 60 * 60 * 1000).toISOString()
  const isIncome = seq % 5 === 0
  const isPending = seq % 7 === 0
  const isReversed = seq % 17 === 0
  const baseAmount = 1200 + (seq % 9) * 375
  const signAmount = isIncome ? baseAmount : baseAmount * -1
  const amountMinor = signAmount * 100
  const merchant = pickByIndex(MOCK_MERCHANTS, seq)
  const description = isIncome
    ? pickByIndex(MOCK_INCOME_DESC, seq)
    : pickByIndex(MOCK_EXPENSE_DESC, seq)

  return {
    providerTransactionId: `txn_${seq}`,
    providerAccountId: accountId,
    postedAt,
    amountMinor,
    currency: 'TWD',
    description,
    merchant,
    status: isReversed ? 'reversed' : (isPending ? 'pending' : 'posted'),
  }
}

function syncMockTransactions(params = {}) {
  const accountIds = Array.isArray(params.accountIds) ? params.accountIds.map((item) => normalizeText(item)).filter(Boolean) : []
  const safeAccountIds = accountIds.length ? accountIds : ['mock_default_account']
  let cursor = Math.max(0, Math.round(Number(params.cursor ?? 0) || 0))
  const batchPerAccount = cursor === 0 ? 4 : 2
  const added = []

  for (let accountIndex = 0; accountIndex < safeAccountIds.length; accountIndex += 1) {
    const accountId = safeAccountIds[accountIndex]
    for (let i = 0; i < batchPerAccount; i += 1) {
      cursor += 1
      added.push(createMockTransaction(accountId, cursor, accountIndex * 3))
    }
  }

  return {
    added,
    modified: [],
    next_cursor: String(cursor),
    sync_time: new Date().toISOString(),
  }
}

export {
  createMockAccounts,
  createMockConnectionId,
  syncMockTransactions,
}
