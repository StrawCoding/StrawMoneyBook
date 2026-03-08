import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_FILE_PATH = resolve(
  String(process.env.SHARED_LEDGER_DATA_FILE ?? '').trim()
    || fileURLToPath(new URL('../../.server-data/collab-store.json', import.meta.url)),
)
const TOKEN_SECRET = String(process.env.SHARED_LEDGER_TOKEN_SECRET ?? 'strawmoneybook-dev-shared-ledger-secret').trim()
const TOKEN_TTL_MS = Math.max(60_000, Number(process.env.SHARED_LEDGER_TOKEN_TTL_MS ?? 30 * 24 * 60 * 60 * 1000) || 0)
const DEFAULT_STORE = {
  users: [],
  shared_ledgers: [],
  referrals: [],
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

let updateQueue = Promise.resolve()

function nowIso() {
  return new Date().toISOString()
}

function createId(prefix = 'id') {
  const time = Date.now().toString(36)
  const random = randomBytes(6).toString('hex')
  return `${prefix}_${time}_${random}`
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

function validateEmail(email) {
  const normalized = normalizeEmail(email)
  if (!normalized) {
    throw new Error('請輸入 Email')
  }
  if (!EMAIL_RE.test(normalized)) {
    throw new Error('Email 格式不正確')
  }
  return normalized
}

function normalizeDisplayName(value, fallback = '') {
  const displayName = String(value ?? '').trim()
  return displayName || String(fallback ?? '').trim()
}

function normalizeAvatarUrl(value) {
  return String(value ?? '').trim()
}

function createInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase()
}

function createReferralCode() {
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

function getMembershipGrantList(user) {
  return Array.isArray(user?.membership_grants) ? user.membership_grants : []
}

function getMembershipGrantSummary(user, nowMs = Date.now()) {
  const grants = getMembershipGrantList(user)
  let latestGrant = null

  for (const grant of grants) {
    const endAt = String(grant?.end_at ?? '').trim()
    const endMs = Date.parse(endAt)
    if (!Number.isFinite(endMs) || endMs <= nowMs) continue
    if (!latestGrant || endMs > Date.parse(String(latestGrant.end_at ?? ''))) {
      latestGrant = grant
    }
  }

  return {
    active: Boolean(latestGrant),
    expiresAt: latestGrant ? String(latestGrant.end_at ?? '') : '',
    source: latestGrant ? String(latestGrant.source ?? '') : '',
  }
}

function publicUser(user) {
  const membership = getMembershipGrantSummary(user)
  const email = String(user?.email ?? user?.account ?? '').trim().toLowerCase()
  return {
    id: user.id,
    email,
    account: email,
    display_name: user.display_name,
    avatar_url: String(user?.avatar_url ?? '').trim(),
    referral_code: String(user?.referral_code ?? '').trim(),
    referred_by_user_id: String(user?.referred_by_user_id ?? '').trim(),
    referred_by_code: String(user?.referred_by_code ?? '').trim(),
    referral_redeemed_at: String(user?.referral_redeemed_at ?? '').trim(),
    membership_bonus_expires_at: membership.expiresAt,
    membership_active: membership.active,
    membership_source: membership.source,
    created_at: user.created_at,
  }
}

function signToken(payload) {
  return createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex')
}

function issueAccessToken(user) {
  const payload = {
    sub: user.id,
    email: String(user?.email ?? user?.account ?? '').trim().toLowerCase(),
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

function normalizeUserRecord(user) {
  const email = normalizeEmail(user?.email ?? user?.account)
  return {
    ...user,
    email,
    account: email,
    avatar_url: String(user?.avatar_url ?? '').trim(),
    referral_code: String(user?.referral_code ?? '').trim().toUpperCase(),
    referred_by_user_id: String(user?.referred_by_user_id ?? '').trim(),
    referred_by_code: String(user?.referred_by_code ?? '').trim().toUpperCase(),
    referral_redeemed_at: String(user?.referral_redeemed_at ?? '').trim(),
    membership_grants: Array.isArray(user?.membership_grants) ? user.membership_grants : [],
  }
}

function normalizeSharedLedgerRecord(sharedLedger) {
  return {
    ...sharedLedger,
    members: Array.isArray(sharedLedger?.members) ? sharedLedger.members : [],
    invitations: Array.isArray(sharedLedger?.invitations) ? sharedLedger.invitations : [],
  }
}

export async function readStore() {
  await ensureStoreFile()
  const raw = await readFile(DATA_FILE_PATH, 'utf8')
  try {
    const parsed = JSON.parse(raw)
    return {
      users: Array.isArray(parsed?.users) ? parsed.users.map(normalizeUserRecord) : [],
      shared_ledgers: Array.isArray(parsed?.shared_ledgers) ? parsed.shared_ledgers.map(normalizeSharedLedgerRecord) : [],
      referrals: Array.isArray(parsed?.referrals) ? parsed.referrals : [],
    }
  } catch {
    return {
      users: [],
      shared_ledgers: [],
      referrals: [],
    }
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

function findUserByEmail(data, email) {
  const normalized = normalizeEmail(email)
  return data.users.find((user) => normalizeEmail(user.email) === normalized) ?? null
}

function findUserByAccount(data, account) {
  return findUserByEmail(data, account)
}

function findUserById(data, userId) {
  return data.users.find((user) => String(user.id) === String(userId)) ?? null
}

function findUserByReferralCode(data, referralCode) {
  const normalized = String(referralCode ?? '').trim().toUpperCase()
  return data.users.find((user) => String(user?.referral_code ?? '').trim().toUpperCase() === normalized) ?? null
}

function createUniqueReferralCode(data) {
  let nextCode = ''
  do {
    nextCode = createReferralCode()
  } while (findUserByReferralCode(data, nextCode))
  return nextCode
}

function getMemberRole(sharedLedger, userId) {
  return sharedLedger?.members?.find((member) => String(member.user_id) === String(userId))?.role ?? ''
}

function isSharedLedgerMember(sharedLedger, userId) {
  return Boolean(getMemberRole(sharedLedger, userId))
}

function findPendingInvitationForEmail(sharedLedger, email) {
  const normalized = normalizeEmail(email)
  return (Array.isArray(sharedLedger?.invitations) ? sharedLedger.invitations : [])
    .find((invitation) => String(invitation?.status ?? 'pending') === 'pending' && normalizeEmail(invitation?.email) === normalized) ?? null
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
  const pendingInvitations = Array.isArray(sharedLedger?.invitations)
    ? sharedLedger.invitations.filter((item) => String(item?.status ?? 'pending') === 'pending').length
    : 0

  return {
    id: sharedLedger.id,
    ledger_id: sharedLedger.ledger_id,
    name: sharedLedger.name,
    invite_code: sharedLedger.invite_code,
    version: Number(sharedLedger.version ?? 0),
    role: getMemberRole(sharedLedger, currentUserId),
    owner_display_name: owner?.display_name || owner?.email || owner?.account || '',
    member_count: Array.isArray(sharedLedger.members) ? sharedLedger.members.length : 0,
    pending_invitation_count: pendingInvitations,
    created_at: sharedLedger.created_at,
    updated_at: sharedLedger.updated_at,
    updated_by_display_name: updatedBy?.display_name || updatedBy?.email || updatedBy?.account || '',
  }
}

function buildSharedLedgerInvitationSummary(sharedLedger, invitation, data) {
  const invitedByUser = findUserById(data, invitation?.invited_by_user_id)
  return {
    id: invitation.id,
    shared_ledger_id: sharedLedger.id,
    shared_ledger_name: sharedLedger.name,
    ledger_id: sharedLedger.ledger_id,
    email: String(invitation?.email ?? '').trim().toLowerCase(),
    status: String(invitation?.status ?? 'pending'),
    invited_by_user_id: String(invitation?.invited_by_user_id ?? ''),
    invited_by_display_name: invitedByUser?.display_name || invitedByUser?.email || invitedByUser?.account || '',
    created_at: String(invitation?.created_at ?? ''),
    accepted_at: String(invitation?.accepted_at ?? ''),
  }
}

function listPendingSharedLedgerInvitationsForUser(data, user) {
  const email = normalizeEmail(user?.email ?? user?.account)
  const items = []
  for (const sharedLedger of data.shared_ledgers) {
    const invitations = Array.isArray(sharedLedger?.invitations) ? sharedLedger.invitations : []
    for (const invitation of invitations) {
      if (String(invitation?.status ?? 'pending') !== 'pending') continue
      if (normalizeEmail(invitation?.email) !== email) continue
      items.push(buildSharedLedgerInvitationSummary(sharedLedger, invitation, data))
    }
  }
  return items.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
}

function applyMembershipGrant(user, days, source, meta = {}) {
  const safeDays = Math.max(1, Math.floor(Number(days) || 0))
  const nowMs = Date.now()
  const existingGrants = getMembershipGrantList(user)
  const latestEndMs = existingGrants.reduce((max, grant) => {
    const endMs = Date.parse(String(grant?.end_at ?? ''))
    return Number.isFinite(endMs) && endMs > max ? endMs : max
  }, nowMs)
  const startMs = Math.max(nowMs, latestEndMs)
  const endMs = startMs + safeDays * 24 * 60 * 60 * 1000

  const grant = {
    id: createId('membership_grant'),
    days: safeDays,
    source: String(source ?? 'manual').trim() || 'manual',
    start_at: new Date(startMs).toISOString(),
    end_at: new Date(endMs).toISOString(),
    created_at: nowIso(),
    meta,
  }

  user.membership_grants = [...existingGrants, grant]
  user.updated_at = nowIso()
  return grant
}

export {
  applyMembershipGrant,
  buildSharedLedgerInvitationSummary,
  buildSharedLedgerSummary,
  createId,
  createInviteCode,
  createUniqueReferralCode,
  findPendingInvitationForEmail,
  findUserByAccount,
  findUserByEmail,
  findUserById,
  findUserByReferralCode,
  getMemberRole,
  getMembershipGrantSummary,
  isSharedLedgerMember,
  issueAccessToken,
  listPendingSharedLedgerInvitationsForUser,
  normalizeAvatarUrl,
  normalizeDisplayName,
  normalizeEmail,
  nowIso,
  publicUser,
  validateEmail,
  validatePassword,
  validateSnapshot,
  verifyAccessToken,
  verifyPassword,
  hashPassword,
}
