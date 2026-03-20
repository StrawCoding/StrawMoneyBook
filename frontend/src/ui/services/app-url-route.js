export function resolveRouteFromAppUrl(rawUrl, options = {}) {
  const source = String(rawUrl ?? '').trim()
  if (!source) return null

  const extractSharedLedgerInviteCode = typeof options.extractSharedLedgerInviteCode === 'function'
    ? options.extractSharedLedgerInviteCode
    : () => null
  const getPreferredBookkeepingPath = typeof options.getPreferredBookkeepingPath === 'function'
    ? options.getPreferredBookkeepingPath
    : () => '/'

  try {
    const parsed = new URL(source)
    const host = String(parsed.host ?? '').trim().toLowerCase()
    const pathname = String(parsed.pathname ?? '').trim().replace(/\/+$/, '').toLowerCase()
    const pathSegments = pathname.split('/').filter(Boolean)
    const routeKey = pathname && pathname !== '/' ? pathname.slice(1) : host
    const combinedRoute = [host, ...pathSegments].filter(Boolean).join('/')
    const inviteCode = extractSharedLedgerInviteCode(source)

    if (
      inviteCode
      && (
        host === 'shared-ledger'
        || (pathSegments[0] === 'open' && pathSegments[1] === 'shared-ledger')
        || (pathSegments[0] === 'shared-ledger' && pathSegments[1] === 'join')
      )
    ) {
      return {
        path: '/settings/shared-ledgers',
        query: { inviteCode },
      }
    }

    if (routeKey === 'analysis' || combinedRoute === 'analysis') {
      return { path: '/analysis' }
    }

    if (routeKey === 'ai-auto-bookkeeping' || combinedRoute === 'ai-auto-bookkeeping') {
      return { path: '/ai-auto-bookkeeping' }
    }

    if (combinedRoute === 'transactions/quick-add') {
      return { path: '/transactions/quick-add' }
    }

    if (!routeKey || routeKey === 'home' || combinedRoute === 'home') {
      if (parsed.searchParams.get('quickAdd') === '1') {
        return { path: getPreferredBookkeepingPath() }
      }
      return { path: '/' }
    }
  } catch (error) {
    console.warn('[app-url] failed to parse url', source, error)
  }

  return null
}
