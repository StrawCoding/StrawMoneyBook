/**
 * UI 層 Invoice Carrier Service
 * 負責與後端 API 通訊
 */

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

async function handleApiResponse(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || `API error: ${response.status}`)
  }
  return response.json()
}

export async function createLinkSession() {
  const response = await fetch('/api/invoice/link_session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return handleApiResponse(response)
}

export async function exchangeAuth(sessionId, mobilePhone, password, captchaCode) {
  const response = await fetch('/api/invoice/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      mobile_phone: mobilePhone,
      password: password,
      captcha_code: captchaCode,
    }),
  })
  return handleApiResponse(response)
}

export async function syncConnection(sessionId, connectionId, opts = {}) {
  const response = await fetch('/api/invoice/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      connection_id: connectionId,
      start_date: opts.startDate,
      end_date: opts.endDate,
      carrier_code: opts.carrierCode,
    }),
  })
  return handleApiResponse(response)
}

export async function disconnectConnection(sessionId) {
  const response = await fetch('/api/invoice/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  return handleApiResponse(response)
}
