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

  return {
    createLoginSession,
    createRefreshTokenRow,
    revokeRefreshSession,
    revokeRefreshTokenFamilyRows,
    rotateRefreshSession,
  }
}
