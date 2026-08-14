export const WEAR_PROTOCOL_VERSION = 1
export const WEAR_MESSAGE_PREFIX = '/smb/v1/'

export const WEAR_PATHS = Object.freeze({
  hello: '/smb/v1/hello',
  txCreate: '/smb/v1/tx/create',
  txAck: '/smb/v1/tx/ack',
  snapshotRequest: '/smb/v1/snapshot/request',
  snapshotPayload: '/smb/v1/snapshot/payload',
})

export const WEAR_PATH_WHITELIST = Object.freeze(Object.values(WEAR_PATHS))

export function isWearMessagePath(path) {
  return WEAR_PATH_WHITELIST.includes(String(path ?? ''))
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

export function validateTxCreatePayload(payload) {
  const idempotencyKey = String(payload?.idempotencyKey ?? '').trim()
  const ledgerId = String(payload?.ledgerId ?? '').trim()
  const type = String(payload?.type ?? '').trim()
  const accountId = String(payload?.accountId ?? '').trim()
  const categoryId = String(payload?.categoryId ?? '').trim()
  const amountMinor = Number(payload?.amountMinor)
  const catalogRevision = Number(payload?.catalogRevision)

  if (!idempotencyKey) throw Object.assign(new Error('idempotencyKey required'), { code: 'rejected' })
  if (!ledgerId) throw Object.assign(new Error('ledgerId required'), { code: 'rejected' })
  if (type !== 'expense' && type !== 'income') {
    throw Object.assign(new Error('type must be expense or income'), { code: 'rejected' })
  }
  if (!accountId || !categoryId) {
    throw Object.assign(new Error('accountId and categoryId required'), { code: 'rejected' })
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw Object.assign(new Error('amountMinor must be a positive integer'), { code: 'rejected' })
  }
  if (!Number.isFinite(catalogRevision)) {
    throw Object.assign(new Error('catalogRevision required'), { code: 'rejected' })
  }

  return {
    idempotencyKey,
    clientTxId: String(payload?.clientTxId ?? '').trim(),
    ledgerId,
    catalogRevision,
    type,
    amountMinor,
    accountId,
    categoryId,
    occurredAt: String(payload?.occurredAt ?? '').trim() || new Date().toISOString(),
    note: String(payload?.note ?? '').slice(0, 200) || null,
    includeInBudget: payload?.includeInBudget !== false,
    includeInAnalysis: payload?.includeInAnalysis !== false,
  }
}

export function buildTxAck({ status, idempotencyKey, txId = null, error = null }) {
  return {
    protocolVersion: WEAR_PROTOCOL_VERSION,
    msg: 'tx.ack',
    sentAt: new Date().toISOString(),
    status,
    idempotencyKey,
    txId,
    error,
  }
}
