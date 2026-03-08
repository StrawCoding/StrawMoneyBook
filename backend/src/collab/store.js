import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const CONFIGURED_DATA_FILE = String(process.env.SHARED_LEDGER_DATA_FILE ?? '').trim()
const CONFIGURED_DB_FILE = String(process.env.SHARED_LEDGER_DB_FILE ?? '').trim()
const DEFAULT_DB_FILE_PATH = fileURLToPath(new URL('../../.server-data/collab-store.sqlite', import.meta.url))
const DEFAULT_LEGACY_JSON_FILE_PATH = fileURLToPath(new URL('../../.server-data/collab-store.json', import.meta.url))
const DATA_FILE_PATH = resolve(
  CONFIGURED_DB_FILE
    || (CONFIGURED_DATA_FILE.endsWith('.sqlite') ? CONFIGURED_DATA_FILE : '')
    || DEFAULT_DB_FILE_PATH,
)
const LEGACY_JSON_FILE_PATH = resolve(
  CONFIGURED_DATA_FILE && !CONFIGURED_DATA_FILE.endsWith('.sqlite')
    ? CONFIGURED_DATA_FILE
    : DEFAULT_LEGACY_JSON_FILE_PATH,
)
const TOKEN_SECRET = String(process.env.SHARED_LEDGER_TOKEN_SECRET ?? 'strawmoneybook-dev-shared-ledger-secret').trim()
const TOKEN_TTL_MS = Math.max(60_000, Number(process.env.SHARED_LEDGER_TOKEN_TTL_MS ?? 30 * 24 * 60 * 60 * 1000) || 0)
const DEFAULT_STORE = {
  users: [],
  shared_ledgers: [],
  referrals: [],
}
const EMAIL_LOCAL_MAX_LENGTH = 64
const EMAIL_TOTAL_MAX_LENGTH = 254

let updateQueue = Promise.resolve()
let dbInstance = null
let databaseReadyPromise = null

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

  if (normalized.length > EMAIL_TOTAL_MAX_LENGTH) {
    throw new Error('Email 長度過長')
  }

  const parts = normalized.split('@')
  if (parts.length !== 2) {
    throw new Error('Email 格式不正確')
  }

  const [localPart, domainPart] = parts
  if (!localPart || !domainPart) {
    throw new Error('Email 格式不正確')
  }

  if (localPart.length > EMAIL_LOCAL_MAX_LENGTH) {
    throw new Error('Email 格式不正確')
  }

  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    throw new Error('Email 格式不正確')
  }

  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart)) {
    throw new Error('Email 格式不正確')
  }

  const domainLabels = domainPart.split('.')
  if (domainLabels.length < 2) {
    throw new Error('Email 格式不正確')
  }

  for (const label of domainLabels) {
    if (!label || label.length > 63) {
      throw new Error('Email 格式不正確')
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      throw new Error('Email 格式不正確')
    }
    if (!/^[a-z0-9-]+$/i.test(label)) {
      throw new Error('Email 格式不正確')
    }
  }

  if (!/[a-z]{2,}$/i.test(domainLabels[domainLabels.length - 1])) {
    throw new Error('Email 格式不正確')
  }
  return normalized
}

function normalizeDisplayName(value, fallback = '') {
  const displayName = String(value ?? '').trim()
  return displayName || String(fallback ?? '').trim()
}

function normalizeAvatarUrl(value) {
  const source = String(value ?? '').trim()
  if (!source) return ''

  if (/^https?:\/\//i.test(source)) {
    return source
  }

  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(source)) {
    if (source.length > 5 * 1024 * 1024) {
      throw new Error('頭貼圖片不可超過 5MB')
    }
    return source
  }

  throw new Error('頭貼格式不正確')
}

function createInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase()
}

function createReferralCode() {
  return randomBytes(4).toString('hex').toUpperCase()
}

function createPasswordResetToken() {
  return randomBytes(24).toString('base64url')
}

function createTemporaryPassword() {
  return randomBytes(9).toString('base64url')
}

function hashSensitiveToken(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex')
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

function getLatestMembershipGrantBySource(user, source) {
  const normalizedSource = String(source ?? '').trim()
  if (!normalizedSource) return null

  const grants = getMembershipGrantList(user)
  let latestGrant = null
  let latestEndMs = -1

  for (const grant of grants) {
    if (String(grant?.source ?? '').trim() !== normalizedSource) continue
    const endMs = Date.parse(String(grant?.end_at ?? ''))
    const sortableEndMs = Number.isFinite(endMs) ? endMs : -1
    if (!latestGrant || sortableEndMs > latestEndMs) {
      latestGrant = grant
      latestEndMs = sortableEndMs
    }
  }

  return latestGrant
}

function publicUser(user) {
  const membership = getMembershipGrantSummary(user)
  const membershipGrants = getMembershipGrantList(user)
  const email = String(user?.email ?? user?.account ?? '').trim().toLowerCase()
  const sharedLedgerTrialGrant = getLatestMembershipGrantBySource(user, 'shared_ledger_first_trial')
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
    must_change_password: Boolean(user?.must_change_password),
    temporary_password_issued_at: String(user?.temporary_password_issued_at ?? '').trim(),
    membership_bonus_expires_at: membership.expiresAt,
    membership_active: membership.active,
    membership_source: membership.source,
    membership_trial_eligible: membershipGrants.length === 0,
    shared_ledger_trial_used: Boolean(sharedLedgerTrialGrant),
    shared_ledger_trial_expires_at: String(sharedLedgerTrialGrant?.end_at ?? '').trim(),
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
    login_failed_attempts: Math.max(0, Math.floor(Number(user?.login_failed_attempts) || 0)),
    last_failed_login_at: String(user?.last_failed_login_at ?? '').trim(),
    login_locked_until: String(user?.login_locked_until ?? '').trim(),
    must_change_password: Boolean(user?.must_change_password),
    temporary_password_issued_at: String(user?.temporary_password_issued_at ?? '').trim(),
    password_reset_required: Boolean(user?.password_reset_required),
    password_reset_token_hash: String(user?.password_reset_token_hash ?? '').trim(),
    password_reset_requested_at: String(user?.password_reset_requested_at ?? '').trim(),
    password_reset_expires_at: String(user?.password_reset_expires_at ?? '').trim(),
  }
}

function normalizeSharedLedgerRecord(sharedLedger) {
  return {
    ...sharedLedger,
    members: Array.isArray(sharedLedger?.members) ? sharedLedger.members : [],
    invitations: Array.isArray(sharedLedger?.invitations) ? sharedLedger.invitations : [],
    snapshot: sharedLedger?.snapshot && typeof sharedLedger.snapshot === 'object'
      ? sharedLedger.snapshot
      : {},
  }
}

function normalizeReferralRecord(referral) {
  return {
    ...referral,
    id: String(referral?.id ?? '').trim(),
    code: String(referral?.code ?? '').trim().toUpperCase(),
    inviter_user_id: String(referral?.inviter_user_id ?? '').trim(),
    invitee_user_id: String(referral?.invitee_user_id ?? '').trim(),
    inviter_reward_days: Math.max(0, Math.floor(Number(referral?.inviter_reward_days) || 0)),
    invitee_reward_days: Math.max(0, Math.floor(Number(referral?.invitee_reward_days) || 0)),
    created_at: String(referral?.created_at ?? '').trim(),
  }
}

function parseJsonField(value, fallback) {
  const source = String(value ?? '').trim()
  if (!source) return fallback
  try {
    return JSON.parse(source)
  } catch {
    return fallback
  }
}

async function ensureDatabaseDirectory() {
  await mkdir(dirname(DATA_FILE_PATH), { recursive: true })
}

function ensureSchema(db) {
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      account TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by_user_id TEXT NOT NULL,
      referred_by_code TEXT NOT NULL,
      referral_redeemed_at TEXT NOT NULL,
      membership_grants_json TEXT NOT NULL,
      login_failed_attempts INTEGER NOT NULL DEFAULT 0,
      last_failed_login_at TEXT NOT NULL,
      login_locked_until TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      temporary_password_issued_at TEXT NOT NULL,
      password_reset_required INTEGER NOT NULL DEFAULT 0,
      password_reset_token_hash TEXT NOT NULL,
      password_reset_requested_at TEXT NOT NULL,
      password_reset_expires_at TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shared_ledgers (
      id TEXT PRIMARY KEY,
      ledger_id TEXT NOT NULL,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      owner_user_id TEXT NOT NULL,
      members_json TEXT NOT NULL,
      invitations_json TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      inviter_user_id TEXT NOT NULL,
      invitee_user_id TEXT NOT NULL,
      inviter_reward_days INTEGER NOT NULL,
      invitee_reward_days INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
    CREATE INDEX IF NOT EXISTS idx_shared_ledgers_owner ON shared_ledgers(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_shared_ledgers_invite_code ON shared_ledgers(invite_code);
    CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_user_id);
    CREATE INDEX IF NOT EXISTS idx_referrals_invitee ON referrals(invitee_user_id);
  `)

  const userColumns = new Set(
    db.prepare(`PRAGMA table_info(users)`).all().map((column) => String(column?.name ?? '').trim()),
  )
  if (!userColumns.has('must_change_password')) {
    db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`)
  }
  if (!userColumns.has('temporary_password_issued_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN temporary_password_issued_at TEXT NOT NULL DEFAULT ''`)
  }
}

function loadStoreFromDatabase(db) {
  const users = db.prepare(`
    SELECT
      id, email, account, display_name, avatar_url, referral_code,
      referred_by_user_id, referred_by_code, referral_redeemed_at,
      membership_grants_json, login_failed_attempts, last_failed_login_at,
      login_locked_until, must_change_password, temporary_password_issued_at,
      password_reset_required, password_reset_token_hash,
      password_reset_requested_at, password_reset_expires_at,
      password_hash, password_salt, created_at, updated_at
    FROM users
    ORDER BY created_at ASC, id ASC
  `).all().map((row) => normalizeUserRecord({
    ...row,
    membership_grants: parseJsonField(row.membership_grants_json, []),
    password_reset_required: Boolean(row.password_reset_required),
  }))

  const sharedLedgers = db.prepare(`
    SELECT
      id, ledger_id, name, invite_code, owner_user_id, members_json,
      invitations_json, snapshot_json, version, created_at, updated_at,
      updated_by_user_id
    FROM shared_ledgers
    ORDER BY created_at ASC, id ASC
  `).all().map((row) => normalizeSharedLedgerRecord({
    ...row,
    members: parseJsonField(row.members_json, []),
    invitations: parseJsonField(row.invitations_json, []),
    snapshot: parseJsonField(row.snapshot_json, {}),
  }))

  const referrals = db.prepare(`
    SELECT
      id, code, inviter_user_id, invitee_user_id,
      inviter_reward_days, invitee_reward_days, created_at
    FROM referrals
    ORDER BY created_at ASC, id ASC
  `).all().map(normalizeReferralRecord)

  return {
    users,
    shared_ledgers: sharedLedgers,
    referrals,
  }
}

function persistStoreToDatabase(db, data) {
  const deleteUsers = db.prepare('DELETE FROM users')
  const deleteSharedLedgers = db.prepare('DELETE FROM shared_ledgers')
  const deleteReferrals = db.prepare('DELETE FROM referrals')
  const insertUser = db.prepare(`
    INSERT INTO users (
      id, email, account, display_name, avatar_url, referral_code,
      referred_by_user_id, referred_by_code, referral_redeemed_at,
      membership_grants_json, login_failed_attempts, last_failed_login_at,
      login_locked_until, must_change_password, temporary_password_issued_at,
      password_reset_required, password_reset_token_hash,
      password_reset_requested_at, password_reset_expires_at,
      password_hash, password_salt, created_at, updated_at
    ) VALUES (
      @id, @email, @account, @display_name, @avatar_url, @referral_code,
      @referred_by_user_id, @referred_by_code, @referral_redeemed_at,
      @membership_grants_json, @login_failed_attempts, @last_failed_login_at,
      @login_locked_until, @must_change_password, @temporary_password_issued_at,
      @password_reset_required, @password_reset_token_hash,
      @password_reset_requested_at, @password_reset_expires_at,
      @password_hash, @password_salt, @created_at, @updated_at
    )
  `)
  const insertSharedLedger = db.prepare(`
    INSERT INTO shared_ledgers (
      id, ledger_id, name, invite_code, owner_user_id, members_json,
      invitations_json, snapshot_json, version, created_at, updated_at,
      updated_by_user_id
    ) VALUES (
      @id, @ledger_id, @name, @invite_code, @owner_user_id, @members_json,
      @invitations_json, @snapshot_json, @version, @created_at, @updated_at,
      @updated_by_user_id
    )
  `)
  const insertReferral = db.prepare(`
    INSERT INTO referrals (
      id, code, inviter_user_id, invitee_user_id,
      inviter_reward_days, invitee_reward_days, created_at
    ) VALUES (
      @id, @code, @inviter_user_id, @invitee_user_id,
      @inviter_reward_days, @invitee_reward_days, @created_at
    )
  `)

  const writeTransaction = db.transaction((nextData) => {
    deleteUsers.run()
    deleteSharedLedgers.run()
    deleteReferrals.run()

    for (const rawUser of Array.isArray(nextData?.users) ? nextData.users : []) {
      const user = normalizeUserRecord(rawUser)
      insertUser.run({
        ...user,
        membership_grants_json: JSON.stringify(Array.isArray(user.membership_grants) ? user.membership_grants : []),
        must_change_password: user.must_change_password ? 1 : 0,
        password_reset_required: user.password_reset_required ? 1 : 0,
      })
    }

    for (const rawSharedLedger of Array.isArray(nextData?.shared_ledgers) ? nextData.shared_ledgers : []) {
      const sharedLedger = normalizeSharedLedgerRecord(rawSharedLedger)
      insertSharedLedger.run({
        ...sharedLedger,
        members_json: JSON.stringify(Array.isArray(sharedLedger.members) ? sharedLedger.members : []),
        invitations_json: JSON.stringify(Array.isArray(sharedLedger.invitations) ? sharedLedger.invitations : []),
        snapshot_json: JSON.stringify(sharedLedger.snapshot ?? {}),
        version: Number(sharedLedger.version ?? 0),
      })
    }

    for (const rawReferral of Array.isArray(nextData?.referrals) ? nextData.referrals : []) {
      const referral = normalizeReferralRecord(rawReferral)
      insertReferral.run(referral)
    }
  })

  writeTransaction(data)
}

async function migrateLegacyJsonIfNeeded(db) {
  const hasUsers = Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count ?? 0) > 0
  const hasSharedLedgers = Number(db.prepare('SELECT COUNT(*) AS count FROM shared_ledgers').get().count ?? 0) > 0
  const hasReferrals = Number(db.prepare('SELECT COUNT(*) AS count FROM referrals').get().count ?? 0) > 0
  if (hasUsers || hasSharedLedgers || hasReferrals) {
    return
  }

  try {
    const raw = await readFile(LEGACY_JSON_FILE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const nextData = {
      users: Array.isArray(parsed?.users) ? parsed.users.map(normalizeUserRecord) : [],
      shared_ledgers: Array.isArray(parsed?.shared_ledgers) ? parsed.shared_ledgers.map(normalizeSharedLedgerRecord) : [],
      referrals: Array.isArray(parsed?.referrals) ? parsed.referrals.map(normalizeReferralRecord) : [],
    }
    if (!nextData.users.length && !nextData.shared_ledgers.length && !nextData.referrals.length) {
      return
    }
    persistStoreToDatabase(db, nextData)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    console.warn('[shared-ledger] legacy JSON migration skipped', error)
  }
}

async function ensureDatabase() {
  await ensureDatabaseDirectory()
  if (dbInstance) return dbInstance

  if (!databaseReadyPromise) {
    databaseReadyPromise = (async () => {
      const db = new Database(DATA_FILE_PATH)
      ensureSchema(db)
      await migrateLegacyJsonIfNeeded(db)
      dbInstance = db
      return db
    })().catch((error) => {
      databaseReadyPromise = null
      throw error
    })
  }

  return databaseReadyPromise
}

export async function readStore() {
  const db = await ensureDatabase()
  return loadStoreFromDatabase(db)
}

export async function updateStore(mutator) {
  let result
  updateQueue = updateQueue.catch(() => null).then(async () => {
    const db = await ensureDatabase()
    const data = loadStoreFromDatabase(db)
    result = await mutator(data)
    persistStoreToDatabase(db, data)
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
  createPasswordResetToken,
  createTemporaryPassword,
  createUniqueReferralCode,
  findPendingInvitationForEmail,
  findUserByAccount,
  findUserByEmail,
  findUserById,
  findUserByReferralCode,
  hashPassword,
  hashSensitiveToken,
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
}
