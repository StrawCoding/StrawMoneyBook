import { readFileSync, existsSync } from 'node:fs'
import { GoogleAuth } from 'google-auth-library'

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const DEFAULT_PACKAGE_NAME = 'com.strawcoding.strawmoneybook'
const DEFAULT_SERVICE_ACCOUNT_FILES = Object.freeze([
  '/app/.server-data/play-service-account.json',
  '/opt/1panel/runtime/node/StrawMB/secrets/play-service-account.json',
  '/mnt/data/Data/檔案/專案資料/StrawNFC/secrets/play-service-account.json',
])

let cachedAuthClient = null
let cachedCredentialsFingerprint = ''
let requestClientOverrideForTests = null

function normalizeText(value) {
  return String(value ?? '').trim()
}

export function getGooglePlayPackageName() {
  return normalizeText(process.env.GOOGLE_PLAY_PACKAGE_NAME) || DEFAULT_PACKAGE_NAME
}

function loadServiceAccountCredentials() {
  const inlineJson = normalizeText(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)
  if (inlineJson) {
    return {
      credentials: JSON.parse(inlineJson),
      fingerprint: `json:${inlineJson.length}:${inlineJson.slice(0, 32)}`,
    }
  }

  const configuredPath = normalizeText(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE)
  const candidates = [
    configuredPath,
    ...DEFAULT_SERVICE_ACCOUNT_FILES,
  ].filter(Boolean)

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue
    const raw = readFileSync(filePath, 'utf8')
    return {
      credentials: JSON.parse(raw),
      fingerprint: `file:${filePath}:${raw.length}`,
    }
  }

  return null
}

export function isGooglePlayPublisherConfigured() {
  try {
    const loaded = loadServiceAccountCredentials()
    return Boolean(loaded?.credentials?.client_email && loaded?.credentials?.private_key)
  } catch {
    return false
  }
}

async function getAndroidPublisherAuthClient() {
  if (requestClientOverrideForTests) {
    return requestClientOverrideForTests
  }

  const loaded = loadServiceAccountCredentials()
  if (!loaded?.credentials?.client_email || !loaded?.credentials?.private_key) {
    const error = new Error('Google Play publisher credentials are not configured')
    error.code = 'play_publisher_not_configured'
    error.status = 503
    throw error
  }

  if (cachedAuthClient && cachedCredentialsFingerprint === loaded.fingerprint) {
    return cachedAuthClient
  }

  const auth = new GoogleAuth({
    credentials: loaded.credentials,
    scopes: [ANDROID_PUBLISHER_SCOPE],
  })
  cachedAuthClient = await auth.getClient()
  cachedCredentialsFingerprint = loaded.fingerprint
  return cachedAuthClient
}

function toIsoFromMillis(value) {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms <= 0) return ''
  return new Date(ms).toISOString()
}

/**
 * ART-SEC-03 Phase B — verify purchaseToken with Google Play Developer API.
 * @param {{ productId: string, purchaseToken: string, productType?: 'subs'|'inapp' }} input
 */
export async function verifyGooglePlayPurchase({
  productId,
  purchaseToken,
  productType = 'subs',
  packageName = getGooglePlayPackageName(),
} = {}) {
  const normalizedProductId = normalizeText(productId)
  const normalizedToken = normalizeText(purchaseToken)
  const normalizedType = normalizeText(productType).toLowerCase() === 'inapp' ? 'inapp' : 'subs'
  const normalizedPackage = normalizeText(packageName) || DEFAULT_PACKAGE_NAME

  if (!normalizedProductId || !normalizedToken) {
    const error = new Error('缺少 Google Play productId 或 purchaseToken')
    error.code = 'play_purchase_payload_required'
    error.status = 400
    throw error
  }

  const client = await getAndroidPublisherAuthClient()
  const encodedPackage = encodeURIComponent(normalizedPackage)
  const encodedProduct = encodeURIComponent(normalizedProductId)
  const encodedToken = encodeURIComponent(normalizedToken)
  const url = normalizedType === 'inapp'
    ? `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/purchases/products/${encodedProduct}/tokens/${encodedToken}`
    : `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/purchases/subscriptions/${encodedProduct}/tokens/${encodedToken}`

  const response = await client.request({ url, method: 'GET' })
  const payload = response?.data ?? {}

  if (normalizedType === 'inapp') {
    const purchaseState = Number(payload.purchaseState)
    const active = purchaseState === 0
    return {
      active,
      productType: 'inapp',
      productId: normalizedProductId,
      packageName: normalizedPackage,
      orderId: normalizeText(payload.orderId),
      expiresAt: active ? '2099-12-31T23:59:59.999Z' : '',
      purchaseState,
      raw: payload,
    }
  }

  const expiryIso = toIsoFromMillis(payload.expiryTimeMillis)
  const expiryMs = Date.parse(expiryIso)
  const paymentState = Number(payload.paymentState)
  const cancelReason = payload.cancelReason
  const active = Number.isFinite(expiryMs)
    && expiryMs > Date.now()
    && (Number.isNaN(paymentState) || paymentState === 1 || paymentState === 2)
    && cancelReason !== 1

  return {
    active,
    productType: 'subs',
    productId: normalizedProductId,
    packageName: normalizedPackage,
    orderId: normalizeText(payload.orderId),
    expiresAt: expiryIso,
    paymentState,
    cancelReason,
    raw: payload,
  }
}

/** Test helper: clear cached GoogleAuth client. */
export function resetGooglePlayPublisherAuthCacheForTests() {
  cachedAuthClient = null
  cachedCredentialsFingerprint = ''
  requestClientOverrideForTests = null
}

/** Test helper: inject Android Publisher HTTP client. */
export function setGooglePlayPublisherRequestClientForTests(client = null) {
  requestClientOverrideForTests = client
}
