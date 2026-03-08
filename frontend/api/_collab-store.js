import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_FILE_PATH = resolve(
  String(process.env.SHARED_LEDGER_DATA_FILE ?? '').trim()
    || fileURLToPath(new URL('../.server-data/collab-store.json', import.meta.url)),
)
const TOKEN_SECRET = String(process.env.SHARED_LEDGER_TOKEN_SECRET ?? 'strawmoneybook-dev-shared-ledger-secret').trim()
const TOKEN_TTL_MS = Math.max(60_000, Number(process.env.SHARED_LEDGER_TOKEN_TTL_MS ?? 30 * 24 * 60 * 60 * 1000) || 0)
const DEFAULT_STORE = {
  users: [],
  shared_ledgers: [],
}

let updateQueue = Promise.resolve()

function nowIso() {
  return new Date().toISOString()
}

function createId(prefix = 'id') {
  const time = Date.now().toString(36)
  const random = randomBytes(6).toString('hex')
  return `${prefix}_${time}_${random}`
}

function normalizeAccount(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeDisplayName(value, fallback = '') {
  const displayName = String(value ?? '').trim()
  return displayName || String(fallback ?? '').trim()
}

function createInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase()
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input) {
  const normalized = String(input ?? '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4
  const padded = normalized + '='.repeat(paddingLength)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function secureEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''), 'utf8')
  const rightBuffer = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password ?? ''), salt, 64).toString('hex')
  return { salt, hash }
}

function verifyPassword(user, password) {
  if (!user?.password_hash || !user?.password_salt) return false
  const candidate = scryptSync(String(password ?? ''), String(user.password_salt), 64).toString('hex')
  return secureEquals(candidate, String(user.password_hash))
}

function publicUser(user) {
  return {
    id: user.id,
    account: user.account,
    display_name: user.display_name,
    created_at: user.created_at,
  }
}

function signToken(payload) {
  return createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex')
}

function issueAccessToken(user) {
  const payload = {
    sub: user.id,
    account: user.account,
    exp: Date.now() + TOKEN_TTL_MS,
  }
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = signToken(encodedPayload)
  return `${encodedPayload}.${signature}`
}

function verifyAccessToken(token) {
  const source = String(token ?? '').trim()
  if (!source) return null
  const [encodedPayload, signature] = source.split('.')
  if (!encodedPayload || !signature) return null
  if (!secureEquals(signToken(encodedPayload), signature)) return null

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload))
    const expiresAt = Number(payload?.exp ?? 0)
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function validatePassword(password) {
  const text = String(password ?? '')
  if (text.length < 8) {
    throw new Error('密碼至少需要 8 碼')
  }
  return text
}

async function ensureStoreFile() {
  await mkdir(dirname(DATA_FILE_PATH), { recursive: true })
  try {
    await readFile(DATA_FILE_PATH, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await writeFile(DATA_FILE_PATH, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8')
  }
}

export async function readStore() {
  await ensureStoreFile()
  const raw = await readFile(DATA_FILE_PATH, 'utf8')
  try {
    const parsed = JSON.parse(raw)
    return {
      users: Array.isArray(parsed?.users) ? parsed.users : [],
      shared_ledgers: Array.isArray(parsed?.shared_ledgers) ? parsed.shared_ledgers : [],
    }
  } catch {
    return structuredClone(DEFAULT_STORE)
  }
}

async function writeStore(data) {
  await ensureStoreFile()
  await writeFile(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf8')
}

export async function updateStore(mutator) {
  let result
  updateQueue = updateQueue.catch(() => null).then(async () => {
    const data = await readStore()
    result = await mutator(data)
    await writeStore(data)
  })
  await updateQueue
  return result
}

function findUserByAccount(data, account) {
  const normalized = normalizeAccount(account)
  return data.users.find((user) => normalizeAccount(user.account) === normalized) ?? null
}

function findUserById(data, userId) {
  return data.users.find((user) => String(user.id) === String(userId)) ?? null
}

function getMemberRole(sharedLedger, userId) {
  return sharedLedger?.members?.find((member) => String(member.user_id) === String(userId))?.role ?? ''
}

function isSharedLedgerMember(sharedLedger, userId) {
  return Boolean(getMemberRole(sharedLedger, userId))
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('共同帳本快照格式錯誤')
  }
  const ledgerId = String(snapshot.ledger_id ?? '').trim()
  const tables = snapshot.tables
  const ledgers = Array.isArray(tables?.ledgers) ? tables.ledgers : []
  if (!ledgerId || !ledgers.length) {
    throw new Error('共同帳本快照缺少 ledger 資料')
  }
  return {
    ledgerId,
    ledgerName: String(ledgers[0]?.name ?? '').trim() || '共同帳本',
  }
}

function buildSharedLedgerSummary(sharedLedger, currentUserId, data) {
  const updatedBy = findUserById(data, sharedLedger.updated_by_user_id)
  const owner = findUserById(data, sharedLedger.owner_user_id)
  return {
    id: sharedLedger.id,
    ledger_id: sharedLedger.ledger_id,
    name: sharedLedger.name,
    invite_code: sharedLedger.invite_code,
    version: Number(sharedLedger.version ?? 0),
    role: getMemberRole(sharedLedger, currentUserId),
    owner_display_name: owner?.display_name || owner?.account || '',
    member_count: Array.isArray(sharedLedger.members) ? sharedLedger.members.length : 0,
    created_at: sharedLedger.created_at,
    updated_at: sharedLedger.updated_at,
    updated_by_display_name: updatedBy?.display_name || updatedBy?.account || '',
  }
}

export {
  buildSharedLedgerSummary,
  createId,
  createInviteCode,
  findUserByAccount,
  findUserById,
  getMemberRole,
  isSharedLedgerMember,
  issueAccessToken,
  normalizeAccount,
  normalizeDisplayName,
  nowIso,
  publicUser,
  validatePassword,
  validateSnapshot,
  verifyAccessToken,
  verifyPassword,
  hashPassword,
}
