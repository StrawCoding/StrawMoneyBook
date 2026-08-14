export const WEAR_PROTOCOL_VERSION = 1
export const WEAR_MESSAGE_PREFIX = '/smb/v1/'

export const WEAR_PATHS = Object.freeze({
  hello: '/smb/v1/hello',
  txCreate: '/smb/v1/tx/create',
  txUpdate: '/smb/v1/tx/update',
  txDelete: '/smb/v1/tx/delete',
  txAck: '/smb/v1/tx/ack',
  ledgerSet: '/smb/v1/ledger/set',
  snapshotRequest: '/smb/v1/snapshot/request',
  snapshotPayload: '/smb/v1/snapshot/payload',
})

export const WEAR_PATH_WHITELIST = Object.freeze(Object.values(WEAR_PATHS))

/** Scope B transaction types the watch may enqueue. */
export const WEAR_TX_TYPES = Object.freeze([
  'expense',
  'income',
  'transfer',
  'adjustment',
  'credit_spend',
  'credit_repay',
  'credit_refund',
  'loan',
])

/** Outbox operations carried in the `op` field of an outbox row. */
export const WEAR_TX_OPS = Object.freeze(['create', 'update', 'delete'])

const CATEGORY_REQUIRED_TYPES = Object.freeze(['expense', 'income', 'credit_spend'])
const PEER_REQUIRED_TYPES = Object.freeze(['transfer', 'credit_repay'])
const MAX_TAGS = 12
const MAX_TAG_LENGTH = 40

function reject(message) {
  return Object.assign(new Error(message), { code: 'rejected' })
}

export function isWearMessagePath(path) {
  return WEAR_PATH_WHITELIST.includes(String(path ?? ''))
}

export function isWearTxType(type) {
  return WEAR_TX_TYPES.includes(String(type ?? ''))
}

export function isWearTxOp(op) {
  return WEAR_TX_OPS.includes(String(op ?? ''))
}

export function maySendWearPayload(isNearby) {
  return isNearby === true
}

export function wearExternalRefId(idempotencyKey) {
  return `wear:${String(idempotencyKey ?? '').trim()}`
}

export function shouldApplySnapshot(localState, incoming) {
  const localEpoch = String(localState?.syncEpoch ?? '')
  const nextEpoch = String(incoming?.syncEpoch ?? '')
  if (!nextEpoch) return false
  if (localEpoch !== nextEpoch) return true
  const localRev = Number(localState?.snapshotRevision ?? 0)
  const nextRev = Number(incoming?.snapshotRevision ?? 0)
  return Number.isFinite(nextRev) && nextRev > localRev
}

export function parseWearEnvelope(raw) {
  const body = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!body || typeof body !== 'object') {
    throw new Error('wear envelope missing')
  }
  const protocolVersion = Number(body.protocolVersion)
  if (protocolVersion !== WEAR_PROTOCOL_VERSION) {
    const error = new Error('wear protocolVersion unsupported')
    error.code = 'protocol_unsupported'
    throw error
  }
  return body
}

export function normalizeWearTags(raw) {
  const source = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw.trim()
      ? safeParseTags(raw)
      : []
  const seen = new Set()
  const tags = []
  for (const item of source) {
    const tag = String(item ?? '').trim().slice(0, MAX_TAG_LENGTH)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
    if (tags.length >= MAX_TAGS) break
  }
  return tags
}

function safeParseTags(raw) {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Addons ride along a transaction (extra source-side amounts on transfers,
 * surcharges on expenses). Scope B keeps them optional and shape-checked only.
 */
export function normalizeWearAddons(raw) {
  if (!Array.isArray(raw)) return []
  const addons = []
  for (const item of raw) {
    const label = String(item?.label ?? '').trim().slice(0, 40)
    const amountMinor = Number(item?.amountMinor)
    if (!Number.isInteger(amountMinor) || amountMinor === 0) continue
    addons.push({ label: label || null, amountMinor })
    if (addons.length >= MAX_TAGS) break
  }
  return addons
}

function requireIdentity(payload) {
  const idempotencyKey = String(payload?.idempotencyKey ?? '').trim()
  const ledgerId = String(payload?.ledgerId ?? '').trim()
  if (!idempotencyKey) throw reject('idempotencyKey required')
  if (!ledgerId) throw reject('ledgerId required')
  return { idempotencyKey, ledgerId }
}

function requireCatalogRevision(payload) {
  const catalogRevision = Number(payload?.catalogRevision)
  if (!Number.isFinite(catalogRevision)) throw reject('catalogRevision required')
  return catalogRevision
}

function requirePositiveAmount(payload) {
  const amountMinor = Number(payload?.amountMinor)
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw reject('amountMinor must be a positive integer')
  }
  return amountMinor
}

export function validateTxCreatePayload(payload) {
  const { idempotencyKey, ledgerId } = requireIdentity(payload)
  const type = String(payload?.type ?? '').trim()
  if (!isWearTxType(type)) {
    throw reject(`type must be one of ${WEAR_TX_TYPES.join('|')}`)
  }

  const accountId = String(payload?.accountId ?? '').trim()
  const categoryId = String(payload?.categoryId ?? '').trim()
  const peerAccountId = String(payload?.peerAccountId ?? payload?.toAccountId ?? '').trim()
  const sourceAccountId = String(payload?.sourceAccountId ?? '').trim()
  const catalogRevision = requireCatalogRevision(payload)

  if (!accountId) throw reject('accountId required')

  // adjustment may be signed; every other B type carries a magnitude.
  let amountMinor
  if (type === 'adjustment') {
    amountMinor = Number(payload?.amountMinor)
    if (!Number.isInteger(amountMinor) || amountMinor === 0) {
      throw reject('adjustment amountMinor must be a non-zero integer')
    }
  } else {
    amountMinor = requirePositiveAmount(payload)
  }

  if (CATEGORY_REQUIRED_TYPES.includes(type) && !categoryId) {
    throw reject(`${type} requires categoryId`)
  }

  if (PEER_REQUIRED_TYPES.includes(type)) {
    // credit_repay peer is the funding account (sourceAccountId is accepted as alias).
    const peer = type === 'credit_repay' ? (sourceAccountId || peerAccountId) : peerAccountId
    if (!peer) {
      throw reject(type === 'credit_repay' ? 'credit_repay requires sourceAccountId' : 'transfer requires toAccountId')
    }
    if (peer === accountId) throw reject('peer account must differ from accountId')
  }

  let loanDirection = null
  let counterpartyName = null
  if (type === 'loan') {
    loanDirection = String(payload?.loanDirection ?? '').trim()
    if (loanDirection !== 'lend' && loanDirection !== 'borrow') {
      throw reject('loanDirection must be lend or borrow')
    }
    counterpartyName = String(payload?.counterpartyName ?? '').trim().slice(0, 80)
    if (!counterpartyName) throw reject('loan requires counterpartyName')
  }

  const resolvedPeer = type === 'credit_repay'
    ? (sourceAccountId || peerAccountId) || null
    : peerAccountId || null

  return {
    op: 'create',
    idempotencyKey,
    clientTxId: String(payload?.clientTxId ?? '').trim(),
    ledgerId,
    catalogRevision,
    type,
    amountMinor,
    accountId,
    categoryId: categoryId || null,
    peerAccountId: resolvedPeer,
    sourceAccountId: sourceAccountId || null,
    loanDirection,
    counterpartyName,
    tags: normalizeWearTags(payload?.tags ?? payload?.tagsJson),
    addons: normalizeWearAddons(payload?.addons),
    occurredAt: String(payload?.occurredAt ?? '').trim() || new Date().toISOString(),
    note: String(payload?.note ?? '').slice(0, 200) || null,
    includeInBudget: payload?.includeInBudget !== false,
    includeInAnalysis: payload?.includeInAnalysis !== false,
  }
}

/**
 * Watch edits are limited to the simple fields the watch can render: amount,
 * account, category, time, note, tags. Type changes are rejected — the phone
 * owns cross-type restructuring (transfer legs, credit postings, loan rows).
 */
export function validateTxUpdatePayload(payload) {
  const { idempotencyKey, ledgerId } = requireIdentity(payload)
  const catalogRevision = requireCatalogRevision(payload)
  const targetTxId = String(payload?.targetTxId ?? '').trim()
  if (!targetTxId) throw reject('targetTxId required')

  const type = String(payload?.type ?? '').trim()
  if (type && type !== 'expense' && type !== 'income' && type !== 'adjustment') {
    throw reject('update supports expense, income or adjustment only')
  }

  const accountId = String(payload?.accountId ?? '').trim()
  if (!accountId) throw reject('accountId required')

  let amountMinor = Number(payload?.amountMinor)
  if (type === 'adjustment') {
    if (!Number.isInteger(amountMinor) || amountMinor === 0) {
      throw reject('adjustment amountMinor must be a non-zero integer')
    }
  } else {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw reject('amountMinor must be a positive integer')
    }
  }

  const categoryId = String(payload?.categoryId ?? '').trim()
  if ((type === 'expense' || type === 'income') && !categoryId) {
    throw reject(`${type} requires categoryId`)
  }

  return {
    op: 'update',
    idempotencyKey,
    clientTxId: String(payload?.clientTxId ?? '').trim(),
    ledgerId,
    catalogRevision,
    targetTxId,
    type: type || 'expense',
    amountMinor,
    accountId,
    categoryId: categoryId || null,
    tags: normalizeWearTags(payload?.tags ?? payload?.tagsJson),
    occurredAt: String(payload?.occurredAt ?? '').trim() || new Date().toISOString(),
    note: String(payload?.note ?? '').slice(0, 200) || null,
    includeInBudget: payload?.includeInBudget !== false,
    includeInAnalysis: payload?.includeInAnalysis !== false,
  }
}

export function validateTxDeletePayload(payload) {
  const { idempotencyKey, ledgerId } = requireIdentity(payload)
  const targetTxId = String(payload?.targetTxId ?? '').trim()
  if (!targetTxId) throw reject('targetTxId required')
  return {
    op: 'delete',
    idempotencyKey,
    clientTxId: String(payload?.clientTxId ?? '').trim(),
    ledgerId,
    targetTxId,
  }
}

export function validateLedgerSetPayload(payload) {
  const ledgerId = String(payload?.ledgerId ?? '').trim()
  if (!ledgerId) throw reject('ledgerId required')
  return { ledgerId }
}

export function buildTxAck({ status, idempotencyKey, txId = null, error = null, op = null }) {
  const ack = {
    protocolVersion: WEAR_PROTOCOL_VERSION,
    msg: 'tx.ack',
    sentAt: new Date().toISOString(),
    status,
    idempotencyKey,
    txId,
    error,
  }
  if (op) ack.op = op
  return ack
}
