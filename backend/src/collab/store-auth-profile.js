export function createStoreAuthProfileApi({
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
} = {}) {
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
      is_admin: isAdminUser(user),
      created_at: user.created_at,
    }
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
    const normalized = normalizeEmail(email)
    if (!normalized) return null
    const row = db.prepare(`
      SELECT ${getUserSelectSql('u')}
      FROM users u
      WHERE u.email = ?
      LIMIT 1
    `).get(normalized)
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

    const normalizedProviderEmail = normalizeEmail(providerEmail)
    const normalizedProviderDisplayName = normalizeDisplayName(displayName, normalizedProviderEmail)
    const normalizedProviderAvatarUrl = normalizeAvatarUrl(avatarUrl)
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
        normalizedProviderEmail,
        emailVerified ? 1 : 0,
        normalizedProviderDisplayName,
        normalizedProviderAvatarUrl,
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
      provider_email: normalizedProviderEmail,
      email_verified: emailVerified ? 1 : 0,
      provider_display_name: normalizedProviderDisplayName,
      provider_avatar_url: normalizedProviderAvatarUrl,
      linked_at: linkedAt,
      last_login_at: lastLoginAt,
      created_at: now,
      updated_at: now,
    })
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
        const normalized = validateEmail(email)
        if (findUserRowByEmail(db, normalized)) {
          throw createStoreError('此 Email 已存在，請先登入後再綁定 Google', 'existing_account_link_required', 409)
        }

        const now = nowIso()
        const storeSnapshot = loadStoreFromDatabase(db)
        const user = normalizeUserRecord({
          id: createId('user'),
          email: normalized,
          account: normalized,
          email_verified: Boolean(emailVerified),
          display_name: normalizeDisplayName(displayName, normalized),
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
          providerEmail: normalized,
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

  return {
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
  }
}
