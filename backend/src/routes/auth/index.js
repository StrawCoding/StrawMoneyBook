import { sendAuthError, methodGuard, normalizePath, sendJson } from './shared.js'
import {
  handleGooglePlayMembershipSync,
  handleLogin,
  handleLogout,
  handleMe,
  handlePasswordChange,
  handleProfileUpdate,
  handleRefresh,
  handleRegister,
} from './session-handlers.js'
import { handleGoogleAuth, handleGooglePrepare } from './google-handlers.js'
import { handlePasswordResetConfirm, handlePasswordResetRequest } from './password-reset-handlers.js'

const AUTH_ROUTES = Object.freeze([
  { name: 'register', method: 'POST', path: '/register', handler: handleRegister },
  { name: 'login', method: 'POST', path: '/login', handler: handleLogin },
  { name: 'google_prepare', method: 'POST', path: '/google/prepare', handler: handleGooglePrepare },
  { name: 'google_auth', method: 'POST', path: '/google', handler: handleGoogleAuth },
  { name: 'refresh', method: 'POST', path: '/refresh', handler: handleRefresh },
  { name: 'password_reset_request', method: 'POST', path: '/password-reset/request', handler: handlePasswordResetRequest },
  { name: 'password_reset_confirm', method: 'POST', path: '/password-reset/confirm', handler: handlePasswordResetConfirm },
  { name: 'password_change', method: 'POST', path: '/password/change', handler: handlePasswordChange },
  { name: 'logout', method: 'POST', path: '/logout', handler: handleLogout },
  { name: 'me', method: 'GET', path: '/me', handler: handleMe },
  { name: 'profile', method: 'POST', path: '/profile', handler: handleProfileUpdate },
  { name: 'google_play_membership_sync', method: 'POST', path: '/membership/google-play', handler: handleGooglePlayMembershipSync },
])

export function resolveAuthRoute(method, pathname) {
  const normalizedMethod = String(method ?? '').trim().toUpperCase()
  const normalizedPathname = String(pathname ?? '').trim() || '/'
  return AUTH_ROUTES.find((route) => route.method === normalizedMethod && route.path === normalizedPathname) ?? null
}

export default async function authHandler(req, res) {
  if (methodGuard(req, res, ['GET', 'POST'])) return

  const pathname = normalizePath(req, '/api/auth')
  const route = resolveAuthRoute(req.method, pathname)
  if (!route) {
    sendJson(res, 404, { error: 'not_found' })
    return
  }

  try {
    await route.handler(req, res)
  } catch (error) {
    sendAuthError(res, error)
  }
}
