/** Default window to accept a just-rotated token as a lost-response retry, not theft. */
export const DEFAULT_REFRESH_ROTATION_GRACE_MS = 60_000

export function getRefreshRotationGraceMs(env = process.env) {
  const raw = Number(env?.SHARED_LEDGER_REFRESH_ROTATION_GRACE_MS ?? DEFAULT_REFRESH_ROTATION_GRACE_MS)
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_REFRESH_ROTATION_GRACE_MS
  return raw
}

export function isWithinRefreshRotationGrace(row, nowMs = Date.now(), env = process.env) {
  const graceMs = getRefreshRotationGraceMs(env)
  if (graceMs <= 0) return false
  const rotatedAtMs = Date.parse(String(row?.revoked_at || row?.updated_at || ''))
  if (!Number.isFinite(rotatedAtMs)) return false
  return nowMs - rotatedAtMs <= graceMs
}

export function createStoreAuthSessionApi({
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
} = {}) {
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

  function getRefreshTokenRowById(db, id) {
    const normalized = String(id ?? '').trim()
    if (!normalized) return null
    return db.prepare(`
      SELECT *
      FROM refresh_tokens
      WHERE id = ?
      LIMIT 1
    `).get(normalized) ?? null
  }

  function findLiveFamilyHead(db, startRow) {
    const seen = new Set()
    let current = startRow
    while (current) {
      const id = String(current.id ?? '').trim()
      if (!id || seen.has(id)) break
      seen.add(id)
      if (!String(current.revoked_at ?? '').trim()) {
        const expiresAtMs = Date.parse(String(current.expires_at ?? ''))
        if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()) {
          return current
        }
        break
      }
      current = getRefreshTokenRowById(db, current.replaced_by_token_id)
    }
    return null
  }

  function rotateLiveRefreshTokenRow(db, liveRow, {
    user,
    ipAddress = '',
    userAgent = '',
  }) {
    const now = nowIso()
    const refresh = createRefreshTokenRow(db, {
      userId: user.id,
      tokenFamilyId: liveRow.token_family_id,
      parentTokenId: liveRow.id,
      issuedByProvider: liveRow.issued_by_provider,
      ipAddress,
      userAgent: userAgent || liveRow.user_agent,
    })

    db.prepare(`
      UPDATE refresh_tokens
      SET replaced_by_token_id = ?,
          revoked_at = ?,
          revoke_reason = 'rotated',
          last_used_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(refresh.refreshTokenId, now, now, now, liveRow.id)

    return {
      user,
      accessToken: issueAccessToken({ ...user, session_family_id: liveRow.token_family_id }),
      refreshToken: refresh.refreshToken,
      refreshTokenExpiresAt: refresh.expiresAt,
      sessionFamilyId: String(liveRow.token_family_id ?? '').trim(),
      expiresInSec: getAccessTokenExpiresInSeconds(),
      refreshExpiresInSec: getRefreshTokenExpiresInSeconds(),
    }
  }

  function rejectRotatedRefreshReuse(db, row) {
    revokeRefreshTokenFamilyRows(db, row.token_family_id, 'reuse_detected')
    return createStoreError('Refresh token 已重複使用，登入狀態已失效', 'refresh_token_reuse_detected', 401)
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
    nowMs = Date.now(),
  } = {}) {
    const refreshTokenHash = hashSensitiveToken(refreshToken)
    return runSerializedDatabaseWrite((db) => {
      // better-sqlite3 rolls back the transaction if the callback throws, so
      // persist family-revoke / expiry writes first, then throw outside.
      let committedError = null
      const session = db.transaction(() => {
        const row = db.prepare(`
          SELECT *
          FROM refresh_tokens
          WHERE token_hash = ?
          LIMIT 1
        `).get(refreshTokenHash)

        if (!row) {
          committedError = createStoreError('Refresh token 無效', 'refresh_token_invalid', 401)
          return null
        }

        if (String(row.revoked_at ?? '').trim()) {
          if (String(row.revoke_reason ?? '').trim() === 'rotated') {
            // Lost HTTP response / timeout retry: walk to the live family head and
            // rotate that, instead of treating the first replay as token theft.
            if (isWithinRefreshRotationGrace(row, nowMs)) {
              const liveHead = findLiveFamilyHead(db, row)
              const user = liveHead ? findUserRowById(db, liveHead.user_id) : null
              if (liveHead && user) {
                return rotateLiveRefreshTokenRow(db, liveHead, {
                  user,
                  ipAddress,
                  userAgent,
                })
              }
            }
            committedError = rejectRotatedRefreshReuse(db, row)
            return null
          }
          committedError = createStoreError('Refresh token 已失效', 'refresh_token_revoked', 401)
          return null
        }

        const expiresAtMs = Date.parse(String(row.expires_at ?? ''))
        if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
          const now = nowIso()
          db.prepare(`
            UPDATE refresh_tokens
            SET revoked_at = ?, revoke_reason = 'expired', updated_at = ?
            WHERE id = ?
          `).run(now, now, row.id)
          committedError = createStoreError('Refresh token 已過期', 'refresh_token_expired', 401)
          return null
        }

        const user = findUserRowById(db, row.user_id)
        if (!user) {
          revokeRefreshTokenFamilyRows(db, row.token_family_id, 'user_missing')
          committedError = createStoreError('登入狀態已失效，請重新登入', 'refresh_user_missing', 401)
          return null
        }

        return rotateLiveRefreshTokenRow(db, row, {
          user,
          ipAddress,
          userAgent,
        })
      })()

      if (committedError) throw committedError
      return session
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

  return {
    createLoginSession,
    createRefreshTokenRow,
    revokeRefreshSession,
    revokeRefreshTokenFamilyRows,
    rotateRefreshSession,
  }
}
