import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const CONFIGURED_DATA_FILE = String(process.env.SHARED_LEDGER_DATA_FILE ?? '').trim()
const CONFIGURED_DB_FILE = String(process.env.SHARED_LEDGER_DB_FILE ?? '').trim()
const DEFAULT_DB_FILE_PATH = fileURLToPath(new URL('../../.server-data/collab-store.sqlite', import.meta.url))
const DEFAULT_LEGACY_JSON_FILE_PATH = fileURLToPath(new URL('../../.server-data/collab-store.json', import.meta.url))
const DEV_FALLBACK_TOKEN_SECRET = 'strawmoneybook-dev-shared-ledger-secret'
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
const TOKEN_SECRET = resolveTokenSecret()
const ACCESS_TOKEN_TTL_MS = Math.max(
  60_000,
  Number(process.env.SHARED_LEDGER_ACCESS_TOKEN_TTL_MS ?? process.env.SHARED_LEDGER_TOKEN_TTL_MS ?? 15 * 60 * 1000) || 0,
)
const REFRESH_TOKEN_TTL_MS = Math.max(
  5 * 60_000,
  Number(process.env.SHARED_LEDGER_REFRESH_TOKEN_TTL_MS ?? 30 * 24 * 60 * 60 * 1000) || 0,
)
const AUTH_NONCE_TTL_MS = Math.max(
  60_000,
  Number(process.env.SHARED_LEDGER_AUTH_NONCE_TTL_MS ?? 5 * 60 * 1000) || 0,
)
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

function resolveTokenSecret() {
  const configuredSecret = String(process.env.SHARED_LEDGER_TOKEN_SECRET ?? '').trim()
  if (configuredSecret) return configuredSecret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SHARED_LEDGER_TOKEN_SECRET is required in production')
  }
  return DEV_FALLBACK_TOKEN_SECRET
}

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

function createOpaqueToken(size = 32) {
  return randomBytes(Math.max(16, Number(size) || 32)).toString('base64url')
}

function createStoreError(message, code = 'store_error', status = 400, extras = {}) {
  const error = new Error(String(message ?? '').trim() || 'store error')
  error.code = code
  error.status = status
  Object.assign(error, extras)
  return error
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

function normalizeAuthProviderSummary(provider) {
  return {
    provider: String(provider?.provider ?? '').trim(),
    provider_sub: String(provider?.provider_sub ?? '').trim(),
    email: normalizeEmail(provider?.provider_email),
    email_verified: Boolean(provider?.email_verified),
    display_name: String(provider?.provider_display_name ?? '').trim(),
    avatar_url: String(provider?.provider_avatar_url ?? '').trim(),
    linked_at: String(provider?.linked_at ?? '').trim(),
    last_login_at: String(provider?.last_login_at ?? '').trim(),
  }
}

function publicUser(user, options = {}) {
  const membership = getMembershipGrantSummary(user)
  const membershipGrants = getMembershipGrantList(user)
  const email = String(user?.email ?? user?.account ?? '').trim().toLowerCase()
  const sharedLedgerTrialGrant = getLatestMembershipGrantBySource(user, 'shared_ledger_first_trial')
  const authProviders = Array.isArray(options?.authProviders)
    ? options.authProviders.map(normalizeAuthProviderSummary)
    : []
  return {
    id: user.id,
    email,
    account: email,
    email_verified: Boolean(user?.email_verified),
    display_name: user.display_name,
    avatar_url: String(user?.avatar_url ?? '').trim(),
    has_password: Boolean(String(user?.password_hash ?? '').trim() && String(user?.password_salt ?? '').trim()),
    last_login_at: String(user?.last_login_at ?? '').trim(),
    auth_providers: authProviders,
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
    jti: createId('atk'),
    sid: String(user?.session_family_id ?? '').trim(),
    exp: Date.now() + ACCESS_TOKEN_TTL_MS,
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
    email_verified: Boolean(user?.email_verified),
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
    last_login_at: String(user?.last_login_at ?? '').trim(),
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
      email_verified INTEGER NOT NULL DEFAULT 0,
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
      last_login_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_auth_providers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_sub TEXT NOT NULL,
      provider_email TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      provider_display_name TEXT NOT NULL,
      provider_avatar_url TEXT NOT NULL,
      linked_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, provider_sub),
      UNIQUE(user_id, provider),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_family_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      parent_token_id TEXT NOT NULL,
      replaced_by_token_id TEXT NOT NULL,
      issued_by_provider TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      revoked_at TEXT NOT NULL,
      revoke_reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_nonces (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      purpose TEXT NOT NULL,
      nonce_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_status TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_user_auth_providers_user_provider ON user_auth_providers(user_id, provider);
    CREATE INDEX IF NOT EXISTS idx_user_auth_providers_provider_sub ON user_auth_providers(provider, provider_sub);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_family ON refresh_tokens(user_id, token_family_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_nonces_provider_hash ON auth_nonces(provider, nonce_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_created_at ON auth_audit_logs(user_id, created_at);
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
  if (!userColumns.has('email_verified')) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`)
  }
  if (!userColumns.has('last_login_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN last_login_at TEXT NOT NULL DEFAULT ''`)
  }
}

function loadStoreFromDatabase(db) {
  const users = db.prepare(`
    SELECT
      id, email, account, email_verified, display_name, avatar_url, referral_code,
      referred_by_user_id, referred_by_code, referral_redeemed_at,
      membership_grants_json, login_failed_attempts, last_failed_login_at,
      login_locked_until, must_change_password, temporary_password_issued_at,
      password_reset_required, password_reset_token_hash,
      password_reset_requested_at, password_reset_expires_at, last_login_at,
      password_hash, password_salt, created_at, updated_at
    FROM users
    ORDER BY created_at ASC, id ASC
  `).all().map((row) => normalizeUserRecord({
    ...row,
    membership_grants: parseJsonField(row.membership_grants_json, []),
    email_verified: Boolean(row.email_verified),
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
  const upsertUser = db.prepare(`
    INSERT INTO users (
      id, email, account, email_verified, display_name, avatar_url, referral_code,
      referred_by_user_id, referred_by_code, referral_redeemed_at,
      membership_grants_json, login_failed_attempts, last_failed_login_at,
      login_locked_until, must_change_password, temporary_password_issued_at,
      password_reset_required, password_reset_token_hash,
      password_reset_requested_at, password_reset_expires_at, last_login_at,
      password_hash, password_salt, created_at, updated_at
    ) VALUES (
      @id, @email, @account, @email_verified, @display_name, @avatar_url, @referral_code,
      @referred_by_user_id, @referred_by_code, @referral_redeemed_at,
      @membership_grants_json, @login_failed_attempts, @last_failed_login_at,
      @login_locked_until, @must_change_password, @temporary_password_issued_at,
      @password_reset_required, @password_reset_token_hash,
      @password_reset_requested_at, @password_reset_expires_at, @last_login_at,
      @password_hash, @password_salt, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      account = excluded.account,
      email_verified = excluded.email_verified,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      referral_code = excluded.referral_code,
      referred_by_user_id = excluded.referred_by_user_id,
      referred_by_code = excluded.referred_by_code,
      referral_redeemed_at = excluded.referral_redeemed_at,
      membership_grants_json = excluded.membership_grants_json,
      login_failed_attempts = excluded.login_failed_attempts,
      last_failed_login_at = excluded.last_failed_login_at,
      login_locked_until = excluded.login_locked_until,
      must_change_password = excluded.must_change_password,
      temporary_password_issued_at = excluded.temporary_password_issued_at,
      password_reset_required = excluded.password_reset_required,
      password_reset_token_hash = excluded.password_reset_token_hash,
      password_reset_requested_at = excluded.password_reset_requested_at,
      password_reset_expires_at = excluded.password_reset_expires_at,
      last_login_at = excluded.last_login_at,
      password_hash = excluded.password_hash,
      password_salt = excluded.password_salt,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `)
  const upsertSharedLedger = db.prepare(`
    INSERT INTO shared_ledgers (
      id, ledger_id, name, invite_code, owner_user_id, members_json,
      invitations_json, snapshot_json, version, created_at, updated_at,
      updated_by_user_id
    ) VALUES (
      @id, @ledger_id, @name, @invite_code, @owner_user_id, @members_json,
      @invitations_json, @snapshot_json, @version, @created_at, @updated_at,
      @updated_by_user_id
    )
    ON CONFLICT(id) DO UPDATE SET
      ledger_id = excluded.ledger_id,
      name = excluded.name,
      invite_code = excluded.invite_code,
      owner_user_id = excluded.owner_user_id,
      members_json = excluded.members_json,
      invitations_json = excluded.invitations_json,
      snapshot_json = excluded.snapshot_json,
      version = excluded.version,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      updated_by_user_id = excluded.updated_by_user_id
  `)
  const upsertReferral = db.prepare(`
    INSERT INTO referrals (
      id, code, inviter_user_id, invitee_user_id,
      inviter_reward_days, invitee_reward_days, created_at
    ) VALUES (
      @id, @code, @inviter_user_id, @invitee_user_id,
      @inviter_reward_days, @invitee_reward_days, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      inviter_user_id = excluded.inviter_user_id,
      invitee_user_id = excluded.invitee_user_id,
      inviter_reward_days = excluded.inviter_reward_days,
      invitee_reward_days = excluded.invitee_reward_days,
      created_at = excluded.created_at
  `)

  const deleteUsersById = db.prepare('DELETE FROM users WHERE id = ?')
  const deleteSharedLedgersById = db.prepare('DELETE FROM shared_ledgers WHERE id = ?')
  const deleteReferralsById = db.prepare('DELETE FROM referrals WHERE id = ?')

  const writeTransaction = db.transaction((nextData) => {
    const nextUsers = Array.isArray(nextData?.users) ? nextData.users.map(normalizeUserRecord) : []
    const nextSharedLedgers = Array.isArray(nextData?.shared_ledgers)
      ? nextData.shared_ledgers.map(normalizeSharedLedgerRecord)
      : []
    const nextReferrals = Array.isArray(nextData?.referrals) ? nextData.referrals.map(normalizeReferralRecord) : []

    const nextUserIds = new Set(nextUsers.map((item) => String(item.id)))
    const nextSharedLedgerIds = new Set(nextSharedLedgers.map((item) => String(item.id)))
    const nextReferralIds = new Set(nextReferrals.map((item) => String(item.id)))

    for (const user of nextUsers) {
      upsertUser.run({
        ...user,
        membership_grants_json: JSON.stringify(Array.isArray(user.membership_grants) ? user.membership_grants : []),
        email_verified: user.email_verified ? 1 : 0,
        must_change_password: user.must_change_password ? 1 : 0,
        password_reset_required: user.password_reset_required ? 1 : 0,
      })
    }

    for (const sharedLedger of nextSharedLedgers) {
      upsertSharedLedger.run({
        ...sharedLedger,
        members_json: JSON.stringify(Array.isArray(sharedLedger.members) ? sharedLedger.members : []),
        invitations_json: JSON.stringify(Array.isArray(sharedLedger.invitations) ? sharedLedger.invitations : []),
        snapshot_json: JSON.stringify(sharedLedger.snapshot ?? {}),
        version: Number(sharedLedger.version ?? 0),
      })
    }

    for (const referral of nextReferrals) {
      upsertReferral.run(referral)
    }

    for (const row of db.prepare('SELECT id FROM referrals').all()) {
      if (!nextReferralIds.has(String(row.id))) {
        deleteReferralsById.run(String(row.id))
      }
    }

    for (const row of db.prepare('SELECT id FROM shared_ledgers').all()) {
      if (!nextSharedLedgerIds.has(String(row.id))) {
        deleteSharedLedgersById.run(String(row.id))
      }
    }

    for (const row of db.prepare('SELECT id FROM users').all()) {
      if (!nextUserIds.has(String(row.id))) {
        deleteUsersById.run(String(row.id))
      }
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

async function runSerializedDatabaseWrite(mutator) {
  let result
  updateQueue = updateQueue.catch(() => null).then(async () => {
    const db = await ensureDatabase()
    result = await mutator(db)
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

function syncMembershipGrantBySource(user, source, {
  active = false,
  startAt = '',
  endAt = '',
  meta = {},
} = {}) {
  const normalizedSource = String(source ?? '').trim()
  if (!normalizedSource) {
    throw createStoreError('缺少會員來源', 'membership_source_required', 400)
  }

  const existingGrants = getMembershipGrantList(user)
  const keptGrants = existingGrants.filter((grant) => String(grant?.source ?? '').trim() !== normalizedSource)
  const now = nowIso()

  if (!active) {
    user.membership_grants = keptGrants
    user.updated_at = now
    return null
  }

  const endAtMs = Date.parse(String(endAt ?? ''))
  if (!Number.isFinite(endAtMs) || endAtMs <= Date.now()) {
    user.membership_grants = keptGrants
    user.updated_at = now
    return null
  }

  const normalizedStartAt = (() => {
    const startAtMs = Date.parse(String(startAt ?? ''))
    if (Number.isFinite(startAtMs) && startAtMs < endAtMs) {
      return new Date(startAtMs).toISOString()
    }
    return now
  })()

  const grant = {
    id: createId('membership_grant'),
    days: Math.max(1, Math.ceil((endAtMs - Date.parse(normalizedStartAt)) / (24 * 60 * 60 * 1000))),
    source: normalizedSource,
    start_at: normalizedStartAt,
    end_at: new Date(endAtMs).toISOString(),
    created_at: now,
    meta,
  }

  user.membership_grants = [...keptGrants, grant]
  user.updated_at = now
  return grant
}

function getUserSelectSql(alias = 'u') {
  return `
    ${alias}.id AS id,
    ${alias}.email AS email,
    ${alias}.account AS account,
    ${alias}.email_verified AS email_verified,
    ${alias}.display_name AS display_name,
    ${alias}.avatar_url AS avatar_url,
    ${alias}.referral_code AS referral_code,
    ${alias}.referred_by_user_id AS referred_by_user_id,
    ${alias}.referred_by_code AS referred_by_code,
    ${alias}.referral_redeemed_at AS referral_redeemed_at,
    ${alias}.membership_grants_json AS membership_grants_json,
    ${alias}.login_failed_attempts AS login_failed_attempts,
    ${alias}.last_failed_login_at AS last_failed_login_at,
    ${alias}.login_locked_until AS login_locked_until,
    ${alias}.must_change_password AS must_change_password,
    ${alias}.temporary_password_issued_at AS temporary_password_issued_at,
    ${alias}.password_reset_required AS password_reset_required,
    ${alias}.password_reset_token_hash AS password_reset_token_hash,
    ${alias}.password_reset_requested_at AS password_reset_requested_at,
    ${alias}.password_reset_expires_at AS password_reset_expires_at,
    ${alias}.password_hash AS password_hash,
    ${alias}.password_salt AS password_salt,
    ${alias}.last_login_at AS last_login_at,
    ${alias}.created_at AS created_at,
    ${alias}.updated_at AS updated_at
  `
}

function mapUserRow(row) {
  if (!row) return null
  return normalizeUserRecord({
    ...row,
    email_verified: Boolean(row.email_verified),
    must_change_password: Boolean(row.must_change_password),
    password_reset_required: Boolean(row.password_reset_required),
    membership_grants: parseJsonField(row.membership_grants_json, []),
  })
}

function mapAuthProviderRow(row) {
  if (!row) return null
  return normalizeAuthProviderSummary({
    provider: row.provider,
    provider_sub: row.provider_sub,
    provider_email: row.provider_email,
    email_verified: Boolean(row.email_verified),
    provider_display_name: row.provider_display_name,
    provider_avatar_url: row.provider_avatar_url,
    linked_at: row.linked_at,
    last_login_at: row.last_login_at,
  })
}

function getRefreshTokenExpiryIso() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString()
}

function getAccessTokenExpiresInSeconds() {
  return Math.max(60, Math.floor(ACCESS_TOKEN_TTL_MS / 1000))
}

function getRefreshTokenExpiresInSeconds() {
  return Math.max(300, Math.floor(REFRESH_TOKEN_TTL_MS / 1000))
}

function findUserRowById(db, userId) {
  const row = db.prepare(`
    SELECT ${getUserSelectSql('u')}
    FROM users u
    WHERE u.id = ?
    LIMIT 1
  `).get(String(userId ?? '').trim())
  return mapUserRow(row)
}

function findUserRowByEmail(db, email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null
  const row = db.prepare(`
    SELECT ${getUserSelectSql('u')}
    FROM users u
    WHERE u.email = ?
    LIMIT 1
  `).get(normalizedEmail)
  return mapUserRow(row)
}

function findProviderLinkRow(db, provider, providerSub) {
  return db.prepare(`
    SELECT *
    FROM user_auth_providers
    WHERE provider = ?
      AND provider_sub = ?
    LIMIT 1
  `).get(String(provider ?? '').trim(), String(providerSub ?? '').trim())
}

function listProviderRowsForUser(db, userId) {
  return db.prepare(`
    SELECT provider, provider_sub, provider_email, email_verified,
           provider_display_name, provider_avatar_url, linked_at, last_login_at
    FROM user_auth_providers
    WHERE user_id = ?
    ORDER BY linked_at ASC, provider ASC
  `).all(String(userId ?? '').trim())
}

function updateUserProfileFromIdentity(db, user, identity = {}) {
  if (!user?.id) {
    throw createStoreError('找不到使用者', 'user_not_found', 404)
  }

  const now = String(identity.lastLoginAt ?? nowIso())
  const nextEmail = identity.email ? validateEmail(identity.email) : ''
  const nextDisplayName = normalizeDisplayName(identity.displayName, user.display_name || nextEmail || user.email)
  const nextAvatarUrl = normalizeAvatarUrl(identity.avatarUrl)
  const emailVerified = Boolean(identity.emailVerified)

  let resolvedEmail = String(user.email ?? '').trim().toLowerCase()
  let resolvedAccount = String(user.account ?? '').trim().toLowerCase()

  if (nextEmail && nextEmail !== resolvedEmail) {
    const conflict = db.prepare(`
      SELECT id
      FROM users
      WHERE email = ?
        AND id <> ?
      LIMIT 1
    `).get(nextEmail, user.id)
    if (!conflict) {
      resolvedEmail = nextEmail
      resolvedAccount = nextEmail
    }
  }

  const resolvedDisplayName = String(user.display_name ?? '').trim() || nextDisplayName
  const resolvedAvatarUrl = String(user.avatar_url ?? '').trim() || nextAvatarUrl

  db.prepare(`
    UPDATE users
    SET email = ?,
        account = ?,
        email_verified = ?,
        display_name = ?,
        avatar_url = ?,
        last_login_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    resolvedEmail,
    resolvedAccount,
    emailVerified || Boolean(user.email_verified) ? 1 : 0,
    resolvedDisplayName,
    resolvedAvatarUrl,
    now,
    now,
    user.id,
  )

  return findUserRowById(db, user.id)
}

function upsertUserAuthProviderRow(db, {
  userId,
  provider,
  providerSub,
  providerEmail = '',
  emailVerified = false,
  displayName = '',
  avatarUrl = '',
  linkedAt = nowIso(),
  lastLoginAt = linkedAt,
}) {
  const normalizedProvider = String(provider ?? '').trim()
  const normalizedProviderSub = String(providerSub ?? '').trim()
  if (!normalizedProvider || !normalizedProviderSub) {
    throw createStoreError('缺少第三方登入識別', 'provider_identity_required', 400)
  }

  const existingBySub = findProviderLinkRow(db, normalizedProvider, normalizedProviderSub)
  if (existingBySub && String(existingBySub.user_id) !== String(userId)) {
    throw createStoreError('此 Google 帳號已綁定其他使用者', 'provider_already_linked', 409)
  }

  const existingByUser = db.prepare(`
    SELECT *
    FROM user_auth_providers
    WHERE user_id = ?
      AND provider = ?
    LIMIT 1
  `).get(String(userId), normalizedProvider)

  if (existingByUser && String(existingByUser.provider_sub ?? '') !== normalizedProviderSub) {
    throw createStoreError('目前帳號已綁定其他 Google 帳號', 'provider_binding_conflict', 409)
  }

  const normalizedEmail = normalizeEmail(providerEmail)
  const normalizedDisplayName = normalizeDisplayName(displayName, normalizedEmail)
  const normalizedAvatarUrl = normalizeAvatarUrl(avatarUrl)
  const now = nowIso()

  if (existingByUser) {
    db.prepare(`
      UPDATE user_auth_providers
      SET provider_email = ?,
          email_verified = ?,
          provider_display_name = ?,
          provider_avatar_url = ?,
          last_login_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      normalizedEmail,
      emailVerified ? 1 : 0,
      normalizedDisplayName,
      normalizedAvatarUrl,
      lastLoginAt,
      now,
      existingByUser.id,
    )
    return
  }

  db.prepare(`
    INSERT INTO user_auth_providers (
      id, user_id, provider, provider_sub, provider_email, email_verified,
      provider_display_name, provider_avatar_url, linked_at, last_login_at,
      created_at, updated_at
    ) VALUES (
      @id, @user_id, @provider, @provider_sub, @provider_email, @email_verified,
      @provider_display_name, @provider_avatar_url, @linked_at, @last_login_at,
      @created_at, @updated_at
    )
  `).run({
    id: createId('authp'),
    user_id: String(userId),
    provider: normalizedProvider,
    provider_sub: normalizedProviderSub,
    provider_email: normalizedEmail,
    email_verified: emailVerified ? 1 : 0,
    provider_display_name: normalizedDisplayName,
    provider_avatar_url: normalizedAvatarUrl,
    linked_at: linkedAt,
    last_login_at: lastLoginAt,
    created_at: now,
    updated_at: now,
  })
}

function createRefreshTokenRow(db, {
  userId,
  tokenFamilyId,
  parentTokenId = '',
  issuedByProvider = 'password',
  ipAddress = '',
  userAgent = '',
}) {
  const now = nowIso()
  const refreshTokenId = createId('rt')
  const refreshToken = createOpaqueToken(36)
  const tokenHash = hashSensitiveToken(refreshToken)
  const expiresAt = getRefreshTokenExpiryIso()

  db.prepare(`
    INSERT INTO refresh_tokens (
      id, user_id, token_family_id, token_hash, parent_token_id, replaced_by_token_id,
      issued_by_provider, user_agent, ip_address, issued_at, expires_at, last_used_at,
      revoked_at, revoke_reason, created_at, updated_at
    ) VALUES (
      @id, @user_id, @token_family_id, @token_hash, @parent_token_id, @replaced_by_token_id,
      @issued_by_provider, @user_agent, @ip_address, @issued_at, @expires_at, @last_used_at,
      @revoked_at, @revoke_reason, @created_at, @updated_at
    )
  `).run({
    id: refreshTokenId,
    user_id: String(userId),
    token_family_id: String(tokenFamilyId),
    token_hash: tokenHash,
    parent_token_id: String(parentTokenId ?? ''),
    replaced_by_token_id: '',
    issued_by_provider: String(issuedByProvider ?? 'password').trim() || 'password',
    user_agent: String(userAgent ?? '').trim(),
    ip_address: String(ipAddress ?? '').trim(),
    issued_at: now,
    expires_at: expiresAt,
    last_used_at: now,
    revoked_at: '',
    revoke_reason: '',
    created_at: now,
    updated_at: now,
  })

  return {
    refreshTokenId,
    refreshToken,
    expiresAt,
  }
}

function revokeRefreshTokenFamilyRows(db, tokenFamilyId, reason = 'logout') {
  const now = nowIso()
  db.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = CASE WHEN revoked_at = '' THEN ? ELSE revoked_at END,
        revoke_reason = CASE WHEN revoke_reason = '' THEN ? ELSE revoke_reason END,
        updated_at = ?
    WHERE token_family_id = ?
  `).run(now, String(reason ?? 'logout').trim() || 'logout', now, String(tokenFamilyId ?? '').trim())
}

async function listUserAuthProviders(userId) {
  const db = await ensureDatabase()
  return listProviderRowsForUser(db, userId).map(mapAuthProviderRow)
}

async function buildPublicUserProfile(user) {
  const authProviders = user?.id ? await listUserAuthProviders(user.id) : []
  return publicUser(user, { authProviders })
}

async function findUserByAuthProvider(provider, providerSub) {
  const db = await ensureDatabase()
  const row = db.prepare(`
    SELECT ${getUserSelectSql('u')}
    FROM user_auth_providers p
    INNER JOIN users u ON u.id = p.user_id
    WHERE p.provider = ?
      AND p.provider_sub = ?
    LIMIT 1
  `).get(String(provider ?? '').trim(), String(providerSub ?? '').trim())
  return mapUserRow(row)
}

async function createAuthNonce({
  provider,
  purpose = 'login',
  userId = '',
  ipAddress = '',
  userAgent = '',
}) {
  return runSerializedDatabaseWrite((db) => {
    const nonce = createOpaqueToken(24)
    const now = nowIso()
    const expiresAt = new Date(Date.now() + AUTH_NONCE_TTL_MS).toISOString()
    db.prepare(`
      INSERT INTO auth_nonces (
        id, provider, purpose, nonce_hash, user_id, ip_address, user_agent,
        created_at, expires_at, consumed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
    `).run(
      createId('nonce'),
      String(provider ?? '').trim(),
      String(purpose ?? 'login').trim() || 'login',
      hashSensitiveToken(nonce),
      String(userId ?? '').trim(),
      String(ipAddress ?? '').trim(),
      String(userAgent ?? '').trim(),
      now,
      expiresAt,
    )
    return {
      provider: String(provider ?? '').trim(),
      purpose: String(purpose ?? 'login').trim() || 'login',
      nonce,
      expires_at: expiresAt,
    }
  })
}

async function consumeAuthNonce({
  provider,
  nonce,
  purpose = '',
  userId = '',
}) {
  const nonceHash = hashSensitiveToken(nonce)
  return runSerializedDatabaseWrite((db) => {
    const row = db.prepare(`
      SELECT *
      FROM auth_nonces
      WHERE provider = ?
        AND nonce_hash = ?
      LIMIT 1
    `).get(String(provider ?? '').trim(), nonceHash)

    if (!row) {
      throw createStoreError('Google 登入驗證碼無效', 'google_nonce_invalid', 400)
    }
    if (String(row.consumed_at ?? '').trim()) {
      throw createStoreError('Google 登入驗證碼已被使用', 'google_nonce_replayed', 400)
    }

    const expiresAtMs = Date.parse(String(row.expires_at ?? ''))
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      throw createStoreError('Google 登入驗證碼已過期', 'google_nonce_expired', 400)
    }

    if (purpose && String(row.purpose ?? '').trim() !== String(purpose).trim()) {
      throw createStoreError('Google 登入驗證用途不符', 'google_nonce_purpose_mismatch', 400)
    }

    if (String(row.user_id ?? '').trim() && String(row.user_id ?? '').trim() !== String(userId ?? '').trim()) {
      throw createStoreError('Google 綁定帳號不符', 'google_nonce_user_mismatch', 403)
    }

    const now = nowIso()
    db.prepare(`
      UPDATE auth_nonces
      SET consumed_at = ?
      WHERE id = ?
    `).run(now, row.id)

    return {
      id: String(row.id ?? '').trim(),
      provider: String(row.provider ?? '').trim(),
      purpose: String(row.purpose ?? '').trim(),
      user_id: String(row.user_id ?? '').trim(),
      expires_at: String(row.expires_at ?? '').trim(),
      consumed_at: now,
    }
  })
}

async function writeAuthAuditLog({
  userId = '',
  provider = '',
  eventType = '',
  eventStatus = 'info',
  ipAddress = '',
  userAgent = '',
  detail = {},
}) {
  return runSerializedDatabaseWrite((db) => {
    db.prepare(`
      INSERT INTO auth_audit_logs (
        id, user_id, provider, event_type, event_status,
        ip_address, user_agent, detail_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      createId('audit'),
      String(userId ?? '').trim(),
      String(provider ?? '').trim(),
      String(eventType ?? '').trim(),
      String(eventStatus ?? 'info').trim() || 'info',
      String(ipAddress ?? '').trim(),
      String(userAgent ?? '').trim(),
      JSON.stringify(detail ?? {}),
      nowIso(),
    )
    return true
  })
}

async function createUserFromExternalIdentity({
  provider,
  providerSub,
  email,
  emailVerified = false,
  displayName = '',
  avatarUrl = '',
}) {
  return runSerializedDatabaseWrite((db) => {
    const tx = db.transaction(() => {
      const normalizedEmail = validateEmail(email)
      if (findUserRowByEmail(db, normalizedEmail)) {
        throw createStoreError('此 Email 已存在，請先登入後再綁定 Google', 'existing_account_link_required', 409)
      }

      const now = nowIso()
      const storeSnapshot = loadStoreFromDatabase(db)
      const user = normalizeUserRecord({
        id: createId('user'),
        email: normalizedEmail,
        account: normalizedEmail,
        email_verified: Boolean(emailVerified),
        display_name: normalizeDisplayName(displayName, normalizedEmail),
        avatar_url: normalizeAvatarUrl(avatarUrl),
        referral_code: createUniqueReferralCode(storeSnapshot),
        referred_by_user_id: '',
        referred_by_code: '',
        referral_redeemed_at: '',
        membership_grants: [],
        login_failed_attempts: 0,
        last_failed_login_at: '',
        login_locked_until: '',
        must_change_password: false,
        temporary_password_issued_at: '',
        password_reset_required: false,
        password_reset_token_hash: '',
        password_reset_requested_at: '',
        password_reset_expires_at: '',
        password_hash: '',
        password_salt: '',
        last_login_at: now,
        created_at: now,
        updated_at: now,
      })

      db.prepare(`
        INSERT INTO users (
          id, email, account, email_verified, display_name, avatar_url, referral_code,
          referred_by_user_id, referred_by_code, referral_redeemed_at, membership_grants_json,
          login_failed_attempts, last_failed_login_at, login_locked_until, must_change_password,
          temporary_password_issued_at, password_reset_required, password_reset_token_hash,
          password_reset_requested_at, password_reset_expires_at, password_hash, password_salt,
          last_login_at, created_at, updated_at
        ) VALUES (
          @id, @email, @account, @email_verified, @display_name, @avatar_url, @referral_code,
          @referred_by_user_id, @referred_by_code, @referral_redeemed_at, @membership_grants_json,
          @login_failed_attempts, @last_failed_login_at, @login_locked_until, @must_change_password,
          @temporary_password_issued_at, @password_reset_required, @password_reset_token_hash,
          @password_reset_requested_at, @password_reset_expires_at, @password_hash, @password_salt,
          @last_login_at, @created_at, @updated_at
        )
      `).run({
        ...user,
        email_verified: user.email_verified ? 1 : 0,
        membership_grants_json: JSON.stringify([]),
        must_change_password: 0,
        password_reset_required: 0,
      })

      upsertUserAuthProviderRow(db, {
        userId: user.id,
        provider,
        providerSub,
        providerEmail: normalizedEmail,
        emailVerified,
        displayName,
        avatarUrl,
        linkedAt: now,
        lastLoginAt: now,
      })

      return findUserRowById(db, user.id)
    })

    return tx()
  })
}

async function linkUserAuthProvider({
  userId,
  provider,
  providerSub,
  email = '',
  emailVerified = false,
  displayName = '',
  avatarUrl = '',
}) {
  return runSerializedDatabaseWrite((db) => {
    const tx = db.transaction(() => {
      const existingUser = findUserRowById(db, userId)
      if (!existingUser) {
        throw createStoreError('找不到使用者', 'user_not_found', 404)
      }

      const now = nowIso()
      upsertUserAuthProviderRow(db, {
        userId,
        provider,
        providerSub,
        providerEmail: email,
        emailVerified,
        displayName,
        avatarUrl,
        linkedAt: now,
        lastLoginAt: now,
      })

      return updateUserProfileFromIdentity(db, existingUser, {
        email,
        emailVerified,
        displayName,
        avatarUrl,
        lastLoginAt: now,
      })
    })

    return tx()
  })
}

async function updateUserFromAuthProviderLogin({
  userId,
  email = '',
  emailVerified = false,
  displayName = '',
  avatarUrl = '',
}) {
  return runSerializedDatabaseWrite((db) => {
    const tx = db.transaction(() => {
      const existingUser = findUserRowById(db, userId)
      if (!existingUser) {
        throw createStoreError('找不到使用者', 'user_not_found', 404)
      }
      return updateUserProfileFromIdentity(db, existingUser, {
        email,
        emailVerified,
        displayName,
        avatarUrl,
      })
    })
    return tx()
  })
}

async function createLoginSession(user, {
  issuedByProvider = 'password',
  ipAddress = '',
  userAgent = '',
} = {}) {
  return runSerializedDatabaseWrite((db) => {
    const tx = db.transaction(() => {
      const existingUser = findUserRowById(db, user?.id)
      if (!existingUser) {
        throw createStoreError('找不到使用者', 'user_not_found', 404)
      }

      const sessionFamilyId = createId('rtf')
      const refresh = createRefreshTokenRow(db, {
        userId: existingUser.id,
        tokenFamilyId: sessionFamilyId,
        issuedByProvider,
        ipAddress,
        userAgent,
      })

      return {
        user: existingUser,
        accessToken: issueAccessToken({ ...existingUser, session_family_id: sessionFamilyId }),
        refreshToken: refresh.refreshToken,
        refreshTokenExpiresAt: refresh.expiresAt,
        sessionFamilyId,
        expiresInSec: getAccessTokenExpiresInSeconds(),
        refreshExpiresInSec: getRefreshTokenExpiresInSeconds(),
      }
    })

    return tx()
  })
}

async function rotateRefreshSession(refreshToken, {
  ipAddress = '',
  userAgent = '',
} = {}) {
  const refreshTokenHash = hashSensitiveToken(refreshToken)
  return runSerializedDatabaseWrite((db) => {
    const tx = db.transaction(() => {
      const row = db.prepare(`
        SELECT *
        FROM refresh_tokens
        WHERE token_hash = ?
        LIMIT 1
      `).get(refreshTokenHash)

      if (!row) {
        throw createStoreError('Refresh token 無效', 'refresh_token_invalid', 401)
      }

      if (String(row.revoked_at ?? '').trim()) {
        if (String(row.revoke_reason ?? '').trim() === 'rotated') {
          revokeRefreshTokenFamilyRows(db, row.token_family_id, 'reuse_detected')
          throw createStoreError('Refresh token 已重複使用，登入狀態已失效', 'refresh_token_reuse_detected', 401)
        }
        throw createStoreError('Refresh token 已失效', 'refresh_token_revoked', 401)
      }

      const expiresAtMs = Date.parse(String(row.expires_at ?? ''))
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
        const now = nowIso()
        db.prepare(`
          UPDATE refresh_tokens
          SET revoked_at = ?, revoke_reason = 'expired', updated_at = ?
          WHERE id = ?
        `).run(now, now, row.id)
        throw createStoreError('Refresh token 已過期', 'refresh_token_expired', 401)
      }

      const user = findUserRowById(db, row.user_id)
      if (!user) {
        revokeRefreshTokenFamilyRows(db, row.token_family_id, 'user_missing')
        throw createStoreError('登入狀態已失效，請重新登入', 'refresh_user_missing', 401)
      }

      const now = nowIso()
      const refresh = createRefreshTokenRow(db, {
        userId: user.id,
        tokenFamilyId: row.token_family_id,
        parentTokenId: row.id,
        issuedByProvider: row.issued_by_provider,
        ipAddress,
        userAgent: userAgent || row.user_agent,
      })

      db.prepare(`
        UPDATE refresh_tokens
        SET replaced_by_token_id = ?,
            revoked_at = ?,
            revoke_reason = 'rotated',
            last_used_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(refresh.refreshTokenId, now, now, now, row.id)

      return {
        user,
        accessToken: issueAccessToken({ ...user, session_family_id: row.token_family_id }),
        refreshToken: refresh.refreshToken,
        refreshTokenExpiresAt: refresh.expiresAt,
        sessionFamilyId: String(row.token_family_id ?? '').trim(),
        expiresInSec: getAccessTokenExpiresInSeconds(),
        refreshExpiresInSec: getRefreshTokenExpiresInSeconds(),
      }
    })

    return tx()
  })
}

async function revokeRefreshSession(refreshToken, {
  sessionFamilyId = '',
  userId = '',
  reason = 'logout',
} = {}) {
  return runSerializedDatabaseWrite((db) => {
    const tx = db.transaction(() => {
      if (refreshToken) {
        const tokenHash = hashSensitiveToken(refreshToken)
        const row = db.prepare(`
          SELECT *
          FROM refresh_tokens
          WHERE token_hash = ?
          LIMIT 1
        `).get(tokenHash)
        if (row) {
          revokeRefreshTokenFamilyRows(db, row.token_family_id, reason)
          return true
        }
      }

      if (sessionFamilyId) {
        revokeRefreshTokenFamilyRows(db, sessionFamilyId, reason)
        return true
      }

      if (userId) {
        const now = nowIso()
        db.prepare(`
          UPDATE refresh_tokens
          SET revoked_at = CASE WHEN revoked_at = '' THEN ? ELSE revoked_at END,
              revoke_reason = CASE WHEN revoke_reason = '' THEN ? ELSE revoke_reason END,
              updated_at = ?
          WHERE user_id = ?
        `).run(now, String(reason ?? 'logout').trim() || 'logout', now, String(userId))
      }
      return true
    })

    return tx()
  })
}

export {
  applyMembershipGrant,
  buildPublicUserProfile,
  buildSharedLedgerInvitationSummary,
  buildSharedLedgerSummary,
  createAuthNonce,
  createId,
  createInviteCode,
  createLoginSession,
  createPasswordResetToken,
  createTemporaryPassword,
  createUniqueReferralCode,
  createUserFromExternalIdentity,
  findUserByAuthProvider,
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
  listUserAuthProviders,
  listPendingSharedLedgerInvitationsForUser,
  linkUserAuthProvider,
  normalizeAvatarUrl,
  normalizeAuthProviderSummary,
  normalizeDisplayName,
  normalizeEmail,
  nowIso,
  publicUser,
  revokeRefreshSession,
  rotateRefreshSession,
  runSerializedDatabaseWrite,
  syncMembershipGrantBySource,
  updateUserFromAuthProviderLogin,
  validateEmail,
  validatePassword,
  validateSnapshot,
  verifyAccessToken,
  verifyPassword,
  writeAuthAuditLog,
  consumeAuthNonce,
}
