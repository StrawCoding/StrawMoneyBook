export function createStoreAuthAuditApi({
  createId,
  createOpaqueToken,
  createStoreError,
  hashSensitiveToken,
  nowIso,
  runSerializedDatabaseWrite,
  authNonceTtlMs,
} = {}) {
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
      const expiresAt = new Date(Date.now() + authNonceTtlMs).toISOString()
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

  return {
    consumeAuthNonce,
    createAuthNonce,
    writeAuthAuditLog,
  }
}
