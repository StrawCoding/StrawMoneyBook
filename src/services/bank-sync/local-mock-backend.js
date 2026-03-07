function normalizeText(value) {
  return String(value ?? '').trim()
}

function simpleHash(input) {
  const text = normalizeText(input)
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

const MOCK_MERCHANTS = ['7-ELEVEN', 'Uber', 'FamilyMart', 'PX Mart', 'Starbucks', 'Foodpanda', 'Shopee']
const MOCK_EXPENSE_DESC = ['日常消費', '交通支出', '餐飲支出', '生活用品', '線上購物']
const MOCK_INCOME_DESC = ['薪資入帳', '退款入帳', '轉帳入帳', '利息收入']

function pickByIndex(list, index) {
  if (!Array.isArray(list) || !list.length) return ''
  return list[Math.abs(index) % list.length]
}

function createNonce() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return simpleHash(`${Date.now()}_${Math.random()}`)
}

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
    for (let itemIndex = 0; itemIndex < batchPerAccount; itemIndex += 1) {
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

export async function createLocalMockBankLinkSession() {
  const nonce = createNonce()
  const expiresAtMs = Date.now() + 5 * 60 * 1000
  return {
    provider: 'mock_bank_tw',
    session_id: `mock_session_${nonce}_${expiresAtMs}`,
    link_url: `https://mock-bank.local/authorize?session=${nonce}`,
    mock_code: 'mock_approved',
    expires_at: new Date(expiresAtMs).toISOString(),
  }
}

export async function exchangeLocalMockBankAuth(payload = {}) {
  const sessionId = normalizeText(payload.session_id)
  const code = normalizeText(payload.code || payload.public_token)
  if (!sessionId) throw new Error('session_id is required')
  if (!code) throw new Error('code is required')

  const connectionId = createMockConnectionId(`${sessionId}_${code}`)
  return {
    provider: 'mock_bank_tw',
    institution_name: 'Mock Bank TW',
    connection_id: connectionId,
    connection_name: 'Mock Bank TW',
    accounts: createMockAccounts(connectionId),
    access_token_ref: `mock_token_ref_${connectionId}`,
    created_at: new Date().toISOString(),
  }
}

export async function syncLocalMockBankTransactions(payload = {}) {
  return syncMockTransactions({
    cursor: normalizeText(payload.cursor || payload.next_cursor),
    accountIds: Array.isArray(payload.account_ids) ? payload.account_ids : [],
  })
}

export async function disconnectLocalMockBankAuth() {
  return {
    ok: true,
    disconnected: true,
    disconnected_at: new Date().toISOString(),
  }
}

export async function markImportedLocalMockTransactions(payload = {}) {
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : []
  return {
    ok: true,
    accepted: transactions.length,
  }
}
