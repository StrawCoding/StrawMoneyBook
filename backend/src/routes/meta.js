import { methodGuard, normalizePath, sendJson } from '../collab/http.js'

const LINEAR_API_URL = 'https://api.linear.app/graphql'
const DEFAULT_LINEAR_TEAM_KEY = String(process.env.LINEAR_TEAM_KEY ?? 'SMB').trim() || 'SMB'
const DEFAULT_LINEAR_ISSUE_LIMIT = Math.min(
  100,
  Math.max(1, Number(process.env.LINEAR_ISSUE_LIMIT ?? 50) || 50),
)

const LINEAR_TEAM_ISSUES_QUERY = `
  query TeamIssues($teamKey: String!, $first: Int!) {
    team(key: $teamKey) {
      issues(first: $first) {
        nodes {
          title
          updatedAt
          state {
            name
          }
        }
      }
    }
  }
`

function getLinearApiKey() {
  return String(process.env.LINEAR_API_KEY ?? '').trim()
}

function createLinearConfigError(message, status = 503, code = 'linear_not_configured') {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

async function requestLinearIssues({ teamKey = DEFAULT_LINEAR_TEAM_KEY, first = DEFAULT_LINEAR_ISSUE_LIMIT } = {}) {
  const apiKey = getLinearApiKey()
  if (!apiKey) {
    throw createLinearConfigError('Linear API key is not configured')
  }

  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query: LINEAR_TEAM_ISSUES_QUERY,
      variables: {
        teamKey,
        first,
      },
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = Array.isArray(payload?.errors)
      ? payload.errors.map((item) => String(item?.message ?? '').trim()).filter(Boolean).join(' | ')
      : ''
    throw createLinearConfigError(
      detail ? `Linear request failed: ${detail}` : `Linear request failed with HTTP ${response.status}`,
      response.status >= 500 ? 502 : response.status,
      'linear_request_failed',
    )
  }

  if (Array.isArray(payload?.errors) && payload.errors.length) {
    const detail = payload.errors.map((item) => String(item?.message ?? '').trim()).filter(Boolean).join(' | ')
    throw createLinearConfigError(
      detail || 'Linear request failed',
      502,
      'linear_request_failed',
    )
  }

  const nodes = Array.isArray(payload?.data?.team?.issues?.nodes) ? payload.data.team.issues.nodes : []
  return nodes
    .map((item) => ({
      title: String(item?.title ?? '').trim(),
      status: String(item?.state?.name ?? '').trim() || 'Unknown',
      updatedAt: String(item?.updatedAt ?? '').trim(),
    }))
    .filter((item) => item.title)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .map(({ title, status }) => ({ title, status }))
}

export default async function metaHandler(req, res) {
  if (methodGuard(req, res, ['GET'])) return

  const pathname = normalizePath(req, '/api/meta')

  try {
    if (pathname === '/version-progress') {
      const items = await requestLinearIssues()
      sendJson(res, 200, {
        items,
      })
      return
    }

    sendJson(res, 404, { error: 'not_found' })
  } catch (error) {
    sendJson(res, Number(error?.status ?? 500) || 500, {
      error: String(error?.code ?? 'meta_request_failed'),
      message: String(error?.message ?? error ?? 'meta request failed'),
    })
  }
}
