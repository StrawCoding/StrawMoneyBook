import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const googleSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/google-backup.service.js'),
  'utf8',
)
const webdavSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/webdav-backup.service.js'),
  'utf8',
)
const settingsSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAutoBackupPage.vue'),
  'utf8',
)
const googleAuthSource = readFileSync(
  resolve(import.meta.dirname, '../src/services/einvoice/auth.js'),
  'utf8',
)

test('auto backup services persist auto-check diagnostics for skip, success, and error states', () => {
  assert.match(googleSource, /lastAutoCheckAt: ''/)
  assert.match(googleSource, /lastAutoCheckStatus: 'idle'/)
  assert.match(googleSource, /lastAutoCheckReason: ''/)
  assert.match(googleSource, /lastAutoCheckStatus: 'skipped'/)
  assert.match(googleSource, /lastAutoCheckStatus: 'ok'/)
  assert.match(googleSource, /lastAutoCheckStatus: 'error'/)
  assert.match(googleSource, /resolveGoogleAutoBackupSkipReason/)
  assert.match(googleSource, /lastAutoCheckReason: 'platform_unsupported'/)

  assert.match(webdavSource, /lastAutoCheckAt: ''/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'idle'/)
  assert.match(webdavSource, /lastAutoCheckReason: ''/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'skipped'/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'ok'/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'error'/)
  assert.match(webdavSource, /resolveWebdavAutoBackupSkipReason/)
})

test('google backup reconnect patch restores connection state without resetting auto-check diagnostics (SMB-156)', () => {
  // buildRecoveredGoogleBackupPatch is used when Google silently or interactively reconnects.
  // It must NOT reset lastAutoCheckAt/Status/Reason — those are written by the auto backup runner
  // and must survive reconnection so the UI shows the last actual detection result.
  // Only disconnectGoogleBackup explicitly clears auto-check fields (intentional reset).
  assert.match(googleSource, /function buildRecoveredGoogleBackupPatch\(patch = \{\}\)/)
  assert.match(googleSource, /buildRecoveredGoogleBackupPatch\(profilePatch\)/)
  assert.match(googleSource, /buildRecoveredGoogleBackupPatch\(\)/)
  assert.match(googleSource, /return saveState\(ledgerId, buildRecoveredGoogleBackupPatch\(\{/)

  // Extract just the function body to verify it does not reset auto-check fields
  const fnMatch = googleSource.match(/function buildRecoveredGoogleBackupPatch[\s\S]*?\n  \}/)
  const fnBody = fnMatch ? fnMatch[0] : ''
  assert.ok(!fnBody.includes('lastAutoCheckAt'), 'buildRecoveredGoogleBackupPatch must not reset lastAutoCheckAt')
  assert.ok(!fnBody.includes('lastAutoCheckStatus'), 'buildRecoveredGoogleBackupPatch must not reset lastAutoCheckStatus')
  assert.ok(!fnBody.includes('lastAutoCheckReason'), 'buildRecoveredGoogleBackupPatch must not reset lastAutoCheckReason')
})

test('manual Google reconnect clears stale reauth diagnostics after successful sign-in (SMB-186)', () => {
  // Regression: after the user explicitly signs in again from the auto-backup
  // settings page, the connection is recovered but the old reauth_required
  // auto-check reason must not keep showing as if reauthorization were still needed.
  // Silent recovery still uses buildRecoveredGoogleBackupPatch directly and keeps
  // the SMB-156 behavior above.
  assert.match(googleSource, /function buildManualGoogleConnectPatch\(state, profile\) \{/)
  assert.match(googleSource, /if \(state\?\.lastAutoCheckReason === 'reauth_required'\) \{/)
  assert.match(googleSource, /patch\.lastAutoCheckAt = ''/)
  assert.match(googleSource, /patch\.lastAutoCheckStatus = 'idle'/)
  assert.match(googleSource, /patch\.lastAutoCheckReason = ''/)
  assert.match(googleSource, /return saveState\(ledgerId, buildManualGoogleConnectPatch\(current, profile\)\)/)
})

test('auto backup settings page shows the latest auto-check reason and time', () => {
  assert.match(settingsSource, /settings_auto_backup\.status\.auto_check/)
  assert.match(settingsSource, /settings_auto_backup\.status\.last_check/)
  assert.match(settingsSource, /function describeAutoBackupCheck\(state\)/)
  assert.match(settingsSource, /googleBackupState\.lastAutoCheckAt/)
  assert.match(settingsSource, /webdavBackupState\.lastAutoCheckAt/)
  assert.match(settingsSource, /describeAutoBackupCheck\(googleBackupState\)/)
  assert.match(settingsSource, /describeAutoBackupCheck\(webdavBackupState\)/)
  assert.match(settingsSource, /settings_auto_backup\.auto_check\.platform_unsupported/)
})

test('google auto backup surfaces auth failure as error instead of skip when backup is configured (SMB-110)', () => {
  // Regression: when Google auth expires and the user has backup configured (autoEnabled or accountEmail),
  // the service must write lastAutoCheckStatus: 'error' + lastAutoCheckReason: 'reauth_required'
  // so that the UI reauth warning is shown.  Previously it silently wrote 'skipped'/'not_connected'.
  assert.match(googleSource, /isAuthFailure/, 'must have isAuthFailure detection')
  assert.match(googleSource, /reauth_required/, 'must surface reauth_required as the error reason')
  assert.match(
    googleSource,
    /lastAutoCheckStatus: isAuthFailure \? 'error' : 'skipped'/,
    'must write error status when auth failure detected in runGoogleAutoBackupIfDue',
  )
  assert.match(
    googleSource,
    /lastAutoCheckReason: isAuthFailure \? 'reauth_required' : skipReason/,
    'must write reauth_required reason when auth failure detected',
  )
  // Ensure the pattern also applies to the data-change path
  const authFailureMatches = [...googleSource.matchAll(/isAuthFailure \? 'error' : 'skipped'/g)]
  assert.ok(authFailureMatches.length >= 2, 'both runGoogleAutoBackupIfDue and runGoogleAutoBackupOnDataChange must detect auth failures')
})

test('google auto backup sets connected:false when performGoogleBackup throws GOOGLE_REAUTH_REQUIRED (SMB-182)', () => {
  // Regression: after migration restore (v1.0.23), devices with valid-looking connected:true but
  // expired auth would attempt backup, hit GOOGLE_REAUTH_REQUIRED in performGoogleBackup, and only
  // persist lastAutoCheckReason:'reauth_required' WITHOUT resetting connected:false.  On the next
  // auto-check cycle the same connected:true state caused another backup attempt (skip path skips
  // only when connected=false), producing an infinite reauth loop until manual intervention.
  // Fix: when isReauth=true in catch, also save connected:false so the next cycle's skip-path
  // isAuthFailure detection fires instead of re-attempting backup.
  const reauthConnectedPatch = googleSource.match(
    /isReauth \? 'reauth_required' : 'backup_failed',\s*\.\.\.\(isReauth \? \{ connected: false \} : \{\}\)/,
  )
  assert.ok(
    reauthConnectedPatch !== null,
    'runGoogleAutoBackupIfDue must set connected:false when GOOGLE_REAUTH_REQUIRED is caught',
  )
  const dataChangeRauthConnectedPatch = googleSource.match(
    /isReauth \? 'reauth_required' : 'backup_failed',\s*\.\.\.\(isReauth \? \{ connected: false \} : \{\}\)/g,
  )
  assert.ok(
    Array.isArray(dataChangeRauthConnectedPatch) && dataChangeRauthConnectedPatch.length >= 2,
    'both runGoogleAutoBackupIfDue and runGoogleAutoBackupOnDataChange must set connected:false on reauth error',
  )
})

test('google connect profile resolver always triggers interactive sign-in when silent token fails (SMB-186)', () => {
  // Regression: resolveGoogleProfileForConnect previously skipped googleSignIn when the
  // profile was cached but the access token was expired. This caused autoConnectGoogleBackup
  // to save connected:true without a valid token, making the very next backup attempt fail
  // again with reauth_required — a silent reconnect that did not actually reconnect.
  // Fix: whenever silent token retrieval fails (!reusedSession), always call googleSignIn
  // regardless of whether a cached profile exists.
  assert.match(googleSource, /async function resolveGoogleProfileForConnect/, 'function must exist')
  assert.doesNotMatch(
    googleSource,
    /!profile\.email && !profile\.name && !profile\.imageUrl && !reusedSession/,
    'must NOT gate googleSignIn on profile being empty — cached profile is not a valid session',
  )
  assert.match(
    googleSource,
    /if \(!reusedSession\) \{\n.*googleSignIn/s,
    'must trigger googleSignIn whenever reusedSession is false',
  )
})

test('server auth code flow uses API host, not static privacy-policy host (SMB-192)', () => {
  // Regression: SMB-186 derived the OAuth API origin from VITE_PRIVACY_POLICY_URL, which points
  // at the static website host. Production POSTs to /api/google/oauth/* on that host return 405,
  // so Google backup login could not complete correctly after the release. The native app must
  // target the real API host by default and route OAuth exchange/refresh through backend routes.
  const fnMatch = googleAuthSource.match(/function resolveServerAuthCodeFlowEnabled[\s\S]*?\n\}/)
  assert.ok(fnMatch, 'resolveServerAuthCodeFlowEnabled must exist in auth source')
  assert.doesNotMatch(
    fnMatch[0],
    /resolveGoogleOAuthApiOrigin\(\)/,
    'must not treat a privacy-policy/static-site derived origin as proof that OAuth backend exists',
  )
  assert.match(
    googleAuthSource,
    /const GOOGLE_OAUTH_DEFAULT_ORIGIN = 'https:\/\/api\.strawmb\.com'/,
    'native default OAuth origin must be the API host, not www.strawmb.com',
  )
})

test('server auth code flow enabled on native via default origin without explicit env vars (SMB-213)', () => {
  // Regression: v1.2.12 removed the isAbsoluteHttpUrl(resolveGoogleOAuthApiOrigin()) check to fix the
  // 405 issue (resolveGoogleOAuthApiOrigin previously derived origin from VITE_PRIVACY_POLICY_URL which
  // pointed at the static site). But it was not replaced with a check on GOOGLE_OAUTH_DEFAULT_ORIGIN,
  // so on native platforms without explicit VITE_GOOGLE_OAUTH_API_ORIGIN / exchange / refresh env vars,
  // resolveServerAuthCodeFlowEnabled() always falls back to online mode (short-lived access tokens).
  // Fix: when explicit env vars are not set, use isAbsoluteHttpUrl(GOOGLE_OAUTH_DEFAULT_ORIGIN) as the
  // fallback so that server auth code flow (refresh tokens) is enabled on native out of the box.
  const fnMatch = googleAuthSource.match(/function resolveServerAuthCodeFlowEnabled[\s\S]*?\n\}/)
  assert.ok(fnMatch, 'resolveServerAuthCodeFlowEnabled must exist in auth source')
  assert.match(
    fnMatch[0],
    /isAbsoluteHttpUrl\(GOOGLE_OAUTH_DEFAULT_ORIGIN\)/,
    'must check GOOGLE_OAUTH_DEFAULT_ORIGIN as a fallback so native platforms use server auth code flow without explicit env vars',
  )
  assert.doesNotMatch(
    fnMatch[0],
    /resolveGoogleOAuthApiOrigin\(\)/,
    'must not call resolveGoogleOAuthApiOrigin() inside resolveServerAuthCodeFlowEnabled — that would re-introduce the static-site 405 regression',
  )
})

test('google backup sign-in adapts UI style based on auth mode to avoid Credential Manager incompatibility (SMB-191, SMB-213)', () => {
  // SMB-191: The SocialLogin plugin only performs its NoCredentialException fallback path when the
  // initial request is sent through style:"bottom"; without it users can get a terminal
  // "Google Sign-In failed" in online mode and cannot complete the auto-backup login.
  // SMB-213 Restart: Credential Manager (style:"bottom") is incompatible with server auth code
  // flow (mode:"offline") on Android — it cannot return a serverAuthCode, causing a silent
  // fallback loop that leaves the user stuck in the "logging in" state for up to 150 seconds.
  // Fix: use style:"standard" when isServerAuthCodeModeActive() so the traditional Google Sign-In
  // dialog is used for offline mode, which reliably returns serverAuthCode.  Online mode still uses
  // style:"bottom" for the NoCredentialException graceful fallback.
  assert.match(googleAuthSource, /isServerAuthCodeModeActive\(\) \? 'standard' : 'bottom'/, 'first login style must use ternary: standard for offline/server-auth-code mode, bottom for online mode')
  assert.match(
    googleAuthSource,
    /loginGoogleWithOptions\(\{[\s\S]*?filterByAuthorizedAccounts: false,[\s\S]*?style: isServerAuthCodeModeActive\(\) \? 'standard' : 'bottom',[\s\S]*?preferredEmail: options\.preferredEmail,[\s\S]*?\}\)/,
    'first login attempt must use standard for offline/server-auth-code mode and bottom for online mode',
  )
  assert.match(
    googleAuthSource,
    /forcePrompt: true,[\s\S]*?style: 'standard'/,
    'retry after stale auth state should still force the standard prompt',
  )
})

test('Android MainActivity forwards Google offline authorization results to SocialLogin plugin (SMB-213 Restart)', () => {
  // Root cause for the latest "still cannot login" report: offline/server-auth-code login can launch
  // a Google authorization PendingIntent after account selection. The Capgo SocialLogin plugin stores
  // that PendingIntent future internally, but its normal handleOnActivityResult path does not dispatch
  // Google request codes. MainActivity must explicitly forward GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_*
  // results to SocialLoginPlugin.handleGoogleLoginIntent; otherwise the JS login promise waits until
  // the 120s timeout and the UI appears stuck on "登入中".
  const mainActivitySource = readFileSync(
    resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/MainActivity.java'),
    'utf8',
  )

  assert.match(mainActivitySource, /import android\.content\.Intent;/)
  assert.match(mainActivitySource, /import com\.getcapacitor\.PluginHandle;/)
  assert.match(mainActivitySource, /import ee\.forgr\.capacitor\.social\.login\.GoogleProvider;/)
  assert.match(mainActivitySource, /import ee\.forgr\.capacitor\.social\.login\.SocialLoginPlugin;/)
  assert.match(mainActivitySource, /protected void onActivityResult\(int requestCode, int resultCode, Intent data\)/)
  assert.match(mainActivitySource, /GoogleProvider\.REQUEST_AUTHORIZE_GOOGLE_MIN/)
  assert.match(mainActivitySource, /GoogleProvider\.REQUEST_AUTHORIZE_GOOGLE_MAX/)
  assert.match(mainActivitySource, /getBridge\(\)\.getPlugin\("SocialLogin"\)/)
  assert.match(mainActivitySource, /handleGoogleLoginIntent\(requestCode, data\)/)
})

test('google auto backup reconnect must require a fresh refresh token and must not downgrade to online mode (SMB-213 Restart)', () => {
  // Regression: after a background auto backup wrote reauth_required, a manual reconnect could complete
  // with only a short-lived access token if the offline exchange did not return a fresh refresh_token.
  // That saved connected:true, cleared the warning, and the next automatic backup immediately paused
  // with reauth_required again. Auto backup/reconnect must require persistent auth instead of silently
  // carrying a stale cached refresh token or downgrading to online mode.
  assert.match(
    googleSource,
    /googleSignIn\(\{[\s\S]*?preferredEmail: normalizedPreferredEmail \|\| preferredEmail,[\s\S]*?requireRefreshToken: true,[\s\S]*?\}\)/,
    'connectGoogleBackup must request a persistent refresh token during manual reconnect',
  )
  assert.match(
    googleSource,
    /getAccessToken\(\{[\s\S]*?interactive: interactiveAuth,[\s\S]*?requireRefreshToken: true,[\s\S]*?\}\)/,
    'manual backup/restore must require persistent Google auth when reauthorizing',
  )
  assert.match(
    googleAuthSource,
    /if \(requireRefreshToken && !exchanged\.refreshToken\) \{[\s\S]*?GOOGLE_REFRESH_TOKEN_REQUIRED_MESSAGE[\s\S]*?\}/,
    'offline sign-in must reject when Google exchange does not return a fresh refresh token',
  )
  assert.match(
    googleAuthSource,
    /if \(requireRefreshToken\) \{\n\s*throw normalizeGoogleAuthError\(offlineError\)\n\s*\}/,
    'persistent auth requests must not fallback to online mode after offline exchange failure',
  )
  assert.match(
    googleAuthSource,
    /function ensureServerAuthCodeModeForRefreshToken\(\) \{[\s\S]*?runtimeGoogleModeOverride === 'online'[\s\S]*?runtimeGoogleModeOverride = ''[\s\S]*?clearTokenCache\(\)[\s\S]*?\}/,
    'refresh-token-required flows must reset runtime online fallback instead of accepting online mode',
  )
  assert.match(
    googleAuthSource,
    /if \(hasUsableCachedAccessToken\(\) && \(!requireRefreshToken \|\| cachedRefreshToken\)\) return cachedAccessToken/,
    'refresh-token-required flows must not accept a cached access token unless a refresh token also exists',
  )
  assert.match(
    googleSource,
    /await getAccessToken\(\{\n\s*interactive: false,\n\s*requireRefreshToken: true,\n\s*\}\)/,
    'connect profile resolver must not silently reuse access-token-only sessions',
  )
  assert.match(
    googleAuthSource,
    /refresh-token sign-in cannot reuse an online-only sign-in promise/,
    'refresh-token-required sign-in must not share an ongoing online-only login promise',
  )
})
