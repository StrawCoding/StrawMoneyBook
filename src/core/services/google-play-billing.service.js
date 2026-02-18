import { Capacitor } from '@capacitor/core'
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases'

export const BILLING_ERROR_CODE = Object.freeze({
  USER_CANCELED: 'USER_CANCELED',
  BILLING_NOT_AVAILABLE: 'BILLING_NOT_AVAILABLE',
  STORE_UNAVAILABLE: 'STORE_UNAVAILABLE',
  PRODUCT_NOT_AVAILABLE: 'PRODUCT_NOT_AVAILABLE',
  ITEM_ALREADY_OWNED: 'ITEM_ALREADY_OWNED',
  UNKNOWN: 'UNKNOWN',
})
const BILLING_TIMEOUT_MS = Object.freeze({
  support: 10000,
  loadProduct: 8000,
  queryOwned: 10000,
  restore: 10000,
  manage: 10000,
  purchase: 120000,
})
const STORE_RETRY_DELAY_MS = 1200
const BILLING_SUPPORT_CACHE_TTL_MS = 60 * 1000
const BILLING_SUPPORT_RETRY_MAX_ATTEMPTS = 3

let billingSupportCache = {
  checkedAt: 0,
  supported: false,
}
let billingConnectionInFlight = null

export const GOOGLE_PLAY_PRODUCTS = Object.freeze({
  monthly: {
    productIdentifier: 'subs_monthly_premium',
    planIdentifier: 'monthly',
    productType: PURCHASE_TYPE.SUBS,
  },
  lifetime: {
    productIdentifier: 'lifetime_unlock',
    productType: PURCHASE_TYPE.INAPP,
  },
})

function createBillingError(code, message, cause = null) {
  const error = new Error(message)
  error.code = code
  if (cause != null) {
    error.cause = cause
  }
  return error
}

function isAndroidNativePlatform() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function toLowerText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizePlan(plan) {
  const normalized = toLowerText(plan)
  if (normalized === 'monthly') return 'monthly'
  if (normalized === 'lifetime') return 'lifetime'
  return ''
}

function normalizeStoreError(error, fallbackMessage = 'Google Play 購買流程發生錯誤') {
  if (error?.code && Object.values(BILLING_ERROR_CODE).includes(error.code)) {
    return error
  }

  const codeText = String(error?.code ?? error?.errorCode ?? '').trim().toUpperCase()
  const raw = toLowerText(error?.message ?? error)

  if (
    codeText.includes('USER_CANCELED') ||
    raw.includes('user canceled') ||
    raw.includes('user cancelled') ||
    raw.includes('purchase canceled') ||
    raw.includes('purchase cancelled')
  ) {
    return createBillingError(BILLING_ERROR_CODE.USER_CANCELED, '使用者已取消購買', error)
  }

  if (
    codeText.includes('BILLING_UNAVAILABLE') ||
    raw.includes('billing not supported') ||
    raw.includes('billing unavailable') ||
    raw.includes('billing is unavailable') ||
    raw.includes('feature not supported')
  ) {
    return createBillingError(BILLING_ERROR_CODE.BILLING_NOT_AVAILABLE, '目前裝置不支援 Google Play 訂閱流程', error)
  }

  if (
    codeText.includes('SERVICE_UNAVAILABLE') ||
    codeText.includes('SERVICE_DISCONNECTED') ||
    codeText.includes('NETWORK_ERROR') ||
    raw.includes('service unavailable') ||
    raw.includes('service disconnected') ||
    raw.includes('network') ||
    raw.includes('timeout')
  ) {
    return createBillingError(BILLING_ERROR_CODE.STORE_UNAVAILABLE, '目前無法連線 Google Play 商店，請稍後再試', error)
  }

  if (
    codeText.includes('ITEM_ALREADY_OWNED') ||
    raw.includes('already owned')
  ) {
    return createBillingError(BILLING_ERROR_CODE.ITEM_ALREADY_OWNED, '你已擁有此方案', error)
  }

  if (
    codeText.includes('ITEM_UNAVAILABLE') ||
    raw.includes('item unavailable') ||
    raw.includes('product unavailable') ||
    raw.includes('not found')
  ) {
    return createBillingError(BILLING_ERROR_CODE.PRODUCT_NOT_AVAILABLE, '此商品目前無法購買', error)
  }

  return createBillingError(BILLING_ERROR_CODE.UNKNOWN, fallbackMessage, error)
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      reject(createBillingError(BILLING_ERROR_CODE.STORE_UNAVAILABLE, timeoutMessage))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer != null) {
      globalThis.clearTimeout(timer)
    }
  })
}

function delay(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

function isStoreUnavailableError(error) {
  return String(error?.code ?? '').trim().toUpperCase() === BILLING_ERROR_CODE.STORE_UNAVAILABLE
}

function hasFreshBillingSupportCache(nowMs = Date.now()) {
  return billingSupportCache.checkedAt > 0 && nowMs - billingSupportCache.checkedAt <= BILLING_SUPPORT_CACHE_TTL_MS
}

function setBillingSupportCache(supported) {
  billingSupportCache = {
    checkedAt: Date.now(),
    supported: Boolean(supported),
  }
}

export function invalidateBillingCache() {
  billingSupportCache = {
    checkedAt: 0,
    supported: false,
  }
  billingConnectionInFlight = null
}

async function withStoreRetry(task, retries = 1) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      const normalizedError = normalizeStoreError(error)
      lastError = normalizedError
      if (!isStoreUnavailableError(normalizedError) || attempt >= retries) {
        throw normalizedError
      }
      // Connection may have dropped — reset cache and reconnect before retry
      setBillingSupportCache(false)
      await delay(STORE_RETRY_DELAY_MS)
      try {
        await ensureBillingSupported()
      } catch (_reconnectError) {
        // If reconnect fails, still try the retry — the task itself may handle it
      }
    }
  }
  throw lastError
}

function normalizeProduct(product) {
  if (!product || typeof product !== 'object') return null
  return {
    identifier: String(product.identifier ?? '').trim(),
    title: String(product.title ?? '').trim(),
    priceString: String(product.priceString ?? '').trim(),
  }
}

function toTimestampMs(value) {
  if (value === null || value === undefined || value === '') return Number.NaN

  if (value instanceof Date) {
    const dateMs = value.getTime()
    return Number.isFinite(dateMs) ? dateMs : Number.NaN
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return Number.NaN
    const absValue = Math.abs(value)
    if (absValue < 1e11) {
      return Math.round(value * 1000)
    }
    return Math.round(value)
  }

  const text = String(value).trim()
  if (!text) return Number.NaN

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return toTimestampMs(Number(text))
  }

  const ms = Date.parse(text)
  return Number.isFinite(ms) ? ms : Number.NaN
}

function toIsoFromAnyTimestamp(value) {
  const ms = toTimestampMs(value)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString()
}

function pickFirstValidIso(values = []) {
  for (const value of values) {
    const iso = toIsoFromAnyTimestamp(value)
    if (iso) return iso
  }
  return ''
}

function normalizePurchaseExpiryIso(transaction) {
  if (!transaction || typeof transaction !== 'object') return ''

  const directCandidates = [
    transaction.expirationDate,
    transaction.expiryDate,
    transaction.expiresDate,
    transaction.expirationTime,
    transaction.expiryTime,
    transaction.expirationTimeMillis,
    transaction.expiryTimeMillis,
    transaction.expiresAt,
  ]
  const directIso = pickFirstValidIso(directCandidates)
  if (directIso) return directIso

  const nestedCandidates = []
  if (Array.isArray(transaction.transactions)) {
    for (const item of transaction.transactions) {
      nestedCandidates.push(
        item?.expirationDate,
        item?.expiryDate,
        item?.expiresDate,
        item?.expirationTime,
        item?.expiryTime,
        item?.expirationTimeMillis,
        item?.expiryTimeMillis,
        item?.expiresAt,
      )
    }
  }
  if (Array.isArray(transaction.purchaseHistory)) {
    for (const item of transaction.purchaseHistory) {
      nestedCandidates.push(
        item?.expirationDate,
        item?.expiryDate,
        item?.expiresDate,
        item?.expirationTime,
        item?.expiryTime,
        item?.expirationTimeMillis,
        item?.expiryTimeMillis,
        item?.expiresAt,
      )
    }
  }

  return pickFirstValidIso(nestedCandidates)
}

function isOwnedPurchase(transaction) {
  if (!transaction || typeof transaction !== 'object') return false

  const state = String(transaction.purchaseState ?? '').trim().toUpperCase()
  if (state && state !== 'PURCHASED' && state !== '1') {
    return false
  }
  if (typeof transaction.isActive === 'boolean' && transaction.isActive === false) {
    return false
  }

  const normalizedExpiryIso = normalizePurchaseExpiryIso(transaction)
  const expirationMs = toTimestampMs(normalizedExpiryIso || transaction.expirationDate)
  if (Number.isFinite(expirationMs) && expirationMs <= Date.now()) {
    return false
  }

  const revocationMs = toTimestampMs(transaction.revocationDate)
  if (Number.isFinite(revocationMs) && revocationMs <= Date.now()) {
    return false
  }

  return true
}

function getPurchaseProductIdentifiers(purchase) {
  if (!purchase || typeof purchase !== 'object') return []

  const identifiers = [
    purchase.productIdentifier,
    purchase.productId,
    purchase.sku,
    purchase.id,
  ]

  if (Array.isArray(purchase.productIds)) {
    identifiers.push(...purchase.productIds)
  }
  if (Array.isArray(purchase.products)) {
    identifiers.push(...purchase.products)
  }
  if (Array.isArray(purchase.productIdentifiers)) {
    identifiers.push(...purchase.productIdentifiers)
  }

  return identifiers
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

function findOwnedPurchaseByProductId(purchases, productIdentifier) {
  const targetIdentifier = String(productIdentifier ?? '').trim()
  if (!targetIdentifier) return null

  return purchases.find((purchase) => {
    if (!purchase) {
      return false
    }
    const identifiers = getPurchaseProductIdentifiers(purchase)
    if (!identifiers.includes(targetIdentifier)) return false
    return isOwnedPurchase(purchase)
  }) ?? null
}

function normalizeOwnedPurchase(purchase) {
  if (!purchase || typeof purchase !== 'object') return null
  const expiresAt = normalizePurchaseExpiryIso(purchase)
  return {
    ...purchase,
    expiresAt,
  }
}

async function ensureBillingSupported() {
  if (!isAndroidNativePlatform()) {
    throw createBillingError(BILLING_ERROR_CODE.BILLING_NOT_AVAILABLE, '目前裝置不支援 Google Play 訂閱流程')
  }

  if (hasFreshBillingSupportCache() && billingSupportCache.supported) {
    return
  }

  // Serialize concurrent connection attempts — BillingClient.startConnection
  // does not support being called concurrently.
  if (billingConnectionInFlight) {
    return billingConnectionInFlight
  }

  billingConnectionInFlight = (async () => {
    for (let attempt = 1; attempt <= BILLING_SUPPORT_RETRY_MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await withTimeout(
          NativePurchases.isBillingSupported(),
          BILLING_TIMEOUT_MS.support,
          'Google Play 驗證逾時，請稍後再試',
        )
        if (!result?.isBillingSupported) {
          throw createBillingError(BILLING_ERROR_CODE.BILLING_NOT_AVAILABLE, '目前裝置不支援 Google Play 訂閱流程')
        }
        setBillingSupportCache(true)
        return
      } catch (error) {
        const normalizedError = normalizeStoreError(error, '目前無法啟用 Google Play 訂閱流程')
        const canRetry = isStoreUnavailableError(normalizedError) && attempt < BILLING_SUPPORT_RETRY_MAX_ATTEMPTS
        setBillingSupportCache(false)
        if (!canRetry) {
          throw normalizedError
        }
        await delay(STORE_RETRY_DELAY_MS * attempt)
      }
    }
  })().finally(() => {
    billingConnectionInFlight = null
  })

  return billingConnectionInFlight
}

export async function isSupported() {
  if (!isAndroidNativePlatform()) return false
  if (hasFreshBillingSupportCache()) {
    return billingSupportCache.supported
  }
  try {
    await ensureBillingSupported()
    return true
  } catch (error) {
    const normalizedError = normalizeStoreError(error, '目前無法啟用 Google Play 訂閱流程')
    if (isStoreUnavailableError(normalizedError)) {
      return true
    }
    return false
  }
}

async function loadProductsInternal() {
  // Pre-establish BillingClient connection before querying products
  await ensureBillingSupported()

  const monthlyResult = await withStoreRetry(() => withTimeout(
    NativePurchases.getProduct({
      productIdentifier: GOOGLE_PLAY_PRODUCTS.monthly.productIdentifier,
      productType: GOOGLE_PLAY_PRODUCTS.monthly.productType,
    }),
    BILLING_TIMEOUT_MS.loadProduct,
    '讀取 Google Play 商品逾時，請稍後再試',
  )).catch(() => ({ product: null }))

  const lifetimeResult = await withStoreRetry(() => withTimeout(
    NativePurchases.getProduct({
      productIdentifier: GOOGLE_PLAY_PRODUCTS.lifetime.productIdentifier,
      productType: GOOGLE_PLAY_PRODUCTS.lifetime.productType,
    }),
    BILLING_TIMEOUT_MS.loadProduct,
    '讀取 Google Play 商品逾時，請稍後再試',
  )).catch(() => ({ product: null }))

  return {
    monthly: normalizeProduct(monthlyResult?.product ?? null),
    lifetime: normalizeProduct(lifetimeResult?.product ?? null),
  }
}

export async function loadProducts() {
  try {
    return await loadProductsInternal()
  } catch (error) {
    const normalized = normalizeStoreError(error, '讀取 Google Play 商品失敗')
    if (!isStoreUnavailableError(normalized)) throw normalized

    // Connection likely dropped — reconnect and retry once
    setBillingSupportCache(false)
    await delay(STORE_RETRY_DELAY_MS)
    try {
      return await loadProductsInternal()
    } catch (_retryError) {
      // Return empty products instead of throwing — UI can gracefully degrade
      return {
        monthly: null,
        lifetime: null,
      }
    }
  }
}

async function purchaseInternal(normalizedPlan) {
  await ensureBillingSupported()

  if (normalizedPlan === 'monthly') {
    return await withTimeout(
      NativePurchases.purchaseProduct({
        productIdentifier: GOOGLE_PLAY_PRODUCTS.monthly.productIdentifier,
        planIdentifier: GOOGLE_PLAY_PRODUCTS.monthly.planIdentifier,
        productType: GOOGLE_PLAY_PRODUCTS.monthly.productType,
        quantity: 1,
      }),
      BILLING_TIMEOUT_MS.purchase,
      'Google Play 購買逾時，請稍後再試',
    )
  }

  return await withTimeout(
    NativePurchases.purchaseProduct({
      productIdentifier: GOOGLE_PLAY_PRODUCTS.lifetime.productIdentifier,
      productType: GOOGLE_PLAY_PRODUCTS.lifetime.productType,
      quantity: 1,
    }),
    BILLING_TIMEOUT_MS.purchase,
    'Google Play 購買逾時，請稍後再試',
  )
}

export async function purchase(plan) {
  const normalizedPlan = normalizePlan(plan)
  if (!normalizedPlan) {
    throw createBillingError(BILLING_ERROR_CODE.PRODUCT_NOT_AVAILABLE, '無效的 Google Play 訂閱方案')
  }

  try {
    return await purchaseInternal(normalizedPlan)
  } catch (error) {
    const normalized = normalizeStoreError(error, 'Google Play 購買失敗')
    // Don't retry user cancels or non-connection errors
    if (!isStoreUnavailableError(normalized)) throw normalized

    // Connection likely dropped — reconnect and retry once
    setBillingSupportCache(false)
    await delay(STORE_RETRY_DELAY_MS)
    try {
      return await purchaseInternal(normalizedPlan)
    } catch (retryError) {
      throw normalizeStoreError(retryError, 'Google Play 購買失敗')
    }
  }
}

async function queryOwnedInternal() {
  await ensureBillingSupported()

  const subsResult = await withStoreRetry(() => withTimeout(
    NativePurchases.getPurchases({
      productType: GOOGLE_PLAY_PRODUCTS.monthly.productType,
    }),
    BILLING_TIMEOUT_MS.queryOwned,
    '查詢 Google Play 購買紀錄逾時，請稍後再試',
  ))

  const inappResult = await withStoreRetry(() => withTimeout(
    NativePurchases.getPurchases({
      productType: GOOGLE_PLAY_PRODUCTS.lifetime.productType,
    }),
    BILLING_TIMEOUT_MS.queryOwned,
    '查詢 Google Play 購買紀錄逾時，請稍後再試',
  ))

  const subsPurchases = Array.isArray(subsResult?.purchases) ? subsResult.purchases : []
  const inappPurchases = Array.isArray(inappResult?.purchases) ? inappResult.purchases : []

  const monthlyPurchaseRaw = findOwnedPurchaseByProductId(subsPurchases, GOOGLE_PLAY_PRODUCTS.monthly.productIdentifier)
  const lifetimePurchaseRaw = findOwnedPurchaseByProductId(inappPurchases, GOOGLE_PLAY_PRODUCTS.lifetime.productIdentifier)
  const monthlyPurchase = normalizeOwnedPurchase(monthlyPurchaseRaw)
  const lifetimePurchase = normalizeOwnedPurchase(lifetimePurchaseRaw)

  return {
    hasMonthly: Boolean(monthlyPurchase),
    hasLifetime: Boolean(lifetimePurchase),
    monthly: monthlyPurchase,
    lifetime: lifetimePurchase,
  }
}

export async function queryOwned() {
  try {
    return await queryOwnedInternal()
  } catch (error) {
    const normalized = normalizeStoreError(error, 'Google Play 訂閱狀態查詢失敗')
    if (!isStoreUnavailableError(normalized)) throw normalized

    // Connection likely dropped — reconnect and retry once
    setBillingSupportCache(false)
    await delay(STORE_RETRY_DELAY_MS)
    try {
      return await queryOwnedInternal()
    } catch (retryError) {
      throw normalizeStoreError(retryError, 'Google Play 訂閱狀態查詢失敗')
    }
  }
}

export async function restore() {
  try {
    await ensureBillingSupported()
    await withStoreRetry(() => withTimeout(
      NativePurchases.restorePurchases(),
      BILLING_TIMEOUT_MS.restore,
      '還原購買逾時，請稍後再試',
    ))
  } catch (error) {
    const normalized = normalizeStoreError(error, '還原購買失敗')
    if (!isStoreUnavailableError(normalized)) throw normalized

    // Connection likely dropped — reconnect and retry once
    setBillingSupportCache(false)
    await delay(STORE_RETRY_DELAY_MS)
    await ensureBillingSupported()
    await withStoreRetry(() => withTimeout(
      NativePurchases.restorePurchases(),
      BILLING_TIMEOUT_MS.restore,
      '還原購買逾時，請稍後再試',
    ))
  }
}

export async function manageSubscriptions() {
  try {
    await ensureBillingSupported()
    await withStoreRetry(() => withTimeout(
      NativePurchases.manageSubscriptions(),
      BILLING_TIMEOUT_MS.manage,
      '開啟訂閱管理頁逾時，請稍後再試',
    ))
  } catch (error) {
    const normalized = normalizeStoreError(error, '無法開啟訂閱管理頁')
    if (!isStoreUnavailableError(normalized)) throw normalized

    // Connection likely dropped — reconnect and retry once
    setBillingSupportCache(false)
    await delay(STORE_RETRY_DELAY_MS)
    await ensureBillingSupported()
    await withStoreRetry(() => withTimeout(
      NativePurchases.manageSubscriptions(),
      BILLING_TIMEOUT_MS.manage,
      '開啟訂閱管理頁逾時，請稍後再試',
    ))
  }
}

export async function redeemPromoCode(code) {
  const normalizedCode = String(code ?? '').trim()
  if (!normalizedCode) {
    throw createBillingError(BILLING_ERROR_CODE.PRODUCT_NOT_AVAILABLE, '請輸入 Google Play 優惠碼')
  }

  const redeemUrl = `https://play.google.com/redeem?code=${encodeURIComponent(normalizedCode)}`
  const opened = window.open(redeemUrl, '_blank', 'noopener')
  if (!opened) {
    window.location.href = redeemUrl
  }
}
