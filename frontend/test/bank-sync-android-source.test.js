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

test('first bank automation enforces captcha ocr confidence threshold and portal contract anchors', () => {
  assert.match(firstBankAutomationSource, /CAPTCHA_MIN_CONFIDENCE/)
  assert.match(firstBankAutomationSource, /buildFramePortalContractProbeScript/)
  assert.match(firstBankAutomationSource, /ensureFramePortalContract/)
  assert.match(firstBankAutomationSource, /我的帳戶/)
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
