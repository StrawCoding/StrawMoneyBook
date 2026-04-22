import { timingSafeEqual } from 'node:crypto'
import { methodGuard, normalizePath, parseBody, sendJson } from '../../collab/http.js'
import {
  closeInvoiceCarrierSession,
  createInvoiceCarrierLinkSession,
  exchangeInvoiceCarrierAuth,
  getInvoiceCarrierSessionStatus,
  syncInvoiceCarrierData,
} from './provider.js'

const INVOICE_ROUTES = Object.freeze([
  { method: 'POST', path: '/link_session', handler: createInvoiceCarrierLinkSession },
  { method: 'POST', path: '/session_status', handler: getInvoiceCarrierSessionStatus },
  { method: 'POST', path: '/exchange', handler: exchangeInvoiceCarrierAuth },
  { method: 'POST', path: '/sync', handler: syncInvoiceCarrierData },
  {
    method: 'POST',
    path: '/disconnect',
    handler: async (body = {}) => {
      if (body?.session_id) {
        await closeInvoiceCarrierSession(body.session_id)
      }
      return {
        ok: true,
        message: 'E-Invoice session closed',
      }
    },
  },
])

function resolveClientSharedKey() {
  return String(
    process.env.INVOICE_CARRIER_CLIENT_SHARED_KEY
      ?? process.env.BANK_SYNC_CLIENT_SHARED_KEY
      ?? '',
  ).trim()
}

function secureEquals(left, right) {
  const leftBytes = Buffer.from(String(left ?? ''), 'utf8')
  const rightBytes = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBytes.length !== rightBytes.length) return false
  return timingSafeEqual(leftBytes, rightBytes)
}

function isClientAuthorized(req) {
  const expected = resolveClientSharedKey()
  if (!expected) return true
  const provided = String(
    req.headers?.['x-straw-client-key']
      ?? req.headers?.['X-Straw-Client-Key']
      ?? '',
  ).trim()
  return secureEquals(provided, expected)
}

function clientGuard(req, res) {
  if (isClientAuthorized(req)) return false
  sendJson(res, 401, {
    error: 'unauthorized_client',
    message: 'missing or invalid x-straw-client-key',
  })
  return true
}

export function resolveInvoiceRoute(method, pathname) {
  const normalizedMethod = String(method ?? '').trim().toUpperCase()
  const normalizedPathname = String(pathname ?? '').trim().replace(/\/+$/, '') || '/'
  return INVOICE_ROUTES.find((route) => (
    route.method === normalizedMethod
    && route.path === normalizedPathname
  )) ?? null
}

export default async function invoiceHandler(req, res) {
  if (methodGuard(req, res, ['POST'])) return
  if (clientGuard(req, res)) return

  const pathname = normalizePath(req, '/api/invoice')
  const route = resolveInvoiceRoute(req.method, pathname)
  if (!route) {
    sendJson(res, 404, {
      error: 'not_found',
      message: 'route not found',
    })
    return
  }

  try {
    const result = await route.handler(parseBody(req))
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, Number(error?.status ?? 400) || 400, {
      error: String(error?.code ?? '').trim() || 'einvoice_request_failed',
      message: String(error?.message ?? error ?? 'E-Invoice request failed'),
    })
  }
}
