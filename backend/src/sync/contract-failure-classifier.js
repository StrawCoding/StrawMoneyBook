export const FAILURE_CODES = ['portal_changed', 'captcha', 'auth', 'timeout', 'unknown']

function normalizeText(value) {
  return String(value ?? '').trim()
}

function matchTimeout(text) {
  return /timeout|timed out|ETIMEDOUT|AbortError/i.test(normalizeText(text))
}

function matchAuth(text, status) {
  const blob = normalizeText(text)
  if ([401, 403].includes(Number(status))) return true
  return /forbidden|unauthorized|403|401|auth/i.test(blob)
}

export function classifyEinvoiceContractFailure(result) {
  if (result?.ok) return null

  const captchaCheck = result?.captchaCheck ?? {}
  const selectorCheck = result?.selectorCheck ?? {}
  const errorText = normalizeText(result?.error ?? selectorCheck?.error ?? captchaCheck?.error)

  if (matchTimeout(errorText)) return 'timeout'
  if (matchAuth(errorText, captchaCheck?.status)) return 'auth'

  if (!captchaCheck.ok) {
    if (!captchaCheck.hasToken || !captchaCheck.hasImage) return 'captcha'
    if (matchAuth('', captchaCheck.status)) return 'auth'
    return 'captcha'
  }

  if (!selectorCheck.ok) {
    if (selectorCheck.cloudflareChallenge) return 'timeout'
    if (matchTimeout(selectorCheck.error)) return 'timeout'
    return 'portal_changed'
  }

  return 'unknown'
}

export function classifyBankContractFailure(result) {
  if (result?.ok) return null

  const errorText = normalizeText(result?.error)
  if (matchTimeout(errorText)) return 'timeout'
  if (matchAuth(errorText, result?.status)) return 'auth'

  const anchors = result?.anchors ?? {}
  const required = ['loginForm', 'codeVerify', 'captchaLoginArea', 'vrfyCode']
  const missingAnchor = required.some((key) => anchors[key] === false)
  if (missingAnchor) return 'portal_changed'
  const frame = result?.frame ?? {}
  if (frame.ok === false) return 'portal_changed'
  if (frame.ok && frame.hasStructuralAnchor === false && frame.hasTextFallback === false) return 'portal_changed'
  if (result?.mobileHint && !anchors.loginForm) return 'portal_changed'

  if (result?.captchaFetch?.ok === false) return 'captcha'

  return 'unknown'
}

export function attachFailureCode(target, result, classifier) {
  const failureCode = classifier(result)
  return {
    target,
    ok: Boolean(result?.ok),
    failureCode,
    result,
  }
}
