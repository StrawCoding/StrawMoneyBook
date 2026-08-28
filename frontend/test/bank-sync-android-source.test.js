import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const bankAutomationActivitySource = readFileSync(
  resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/BankAutomationActivity.java'),
  'utf8',
)

const firstBankAutomationSource = readFileSync(
  resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/FirstBankAutomation.java'),
  'utf8',
)

const huaNanBankAutomationSource = readFileSync(
  resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/HuaNanBankAutomation.java'),
  'utf8',
)

test('bank automation activity forces desktop viewport for first bank webview', () => {
  assert.match(bankAutomationActivitySource, /DESKTOP_VIEWPORT_WIDTH = 1280/)
  assert.match(bankAutomationActivitySource, /setLoadWithOverviewMode\(false\)/)
  assert.match(bankAutomationActivitySource, /setInitialScale\(100\)/)
  assert.match(bankAutomationActivitySource, /Windows NT 10\.0; Win64; x64/)
})

test('first bank automation validates desktop login page and improves captcha capture', () => {
  assert.match(firstBankAutomationSource, /buildEnsureDesktopViewportScript/)
  assert.match(firstBankAutomationSource, /buildDesktopLoginPageProbeScript/)
  assert.match(firstBankAutomationSource, /ensureDesktopLoginPage/)
  assert.match(firstBankAutomationSource, /first_bank_login_page_mismatch/)
  assert.match(firstBankAutomationSource, /fetchCaptchaImageDataUrl/)
})

test('first bank automation intercepts transaction json before dom fallback', () => {
  assert.match(firstBankAutomationSource, /shouldInterceptRequest/)
  assert.match(firstBankAutomationSource, /clearTransactionInterceptBuffer/)
  assert.match(firstBankAutomationSource, /parseTransactionsFromInterceptedJson/)
  assert.match(firstBankAutomationSource, /table\.CnbTable/)
})

test('SMB-266 first bank transaction intercept never replays POST without request body', () => {
  assert.match(firstBankAutomationSource, /shouldReplayTransactionInterceptRequest/)
  assert.match(firstBankAutomationSource, /"GET"\.equalsIgnoreCase\(normalized\)/)
  assert.match(firstBankAutomationSource, /if \(!shouldReplayTransactionInterceptRequest\(method\)\) \{\s*return null;\s*\}/s)
  assert.doesNotMatch(firstBankAutomationSource, /setDoOutput\(true\)/)
})

test('first bank automation enforces captcha ocr confidence threshold and portal contract anchors', () => {
  assert.match(firstBankAutomationSource, /CAPTCHA_MIN_CONFIDENCE/)
  assert.match(firstBankAutomationSource, /buildFramePortalContractProbeScript/)
  assert.match(firstBankAutomationSource, /ensureFramePortalContract/)
  assert.match(firstBankAutomationSource, /hasMyAccountsStructuralAnchor/)
  assert.match(firstBankAutomationSource, /hasMyAccountsTextFallback/)
  assert.match(firstBankAutomationSource, /My Accounts/)
})

test('SMB-266 first bank my accounts navigation uses structural anchors before zh-TW text fallback', () => {
  assert.match(firstBankAutomationSource, /findMyAccountsCandidate/)
  assert.match(firstBankAutomationSource, /typeof win\.openIt === 'function'/)
  assert.match(firstBankAutomationSource, /overview-account/)
  assert.match(firstBankAutomationSource, /table\.CnbTable/)
  assert.match(firstBankAutomationSource, /我的帳戶\|帳戶總覽\|My Accounts\|Account Overview/)
})

test('SMB-252 Restart submit fills hidden real login fields and surfaces real bank response', () => {
  // 治本：doLogin() 讀的是 type=hidden 的 #loginCustId 真值欄位（#loginCustIdFake 僅可見代理）。
  assert.match(firstBankAutomationSource, /setFieldByName\('loginCustId', nationalId\)/)
  assert.match(firstBankAutomationSource, /setFieldByName\('usrId', userCode\)/)
  assert.match(firstBankAutomationSource, /setFieldByName\('pwd', password\)/)
  assert.match(firstBankAutomationSource, /setFieldByName\('vrfyCode', captcha\)/)
  // 攔截銀行端 alert() 以避免阻塞並保留診斷文字。
  assert.match(firstBankAutomationSource, /__bankAutoAlerts/)
  // 送出改成偵測實際存在的登入函式（clickArea→doLogin），不再假設只有 clickArea。
  assert.match(firstBankAutomationSource, /target\.win\.doLogin/)
  // 失敗時攤開銀行真實回應，取代籠統的「停在登入頁」訊息。
  assert.match(firstBankAutomationSource, /buildLoginResponseDiagnosticsScript/)
  assert.match(firstBankAutomationSource, /captureLoginResponseDiagnostics/)
  assert.match(firstBankAutomationSource, /summarizeLoginFailure/)
  assert.doesNotMatch(firstBankAutomationSource, /Login response still stayed on login page/)
})

test('SMB-252 desktop login readiness depends only on functional anchors, not mobileHint text', () => {
  // 治本：ready 只依功能錨點；不得再因頁面文字提及 Mobile Bank 而誤判為手機版攔阻。
  assert.match(
    firstBankAutomationSource,
    /const ready = hasLoginForm && hasCaptchaImage && hasCaptchaLoginArea && hasVrfyCode;/,
  )
  assert.doesNotMatch(firstBankAutomationSource, /&& !mobileHint/)
  // mobileHint 不得再用「Mobile Bank / 行動銀行」等頁面文字推斷（會誤判電腦版登入頁）。
  assert.doesNotMatch(firstBankAutomationSource, /手機版\|行動版\|行動銀行\|mobile/)
  // mobileHint 改為依版面結構（行動版 viewport 標記）的非攔阻診斷欄位。
  assert.match(firstBankAutomationSource, /hasMobileViewport/)
})

test('Phase 0A/0B v1.1.1 lastSyncAt dual-key precedence and mandatory lookback', () => {
  assert.match(firstBankAutomationSource, /static String readLastSyncWatermark\(JSONObject payload\)/)
  assert.match(firstBankAutomationSource, /optString\("lastSyncAt"\)/)
  assert.match(firstBankAutomationSource, /optString\("last_sync_at"\)/)
  // Canonical camel must be preferred when non-empty (precedence contract).
  assert.match(
    firstBankAutomationSource,
    /if \(!canonical\.isEmpty\(\)\) return canonical;[\s\S]*return normalizeText\(payload\.optString\("last_sync_at"\)\);/,
  )
  assert.match(firstBankAutomationSource, /static int readLookbackDays\(JSONObject payload\)/)
  assert.match(firstBankAutomationSource, /static LocalDate resolveQueryStartDate\(/)
  assert.match(firstBankAutomationSource, /coveredThrough\.minusDays\(safeLookback\)/)
  // sync() must use watermark + lookback helpers (not camel-only lastSyncAt).
  assert.match(firstBankAutomationSource, /readLastSyncWatermark\(payload\)/)
  assert.match(firstBankAutomationSource, /readLookbackDays\(payload\)/)
  assert.match(firstBankAutomationSource, /resolveQueryStartDate\(initialSyncStartDate, accountWatermark, cursor, lookbackDays\)/)
})

test('Architecture B: multi-provider dispatch + accountResults partial success', () => {
  assert.match(bankAutomationActivitySource, /ACTION_CONNECT_BANK/)
  assert.match(bankAutomationActivitySource, /dispatchByProvider/)
  assert.match(bankAutomationActivitySource, /hua_nan_bank_tw/)
  assert.match(firstBankAutomationSource, /accountResults/)
  assert.match(firstBankAutomationSource, /partial_success|sync_status/)
  assert.match(firstBankAutomationSource, /BankAutomationSyncContract/)
})

test('bank automation debug trace prints each step to logcat in debug builds', () => {
  const debugTraceSource = readFileSync(
    resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/BankAutomationDebugTrace.java'),
    'utf8',
  )
  assert.match(debugTraceSource, /SMB-BankSync/)
  assert.match(debugTraceSource, /Log\.d\(TAG/)
  assert.doesNotMatch(debugTraceSource, /BuildConfig/)
  assert.match(debugTraceSource, /h1_probe/)
  assert.match(debugTraceSource, /h2_probe/)
  assert.match(debugTraceSource, /hua_nan_transaction_page_timeout/)
})

test('Hua Nan Phase A records masked H1/H2 probes and observe-only intercept', () => {
  assert.match(huaNanBankAutomationSource, /h1_probe/)
  assert.match(huaNanBankAutomationSource, /h2_probe/)
  assert.match(huaNanBankAutomationSource, /shouldInterceptRequest/)
  assert.match(huaNanBankAutomationSource, /shouldReplayTransactionInterceptRequest/)
  assert.match(huaNanBankAutomationSource, /observe_only_no_replay/)
  assert.match(huaNanBankAutomationSource, /post_without_body/)
  assert.match(huaNanBankAutomationSource, /inquiry_not_found/)
  assert.match(huaNanBankAutomationSource, /query_timeout/)
  assert.match(huaNanBankAutomationSource, /page_not_ready/)
  assert.match(huaNanBankAutomationSource, /maskAccountId/)
  assert.match(huaNanBankAutomationSource, /static boolean shouldReplayTransactionInterceptRequest/)
  assert.match(
    huaNanBankAutomationSource,
    /static boolean shouldReplayTransactionInterceptRequest\(String method\) \{\s*return false;\s*\}/s,
  )
  assert.doesNotMatch(huaNanBankAutomationSource, /setDoOutput\(true\)/)
  assert.match(huaNanBankAutomationSource, /if \(!shouldReplayTransactionInterceptRequest\(method\)\)/)
})
