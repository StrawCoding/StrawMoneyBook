import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { createStoreAuthAuditApi } from './store-auth-audit.js'
import { createStoreAuthProfileApi } from './store-auth-profile.js'
import { createStoreAuthSessionApi } from './store-auth-session.js'
import {
  getAccessTokenExpiresInSeconds as getAccessTokenExpiresInSecondsValue,
  issueAccessToken as issueAccessTokenValue,
  verifyAccessToken as verifyAccessTokenValue,
} from './store-access-token.js'
import {
  applyMembershipGrant as applyMembershipGrantValue,
  getLatestMembershipGrantBySource,
  getMembershipGrantList as getMembershipGrantListValue,
  getMembershipGrantSummary as getMembershipGrantSummaryValue,
  syncMembershipGrantBySource as syncMembershipGrantBySourceValue,
} from './store-membership.js'
import {
  buildSharedLedgerInvitationSummary as buildSharedLedgerInvitationSummaryValue,
  buildSharedLedgerMemberList as buildSharedLedgerMemberListValue,
  buildSharedLedgerSummary as buildSharedLedgerSummaryValue,
  canAssignMemberRole,
  canInviteMembers,
  canManageMembers,
  canPushSnapshot,
  canTransferOwnership,
  findPendingInvitationForEmail as findPendingInvitationForEmailValue,
  getMemberRole as getMemberRoleValue,
  getSharedLedgerPermissions,
  isSharedLedgerMember as isSharedLedgerMemberValue,
  listPendingSharedLedgerInvitationsForUser as listPendingSharedLedgerInvitationsForUserValue,
  normalizeRole,
  SHARED_LEDGER_ROLES,
  validateSnapshot as validateSnapshotValue,
} from './store-shared-ledgers.js'

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
const ADMIN_EMAILS = new Set(
  String(process.env.SHARED_LEDGER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean),
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

function secureEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''), 'utf8')
  const rightBuffer = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function isAdminEmail(email) {
  const normalized = normalizeEmail(email)
  return normalized ? ADMIN_EMAILS.has(normalized) : false
}

function isAdminUser(user) {
  return isAdminEmail(user?.email ?? user?.account)
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
  return getMembershipGrantListValue(user)
}

function getMembershipGrantSummary(user, nowMs = Date.now()) {
  return getMembershipGrantSummaryValue(user, nowMs)
}

function issueAccessToken(user) {
  return issueAccessTokenValue(user, {
    tokenSecret: TOKEN_SECRET,
    accessTokenTtlMs: ACCESS_TOKEN_TTL_MS,
    createId,
  })
}

function verifyAccessToken(token) {
  return verifyAccessTokenValue(token, {
    tokenSecret: TOKEN_SECRET,
  })
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
    previous_snapshot: sharedLedger?.previous_snapshot && typeof sharedLedger.previous_snapshot === 'object'
      ? sharedLedger.previous_snapshot
      : null,
    force_audit: Array.isArray(sharedLedger?.force_audit) ? sharedLedger.force_audit : [],
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
      previous_snapshot_json TEXT NOT NULL DEFAULT '',
      force_audit_json TEXT NOT NULL DEFAULT '[]',
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

  const sharedLedgerColumns = new Set(
    db.prepare(`PRAGMA table_info(shared_ledgers)`).all().map((column) => String(column?.name ?? '').trim()),
  )
  if (!sharedLedgerColumns.has('previous_snapshot_json')) {
    db.exec(`ALTER TABLE shared_ledgers ADD COLUMN previous_snapshot_json TEXT NOT NULL DEFAULT ''`)
  }
  if (!sharedLedgerColumns.has('force_audit_json')) {
    db.exec(`ALTER TABLE shared_ledgers ADD COLUMN force_audit_json TEXT NOT NULL DEFAULT '[]'`)
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
      invitations_json, snapshot_json, previous_snapshot_json, force_audit_json,
      version, created_at, updated_at, updated_by_user_id
    FROM shared_ledgers
    ORDER BY created_at ASC, id ASC
  `).all().map((row) => normalizeSharedLedgerRecord({
    ...row,
    members: parseJsonField(row.members_json, []),
    invitations: parseJsonField(row.invitations_json, []),
    snapshot: parseJsonField(row.snapshot_json, {}),
    previous_snapshot: parseJsonField(row.previous_snapshot_json, null),
    force_audit: parseJsonField(row.force_audit_json, []),
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

function indexRecordsById(records, normalizer) {
  const map = new Map()
  if (!Array.isArray(records)) return map
  for (const record of records) {
    const normalized = normalizer(record)
    map.set(String(normalized.id), JSON.stringify(normalized))
  }
  return map
}

// Snapshot the store state at load time so the next write only touches records
// that actually changed. Keyed by id -> serialized (normalized) record.
function buildStoreBaseline(data) {
  return {
    users: indexRecordsById(data?.users, normalizeUserRecord),
    shared_ledgers: indexRecordsById(data?.shared_ledgers, normalizeSharedLedgerRecord),
    referrals: indexRecordsById(data?.referrals, normalizeReferralRecord),
  }
}

function prepareStoreWriteStatements(db) {
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
      invitations_json, snapshot_json, previous_snapshot_json, force_audit_json,
      version, created_at, updated_at, updated_by_user_id
    ) VALUES (
      @id, @ledger_id, @name, @invite_code, @owner_user_id, @members_json,
      @invitations_json, @snapshot_json, @previous_snapshot_json, @force_audit_json,
      @version, @created_at, @updated_at, @updated_by_user_id
    )
    ON CONFLICT(id) DO UPDATE SET
      ledger_id = excluded.ledger_id,
      name = excluded.name,
      invite_code = excluded.invite_code,
      owner_user_id = excluded.owner_user_id,
      members_json = excluded.members_json,
      invitations_json = excluded.invitations_json,
      snapshot_json = excluded.snapshot_json,
      previous_snapshot_json = excluded.previous_snapshot_json,
      force_audit_json = excluded.force_audit_json,
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

  return {
    upsertUser,
    upsertSharedLedger,
    upsertReferral,
    deleteUsersById,
    deleteSharedLedgersById,
    deleteReferralsById,
  }
}

function bindUserRow(statement, user) {
  statement.run({
    ...user,
    membership_grants_json: JSON.stringify(Array.isArray(user.membership_grants) ? user.membership_grants : []),
    email_verified: user.email_verified ? 1 : 0,
    must_change_password: user.must_change_password ? 1 : 0,
    password_reset_required: user.password_reset_required ? 1 : 0,
  })
}

function bindSharedLedgerRow(statement, sharedLedger) {
  statement.run({
    ...sharedLedger,
    members_json: JSON.stringify(Array.isArray(sharedLedger.members) ? sharedLedger.members : []),
    invitations_json: JSON.stringify(Array.isArray(sharedLedger.invitations) ? sharedLedger.invitations : []),
    snapshot_json: JSON.stringify(sharedLedger.snapshot ?? {}),
    previous_snapshot_json: sharedLedger.previous_snapshot
      ? JSON.stringify(sharedLedger.previous_snapshot)
      : '',
    force_audit_json: JSON.stringify(Array.isArray(sharedLedger.force_audit) ? sharedLedger.force_audit : []),
    version: Number(sharedLedger.version ?? 0),
  })
}

// Writes the store back to SQLite inside a single transaction.
//
// When a `baseline` (id -> serialized record snapshot taken at load time) is
// supplied, only records that were added or actually changed get upserted, and
// only records that were removed get deleted. This avoids the O(N) full-table
// re-upsert + full-table delete scan that previously ran on every mutation,
// which was the root cause of the updateStore read/write bottleneck.
//
// Without a baseline (e.g. legacy JSON migration) it performs a full write and
// reconciles deletions by scanning the existing rows.
function writeStoreToDatabase(db, data, baseline = null) {
  const statements = prepareStoreWriteStatements(db)

  const writeTransaction = db.transaction((nextData) => {
    const nextUsers = Array.isArray(nextData?.users) ? nextData.users.map(normalizeUserRecord) : []
    const nextSharedLedgers = Array.isArray(nextData?.shared_ledgers)
      ? nextData.shared_ledgers.map(normalizeSharedLedgerRecord)
      : []
    const nextReferrals = Array.isArray(nextData?.referrals) ? nextData.referrals.map(normalizeReferralRecord) : []

    const nextUserIds = new Set(nextUsers.map((item) => String(item.id)))
    const nextSharedLedgerIds = new Set(nextSharedLedgers.map((item) => String(item.id)))
    const nextReferralIds = new Set(nextReferrals.map((item) => String(item.id)))

    const isUnchanged = (table, record) => {
      if (!baseline) return false
      const previous = baseline[table]?.get(String(record.id))
      return previous !== undefined && previous === JSON.stringify(record)
    }

    for (const user of nextUsers) {
      if (isUnchanged('users', user)) continue
      bindUserRow(statements.upsertUser, user)
    }

    for (const sharedLedger of nextSharedLedgers) {
      if (isUnchanged('shared_ledgers', sharedLedger)) continue
      bindSharedLedgerRow(statements.upsertSharedLedger, sharedLedger)
    }

    for (const referral of nextReferrals) {
      if (isUnchanged('referrals', referral)) continue
      statements.upsertReferral.run(referral)
    }

    if (baseline) {
      for (const id of baseline.referrals.keys()) {
        if (!nextReferralIds.has(id)) statements.deleteReferralsById.run(id)
      }
      for (const id of baseline.shared_ledgers.keys()) {
        if (!nextSharedLedgerIds.has(id)) statements.deleteSharedLedgersById.run(id)
      }
      for (const id of baseline.users.keys()) {
        if (!nextUserIds.has(id)) statements.deleteUsersById.run(id)
      }
    } else {
      for (const row of db.prepare('SELECT id FROM referrals').all()) {
        if (!nextReferralIds.has(String(row.id))) {
          statements.deleteReferralsById.run(String(row.id))
        }
      }
      for (const row of db.prepare('SELECT id FROM shared_ledgers').all()) {
        if (!nextSharedLedgerIds.has(String(row.id))) {
          statements.deleteSharedLedgersById.run(String(row.id))
        }
      }
      for (const row of db.prepare('SELECT id FROM users').all()) {
        if (!nextUserIds.has(String(row.id))) {
          statements.deleteUsersById.run(String(row.id))
        }
      }
    }
  })

  writeTransaction(data)
}

function persistStoreToDatabase(db, data) {
  writeStoreToDatabase(db, data, null)
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
    const baseline = buildStoreBaseline(data)
    result = await mutator(data)
    writeStoreToDatabase(db, data, baseline)
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
  return getMemberRoleValue(sharedLedger, userId)
}

function isSharedLedgerMember(sharedLedger, userId) {
  return isSharedLedgerMemberValue(sharedLedger, userId)
}

function findPendingInvitationForEmail(sharedLedger, email) {
  return findPendingInvitationForEmailValue(sharedLedger, email, { normalizeEmail })
}

function validateSnapshot(snapshot) {
  return validateSnapshotValue(snapshot)
}

function buildSharedLedgerSummary(sharedLedger, currentUserId, data) {
  return buildSharedLedgerSummaryValue(sharedLedger, currentUserId, data, { findUserById })
}

function buildSharedLedgerInvitationSummary(sharedLedger, invitation, data) {
  return buildSharedLedgerInvitationSummaryValue(sharedLedger, invitation, data, { findUserById })
}

function buildSharedLedgerMemberList(sharedLedger, data) {
  return buildSharedLedgerMemberListValue(sharedLedger, data, { findUserById })
}

function listPendingSharedLedgerInvitationsForUser(data, user) {
  return listPendingSharedLedgerInvitationsForUserValue(data, user, {
    normalizeEmail,
    findUserById,
  })
}

function applyMembershipGrant(user, days, source, meta = {}) {
  return applyMembershipGrantValue(user, days, source, meta, {
    createId,
    nowIso,
  })
}

function syncMembershipGrantBySource(user, source, {
  active = false,
  startAt = '',
  endAt = '',
  meta = {},
} = {}) {
  return syncMembershipGrantBySourceValue(user, source, {
    active,
    startAt,
    endAt,
    meta,
  }, {
    createId,
    nowIso,
    createStoreError,
  })
}

function getRefreshTokenExpiryIso() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString()
}

function getAccessTokenExpiresInSeconds() {
  return getAccessTokenExpiresInSecondsValue(ACCESS_TOKEN_TTL_MS)
}

function getRefreshTokenExpiresInSeconds() {
  return Math.max(300, Math.floor(REFRESH_TOKEN_TTL_MS / 1000))
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
const authProfileApi = createStoreAuthProfileApi({
  createId,
  createStoreError,
  createUniqueReferralCode,
  ensureDatabase,
  getLatestMembershipGrantBySource,
  getMembershipGrantList,
  getMembershipGrantSummary,
  isAdminUser,
  listProviderRowsForUser,
  loadStoreFromDatabase,
  normalizeAvatarUrl,
  normalizeDisplayName,
  normalizeEmail,
  normalizeUserRecord,
  nowIso,
  parseJsonField,
  runSerializedDatabaseWrite,
  validateEmail,
})

const {
  buildPublicUserProfile,
  createUserFromExternalIdentity,
  findProviderLinkRow,
  findUserByAuthProvider,
  findUserRowByEmail,
  findUserRowById,
  getUserSelectSql,
  linkUserAuthProvider,
  listUserAuthProviders,
  mapAuthProviderRow,
  mapUserRow,
  normalizeAuthProviderSummary,
  publicUser,
  updateUserFromAuthProviderLogin,
  updateUserProfileFromIdentity,
  upsertUserAuthProviderRow,
} = authProfileApi

const authSessionApi = createStoreAuthSessionApi({
  createId,
  createOpaqueToken,
  createStoreError,
  findUserRowById,
  getAccessTokenExpiresInSeconds,
  getRefreshTokenExpiresInSeconds,
  getRefreshTokenExpiryIso,
  hashSensitiveToken,
  issueAccessToken,
  nowIso,
  runSerializedDatabaseWrite,
})

const {
  createLoginSession,
  createRefreshTokenRow,
  revokeRefreshSession,
  revokeRefreshTokenFamilyRows,
  rotateRefreshSession,
} = authSessionApi

const authAuditApi = createStoreAuthAuditApi({
  authNonceTtlMs: AUTH_NONCE_TTL_MS,
  createId,
  createOpaqueToken,
  createStoreError,
  hashSensitiveToken,
  nowIso,
  runSerializedDatabaseWrite,
})

const {
  consumeAuthNonce,
  createAuthNonce,
  writeAuthAuditLog,
} = authAuditApi

export {
  applyMembershipGrant,
  buildPublicUserProfile,
  buildSharedLedgerInvitationSummary,
  buildSharedLedgerMemberList,
  buildSharedLedgerSummary,
  canAssignMemberRole,
  canInviteMembers,
  canManageMembers,
  canPushSnapshot,
  canTransferOwnership,
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
  getSharedLedgerPermissions,
  normalizeRole,
  SHARED_LEDGER_ROLES,
  isAdminEmail,
  isAdminUser,
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
