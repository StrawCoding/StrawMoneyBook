import adminHandler from './admin.js'
import authHandler from './auth.js'
import clientLogsHandler from './client-logs.js'
import referralsHandler from './referrals.js'
import sharedLedgersHandler from './shared-ledgers.js'

export const API_ROUTE_TABLE = Object.freeze([
  { prefix: '/api/auth', handler: authHandler },
  { prefix: '/api/admin', handler: adminHandler },
  { prefix: '/api/client-logs', handler: clientLogsHandler },
  { prefix: '/api/shared-ledgers', handler: sharedLedgersHandler },
  { prefix: '/api/referrals', handler: referralsHandler },
])

export function resolveRouteHandler(pathname = '') {
  const normalizedPathname = String(pathname ?? '').trim() || '/'
  if (normalizedPathname === '/health') {
    return {
      type: 'health',
      prefix: '/health',
      handler: null,
    }
  }
  return API_ROUTE_TABLE.find((route) => normalizedPathname.startsWith(route.prefix)) ?? null
}
