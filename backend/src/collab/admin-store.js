import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createId,
  getMembershipGrantSummary,
  nowIso,
  publicUser,
  readStore,
  runSerializedDatabaseWrite,
  syncMembershipGrantBySource,
  updateStore,
} from './store.js'

const CONFIGURED_DATA_FILE = String(process.env.SHARED_LEDGER_DATA_FILE ?? '').trim()
const CONFIGURED_DB_FILE = String(process.env.SHARED_LEDGER_DB_FILE ?? '').trim()
const DEFAULT_DB_FILE_PATH = fileURLToPath(new URL('../../.server-data/collab-store.sqlite', import.meta.url))
const DATA_FILE_PATH = resolve(
  CONFIGURED_DB_FILE
    || (CONFIGURED_DATA_FILE.endsWith('.sqlite') ? CONFIGURED_DATA_FILE : '')
    || DEFAULT_DB_FILE_PATH,
)
const ADMIN_MEMBERSHIP_SOURCE = 'admin_console'
const ADMIN_LIFETIME_EXPIRES_AT = '2099-12-31T23:59:59.999Z'
const USER_CHART_DAYS = 7
const ERROR_LOG_LIMIT = 100

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeErrorLevel(value) {
  const normalized = normalizeText(value).toLowerCase()
  return normalized === 'error' ? 'error' : 'error'
}

function normalizeReviewStatus(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'reviewed') return 'reviewed'
  if (normalized === 'ignored') return 'ignored'
  if (normalized === 'linear_created') return 'linear_created'
  return 'pending'
}

function safeJsonStringify(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback)
  } catch {
    return JSON.stringify(fallback)
  }
}

function parseJson(value, fallback = {}) {
  const source = normalizeText(value)
  if (!source) return fallback
  try {
    return JSON.parse(source)
  } catch {
    return fallback
  }
}

function truncateText(value, maxLength = 4000) {
  const text = String(value ?? '')
  if (text.length <= maxLength) return text
  return text.slice(0, Math.max(0, maxLength - 1)) + '…'
}

async function ensureDatabaseDirectory() {
  await mkdir(dirname(DATA_FILE_PATH), { recursive: true })
}

function ensureAdminSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_error_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      level TEXT NOT NULL,
      code TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT NOT NULL,
      route_path TEXT NOT NULL,
      app_version TEXT NOT NULL,
      platform TEXT NOT NULL,
      release_channel TEXT NOT NULL,
      context_json TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TEXT NOT NULL DEFAULT '',
      reviewed_by_user_id TEXT NOT NULL DEFAULT '',
      linear_issue_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_client_error_logs_created_at
      ON client_error_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_error_logs_review_status
      ON client_error_logs(review_status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_error_logs_user_created_at
      ON client_error_logs(user_id, created_at DESC);
  `)
}

async function ensureAdminDatabaseReady() {
  await ensureDatabaseDirectory()
  return runSerializedDatabaseWrite((db) => {
    ensureAdminSchema(db)
    return true
  })
}

function normalizeAdminUserSummary(user) {
  const membership = getMembershipGrantSummary(user)
  const profile = publicUser(user, { authProviders: [] })
  return {
    id: profile.id,
    email: profile.email,
    display_name: profile.display_name,
    created_at: profile.created_at,
    last_login_at: profile.last_login_at,
    membership_active: Boolean(profile.membership_active),
    membership_bonus_expires_at: String(profile.membership_bonus_expires_at ?? membership.expiresAt ?? '').trim(),
    membership_source: String(profile.membership_source ?? membership.source ?? '').trim(),
    is_admin: Boolean(profile.is_admin),
  }
}

function buildDaySeries(rows = [], days = USER_CHART_DAYS) {
  const buckets = new Map()
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(end)
    day.setDate(end.getDate() - index)
    const key = day.toISOString().slice(0, 10)
    buckets.set(key, 0)
  }

  for (const row of rows) {
    const key = normalizeText(row).slice(0, 10)
    if (!buckets.has(key)) continue
    buckets.set(key, Number(buckets.get(key) ?? 0) + 1)
  }

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }))
}

function mapClientErrorLogRow(row) {
  if (!row) return null
  return {
    id: normalizeText(row.id),
    user_id: normalizeText(row.user_id),
    user_email: normalizeText(row.user_email),
    level: normalizeErrorLevel(row.level),
    code: normalizeText(row.code),
    message: normalizeText(row.message),
    stack: String(row.stack ?? ''),
    route_path: normalizeText(row.route_path),
    app_version: normalizeText(row.app_version),
    platform: normalizeText(row.platform),
    release_channel: normalizeText(row.release_channel),
    context: parseJson(row.context_json, {}),
    review_status: normalizeReviewStatus(row.review_status),
    reviewed_at: normalizeText(row.reviewed_at),
    reviewed_by_user_id: normalizeText(row.reviewed_by_user_id),
    linear_issue_id: normalizeText(row.linear_issue_id),
    created_at: normalizeText(row.created_at),
  }
}

export async function writeClientErrorLog({
  userId = '',
  userEmail = '',
  level = 'error',
  code = '',
  message = '',
  stack = '',
  routePath = '',
  appVersion = '',
  platform = '',
  releaseChannel = '',
  context = {},
} = {}) {
  await ensureAdminDatabaseReady()
  return runSerializedDatabaseWrite((db) => {
    const now = nowIso()
    const id = createId('client_error_log')
    db.prepare(`
      INSERT INTO client_error_logs (
        id, user_id, user_email, level, code, message, stack, route_path,
        app_version, platform, release_channel, context_json, review_status,
        reviewed_at, reviewed_by_user_id, linear_issue_id, created_at
      ) VALUES (
        @id, @user_id, @user_email, @level, @code, @message, @stack, @route_path,
        @app_version, @platform, @release_channel, @context_json, 'pending',
        '', '', '', @created_at
      )
    `).run({
      id,
      user_id: normalizeText(userId),
      user_email: truncateText(userEmail, 254),
      level: normalizeErrorLevel(level),
      code: truncateText(code, 120),
      message: truncateText(message, 2000),
      stack: truncateText(stack, 12000),
      route_path: truncateText(routePath, 512),
      app_version: truncateText(appVersion, 80),
      platform: truncateText(platform, 80),
      release_channel: truncateText(releaseChannel, 80),
      context_json: safeJsonStringify(context, {}),
      created_at: now,
    })
    return { id, created_at: now }
  })
}

export async function listClientErrorLogs({ limit = ERROR_LOG_LIMIT, reviewStatus = '' } = {}) {
  await ensureAdminDatabaseReady()
  return runSerializedDatabaseWrite((db) => {
    ensureAdminSchema(db)
    const normalizedLimit = Math.min(ERROR_LOG_LIMIT, Math.max(1, Number(limit) || ERROR_LOG_LIMIT))
    const normalizedReviewStatus = normalizeReviewStatus(reviewStatus)
    const rows = reviewStatus
      ? db.prepare(`
          SELECT *
          FROM client_error_logs
          WHERE review_status = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(normalizedReviewStatus, normalizedLimit)
      : db.prepare(`
          SELECT *
          FROM client_error_logs
          ORDER BY created_at DESC
          LIMIT ?
        `).all(normalizedLimit)
    return rows.map(mapClientErrorLogRow)
  })
}

export async function updateClientErrorLogReview(logId, {
  reviewStatus = 'reviewed',
  reviewedByUserId = '',
  linearIssueId = '',
} = {}) {
  await ensureAdminDatabaseReady()
  const normalizedLogId = normalizeText(logId)
  const normalizedReviewStatus = normalizeReviewStatus(reviewStatus)
  return runSerializedDatabaseWrite((db) => {
    ensureAdminSchema(db)
    const now = nowIso()
    const result = db.prepare(`
      UPDATE client_error_logs
      SET review_status = ?,
          reviewed_at = ?,
          reviewed_by_user_id = ?,
          linear_issue_id = ?
      WHERE id = ?
    `).run(
      normalizedReviewStatus,
      now,
      normalizeText(reviewedByUserId),
      normalizeText(linearIssueId),
      normalizedLogId,
    )
    if (!result.changes) {
      throw new Error('找不到錯誤紀錄')
    }
    const row = db.prepare(`SELECT * FROM client_error_logs WHERE id = ? LIMIT 1`).get(normalizedLogId)
    return mapClientErrorLogRow(row)
  })
}

export async function buildAdminOverview() {
  const store = await readStore()
  const users = store.users
    .slice()
    .sort((left, right) => String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')))
    .map(normalizeAdminUserSummary)
  const logs = await listClientErrorLogs({ limit: 30 })
  const activeMembershipCount = users.filter((item) => item.membership_active).length
  return {
    stats: {
      total_users: users.length,
      active_memberships: activeMembershipCount,
      pending_error_logs: logs.filter((item) => item.review_status === 'pending').length,
      total_error_logs: logs.length,
    },
    charts: {
      users_by_day: buildDaySeries(users.map((item) => item.created_at)),
      error_logs_by_day: buildDaySeries(logs.map((item) => item.created_at)),
    },
    users,
    error_logs: logs,
  }
}

export async function syncAdminMembershipGrantForUser(userId, {
  plan = '',
  active = true,
} = {}) {
  const normalizedUserId = normalizeText(userId)
  const normalizedPlan = normalizeText(plan).toLowerCase()
  const now = nowIso()
  const expiresAt = normalizedPlan === 'lifetime'
    ? ADMIN_LIFETIME_EXPIRES_AT
    : normalizedPlan === 'monthly'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : ''

  const updatedUserId = await updateStore(async (data) => {
    const targetUser = data.users.find((item) => String(item.id) === normalizedUserId)
    if (!targetUser) {
      throw new Error('找不到使用者')
    }
    syncMembershipGrantBySource(targetUser, ADMIN_MEMBERSHIP_SOURCE, {
      active: Boolean(active) && Boolean(expiresAt),
      startAt: now,
      endAt: expiresAt,
      meta: {
        plan: normalizedPlan || 'free',
      },
    })
    return targetUser.id
  })

  const nextStore = await readStore()
  const nextUser = nextStore.users.find((item) => String(item.id) === String(updatedUserId))
  if (!nextUser) {
    throw new Error('找不到使用者')
  }
  return normalizeAdminUserSummary(nextUser)
}

export async function deleteUserAccountByAdmin(userId) {
  const normalizedUserId = normalizeText(userId)
  const nextStore = await updateStore(async (data) => {
    const targetUser = data.users.find((item) => String(item.id) === normalizedUserId)
    if (!targetUser) {
      throw new Error('找不到使用者')
    }
    const targetEmail = normalizeText(targetUser.email).toLowerCase()
    const now = nowIso()

    data.users = data.users.filter((item) => String(item.id) !== normalizedUserId)
    data.referrals = (data.referrals ?? []).filter((item) => (
      String(item.inviter_user_id) !== normalizedUserId && String(item.invitee_user_id) !== normalizedUserId
    ))
    data.shared_ledgers = (data.shared_ledgers ?? [])
      .filter((item) => String(item.owner_user_id) !== normalizedUserId)
      .map((item) => {
        const nextMembers = Array.isArray(item.members)
          ? item.members.filter((member) => String(member.user_id) !== normalizedUserId)
          : []
        const nextInvitations = Array.isArray(item.invitations)
          ? item.invitations.filter((invitation) => normalizeText(invitation.email).toLowerCase() !== targetEmail)
          : []
        if (nextMembers.length === (item.members ?? []).length && nextInvitations.length === (item.invitations ?? []).length) {
          return item
        }
        return {
          ...item,
          members: nextMembers,
          invitations: nextInvitations,
          updated_at: now,
          updated_by_user_id: normalizeText(item.owner_user_id || item.updated_by_user_id),
        }
      })

    return {
      deletedUserId: normalizedUserId,
      deletedUserEmail: targetEmail,
    }
  })

  await ensureAdminDatabaseReady()
  await runSerializedDatabaseWrite((db) => {
    ensureAdminSchema(db)
    db.prepare(`DELETE FROM user_auth_providers WHERE user_id = ?`).run(normalizedUserId)
    db.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).run(normalizedUserId)
    db.prepare(`DELETE FROM auth_audit_logs WHERE user_id = ?`).run(normalizedUserId)
    db.prepare(`
      UPDATE client_error_logs
      SET user_id = ''
      WHERE user_id = ?
    `).run(normalizedUserId)
    return true
  })

  return nextStore
}
