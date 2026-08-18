/**
 * API-02: Vercel production/preview must not expose auth/shared-ledgers/referrals
 * handlers that import better-sqlite3 without server.js rate-limit/CORS/body guards.
 * Local vite `localApiDevPlugin` leaves VERCEL_ENV unset, so dev still works.
 */
export function rejectProductionServerless(res) {
  const vercelEnv = String(process.env.VERCEL_ENV ?? '').trim().toLowerCase()
  if (vercelEnv !== 'production' && vercelEnv !== 'preview') return false

  res.statusCode = 404
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({
    error: 'not_found',
    message: 'use api.strawmb.com',
  }))
  return true
}
