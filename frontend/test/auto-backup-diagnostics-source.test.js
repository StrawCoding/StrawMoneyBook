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

test('google backup sign-in starts with bottom credential UI before standard fallback (SMB-191)', () => {
  // Regression: auto-backup used the plugin default standard Google UI on the first attempt.
  // The SocialLogin plugin only performs its NoCredentialException fallback path when the
  // initial request is explicitly sent through style:"bottom"; otherwise users can get a
  // terminal "Google Sign-In failed" and cannot complete the auto-backup login.
  // Fix: the first interactive login should use bottom UI with unrestricted account filtering,
  // while the stale-account retry remains the explicit standard prompt.
  assert.match(googleAuthSource, /style: 'bottom'/, 'initial Google backup sign-in must request bottom UI')
  assert.match(
    googleAuthSource,
    /loginGoogleWithOptions\(\{[\s\S]*?forceRefreshToken: true,[\s\S]*?filterByAuthorizedAccounts: false,[\s\S]*?style: 'bottom',[\s\S]*?preferredEmail: options\.preferredEmail,[\s\S]*?\}\)/,
    'first login attempt must use bottom UI with filterByAuthorizedAccounts=false',
  )
  assert.match(
    googleAuthSource,
    /forcePrompt: true,[\s\S]*?style: 'standard'/,
    'retry after stale auth state should still force the standard prompt',
  )
})
