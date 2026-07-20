import { sendRouteError } from '../../collab/http.js'
import {
  ensureSharedLedgerMembership,
  methodGuard,
  requireAuthenticatedUser,
  sendJson,
  splitPathSegments,
} from './shared.js'
import { handleActivateFirstTrial } from './trial-handlers.js'
import {
  handleAcceptInvitation,
  handleInviteByEmail,
  handleListOutgoingInvitations,
  handlePendingInvitations,
  handleResendInvitation,
} from './invitation-handlers.js'
import {
  handleCreate,
  handleDelete,
  handleDetail,
  handleJoin,
  handleList,
  handleRotateInviteCode,
  handleSnapshotFetch,
  handleSnapshotPush,
  handleTransferOwnership,
  handleUpdateMemberRole,
} from './ledger-handlers.js'

function matchSegments(pattern = [], segments = []) {
  if (pattern.length !== segments.length) return null
  const params = {}
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index]
    const actual = segments[index]
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = actual
      continue
    }
    if (expected !== actual) return null
  }
  return params
}

const SHARED_LEDGER_ROUTES = Object.freeze([
  {
    name: 'activate_first_trial',
    method: 'POST',
    pattern: ['trial', 'activate'],
    bypassMembership: true,
    handler: (req, res, user) => handleActivateFirstTrial(req, res, user),
  },
  {
    name: 'pending_invitations',
    method: 'GET',
    pattern: ['invitations', 'pending'],
    handler: (req, res, user) => handlePendingInvitations(req, res, user),
  },
  {
    name: 'accept_invitation',
    method: 'POST',
    pattern: ['invitations', ':invitationId'],
    handler: (req, res, user, params) => handleAcceptInvitation(req, res, user, params.invitationId),
  },
  {
    name: 'list',
    method: 'GET',
    pattern: [],
    handler: (req, res, user) => handleList(req, res, user),
  },
  {
    name: 'create',
    method: 'POST',
    pattern: [],
    handler: (req, res, user) => handleCreate(req, res, user),
  },
  {
    name: 'join',
    method: 'POST',
    pattern: ['join'],
    handler: (req, res, user) => handleJoin(req, res, user),
  },
  {
    name: 'list_outgoing_invitations',
    method: 'GET',
    pattern: [':sharedLedgerId', 'invitations'],
    handler: (req, res, user, params) => handleListOutgoingInvitations(req, res, user, params.sharedLedgerId),
  },
  {
    name: 'invite_by_email',
    method: 'POST',
    pattern: [':sharedLedgerId', 'invitations'],
    handler: (req, res, user, params) => handleInviteByEmail(req, res, user, params.sharedLedgerId),
  },
  {
    name: 'resend_invitation',
    method: 'POST',
    pattern: [':sharedLedgerId', 'invitations', ':invitationId', 'resend'],
    handler: (req, res, user, params) => handleResendInvitation(
      req,
      res,
      user,
      params.sharedLedgerId,
      params.invitationId,
    ),
  },
  {
    name: 'transfer_ownership',
    method: 'POST',
    pattern: [':sharedLedgerId', 'transfer'],
    handler: (req, res, user, params) => handleTransferOwnership(req, res, user, params.sharedLedgerId),
  },
  {
    name: 'rotate_invite_code',
    method: 'POST',
    pattern: [':sharedLedgerId', 'invite-code', 'rotate'],
    handler: (req, res, user, params) => handleRotateInviteCode(req, res, user, params.sharedLedgerId),
  },
  {
    name: 'update_member_role',
    method: 'POST',
    pattern: [':sharedLedgerId', 'members', ':memberUserId', 'role'],
    handler: (req, res, user, params) => handleUpdateMemberRole(
      req,
      res,
      user,
      params.sharedLedgerId,
      params.memberUserId,
    ),
  },
  {
    name: 'detail',
    method: 'GET',
    pattern: [':sharedLedgerId'],
    handler: (req, res, user, params) => handleDetail(req, res, user, params.sharedLedgerId),
  },
  {
    name: 'snapshot_fetch',
    method: 'GET',
    pattern: [':sharedLedgerId', 'snapshot'],
    handler: (req, res, user, params) => handleSnapshotFetch(req, res, user, params.sharedLedgerId),
  },
  {
    name: 'snapshot_push',
    method: 'POST',
    pattern: [':sharedLedgerId', 'snapshot'],
    handler: (req, res, user, params) => handleSnapshotPush(req, res, user, params.sharedLedgerId),
  },
  {
    name: 'delete',
    method: 'DELETE',
    pattern: [':sharedLedgerId'],
    // Leave / owner-unshare must remain available after membership lapses;
    // create / invite / sync stay membership-gated.
    bypassMembership: true,
    handler: (req, res, user, params) => handleDelete(req, res, user, params.sharedLedgerId),
  },
])

export function resolveSharedLedgersRoute(method, segments = []) {
  const normalizedMethod = String(method ?? '').trim().toUpperCase()
  for (const route of SHARED_LEDGER_ROUTES) {
    if (route.method !== normalizedMethod) continue
    const params = matchSegments(route.pattern, segments)
    if (!params) continue
    return {
      ...route,
      params,
    }
  }
  return null
}

export default async function sharedLedgersHandler(req, res) {
  if (methodGuard(req, res, ['GET', 'POST', 'DELETE'])) return

  const user = await requireAuthenticatedUser(req, res, sendJson)
  if (!user) return

  const segments = splitPathSegments(req, '/api/shared-ledgers')
  const route = resolveSharedLedgersRoute(req.method, segments)
  if (!route) {
    sendJson(res, 404, { error: 'not_found' })
    return
  }

  try {
    if (!route.bypassMembership && !await ensureSharedLedgerMembership(res, user)) {
      return
    }

    await route.handler(req, res, user, route.params)
  } catch (error) {
    sendRouteError(res, error, {
      fallbackCode: 'shared_ledger_request_failed',
      fallbackMessage: 'shared ledger request failed',
      defaultStatus: 400,
      extendPayload: (routeError) => (
        String(routeError?.code ?? '') === 'version_conflict'
          ? { current_version: Number(routeError?.currentVersion ?? 0) }
          : {}
      ),
    })
  }
}
