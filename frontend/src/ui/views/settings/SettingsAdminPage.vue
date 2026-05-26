<template>
  <section class="stack admin-dashboard">
    <article class="card panel dashboard-hero">
      <div class="hero-copy">
        <span class="hero-kicker">Admin Console</span>
        <div class="row page-head">
          <div class="hero-title-wrap">
            <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-users" class="title-icon" />{{ t('settings_admin.title', '管理員平台') }}</h2>
            <p class="muted hero-desc">
              {{ t('settings_admin.desc', '查看使用者、會員狀態與錯誤 log，並執行基本管理操作。') }}
            </p>
          </div>
          <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
        </div>

        <p v-if="apiUnavailable" class="muted error-text">{{ apiUnavailableMessage }}</p>
        <p v-else-if="!isAdmin" class="muted error-text">{{ t('settings_admin.not_allowed', '你目前沒有管理員權限。') }}</p>
        <div v-else class="hero-actions">
          <button class="btn primary" :disabled="loading" :aria-busy="loading" @click="loadOverview">
            {{ loading ? t('common.loading', '載入中...') : t('common.refresh', '重新整理') }}
          </button>
          <div class="hero-pills">
            <span class="hero-pill">
              <font-awesome-icon icon="fa-solid fa-user-group" />
              {{ t('settings_admin.stats.active_memberships', '啟用會員') }} {{ formatMetricValue(activeMemberships) }}
            </span>
            <span class="hero-pill">
              <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
              {{ t('settings_admin.stats.pending_error_logs', '待審核錯誤') }} {{ formatMetricValue(pendingErrorLogs) }}
            </span>
            <span class="hero-pill">
              <font-awesome-icon icon="fa-solid fa-shield-halved" />
              {{ t('settings_admin.logs.reviewed', '已審核') }} {{ formatMetricValue(reviewedErrorLogs) }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="!apiUnavailable && isAdmin" class="hero-orbit">
        <article class="orbit-card orbit-card-primary">
          <small>{{ t('settings_admin.hero.membership_rate', '會員覆蓋率') }}</small>
          <strong>{{ membershipRate }}%</strong>
          <span>{{ formatMetricValue(activeMemberships) }} / {{ formatMetricValue(totalUsers) }}</span>
        </article>
        <article class="orbit-card orbit-card-warm">
          <small>{{ t('settings_admin.hero.log_review_rate', 'Log 審核率') }}</small>
          <strong>{{ reviewCoverage }}%</strong>
          <span>{{ formatMetricValue(reviewedErrorLogs) }} / {{ formatMetricValue(totalErrorLogs) }}</span>
        </article>
        <article class="orbit-card orbit-card-neutral">
          <small>{{ t('settings_admin.hero.health_score', '營運健康度') }}</small>
          <strong>{{ healthScore }}%</strong>
          <span>{{ overviewDateRangeLabel }}</span>
        </article>
      </div>
    </article>

    <template v-if="!apiUnavailable && isAdmin">
      <article class="card panel stats-panel">
        <div class="stats-grid">
          <div v-for="card in statCards" :key="card.key" class="stat-card" :class="`tone-${card.tone}`">
            <div class="stat-icon-wrap">
              <font-awesome-icon :icon="card.icon" />
            </div>
            <div class="stat-copy">
              <small class="muted">{{ card.label }}</small>
              <strong>{{ card.value }}</strong>
              <p class="muted compact">{{ card.note }}</p>
            </div>
          </div>
        </div>
      </article>

      <section class="dashboard-grid">
        <article class="card panel analytics-panel">
          <header class="panel-head">
            <div>
              <small class="panel-kicker">{{ t('settings_admin.analytics.kicker', '近 7 天動態') }}</small>
              <h3>{{ t('settings_admin.chart.users', '近 7 天使用者 / 錯誤') }}</h3>
            </div>
            <div class="chart-legend">
              <span class="legend-item">
                <span class="legend-dot users"></span>
                {{ t('settings_admin.chart.new_users', '新用戶') }}
              </span>
              <span class="legend-item">
                <span class="legend-dot errors"></span>
                {{ t('settings_admin.chart.errors', '錯誤') }}
              </span>
            </div>
          </header>

          <div v-if="activityColumns.length" class="activity-chart-shell">
            <div class="activity-chart">
              <svg class="activity-line" viewBox="0 0 320 140" preserveAspectRatio="none" aria-hidden="true">
                <polyline class="error-line" :points="activityChartPoints"></polyline>
                <circle
                  v-for="point in activityChartDots"
                  :key="point.key"
                  class="error-dot"
                  :cx="point.x"
                  :cy="point.y"
                  r="4"
                ></circle>
              </svg>

              <div v-for="row in activityColumns" :key="row.date" class="chart-day">
                <div class="chart-bars">
                  <span class="chart-bar users" :style="{ height: `${row.userHeight}%` }"></span>
                  <span class="chart-bar errors" :style="{ height: `${row.errorHeight}%` }"></span>
                </div>
                <small class="chart-label">{{ row.shortDate }}</small>
                <small class="chart-value">{{ row.users }} / {{ row.errors }}</small>
              </div>
            </div>

            <div class="insight-grid">
              <article v-for="item in insightCards" :key="item.key" class="insight-card" :class="`tone-${item.tone}`">
                <div class="insight-icon">
                  <font-awesome-icon :icon="item.icon" />
                </div>
                <div class="insight-copy">
                  <small class="muted">{{ item.label }}</small>
                  <strong>{{ item.value }}</strong>
                  <p class="muted compact">{{ item.note }}</p>
                </div>
              </article>
            </div>
          </div>

          <p v-else class="muted empty-state">{{ t('settings_admin.analytics.empty', '目前沒有近 7 天的統計資料。') }}</p>
        </article>

        <article class="card panel health-panel">
          <header class="panel-head">
            <div>
              <small class="panel-kicker">{{ t('settings_admin.health.kicker', '營運摘要') }}</small>
              <h3>{{ t('settings_admin.health.title', '會員與審核狀態') }}</h3>
            </div>
          </header>

          <div class="health-ring" :style="{ '--health-angle': `${healthScore * 3.6}deg` }">
            <div class="health-ring-inner">
              <strong>{{ healthScore }}%</strong>
              <small>{{ t('settings_admin.hero.health_score', '營運健康度') }}</small>
            </div>
          </div>

          <div class="health-metrics">
            <div class="progress-card">
              <div class="row progress-head">
                <span>{{ t('settings_admin.hero.membership_rate', '會員覆蓋率') }}</span>
                <strong>{{ membershipRate }}%</strong>
              </div>
              <div class="progress-track">
                <span class="progress-fill tone-ok" :style="{ width: `${membershipRate}%` }"></span>
              </div>
              <small class="muted">{{ formatMetricValue(activeMemberships) }} / {{ formatMetricValue(totalUsers) }}</small>
            </div>

            <div class="progress-card">
              <div class="row progress-head">
                <span>{{ t('settings_admin.hero.log_review_rate', 'Log 審核率') }}</span>
                <strong>{{ reviewCoverage }}%</strong>
              </div>
              <div class="progress-track">
                <span class="progress-fill tone-primary" :style="{ width: `${reviewCoverage}%` }"></span>
              </div>
              <small class="muted">{{ formatMetricValue(reviewedErrorLogs) }} / {{ formatMetricValue(totalErrorLogs) }}</small>
            </div>

            <div class="progress-card">
              <div class="row progress-head">
                <span>{{ t('settings_admin.health.pending_load', '待處理負載') }}</span>
                <strong>{{ pendingLogRatio }}%</strong>
              </div>
              <div class="progress-track">
                <span class="progress-fill tone-warn" :style="{ width: `${pendingLogRatio}%` }"></span>
              </div>
              <small class="muted">{{ t('settings_admin.stats.pending_error_logs', '待審核錯誤') }} {{ formatMetricValue(pendingErrorLogs) }}</small>
            </div>
          </div>

          <div class="health-notes">
            <article class="note-card">
              <small class="muted">{{ t('settings_admin.health.latest_user', '最近活躍會員') }}</small>
              <strong>{{ latestUserActivity }}</strong>
            </article>
            <article class="note-card">
              <small class="muted">{{ t('settings_admin.health.latest_log', '最近錯誤回報') }}</small>
              <strong>{{ latestLogActivity }}</strong>
            </article>
            <article class="note-card">
              <small class="muted">{{ t('settings_admin.health.range', '觀察區間') }}</small>
              <strong>{{ overviewDateRangeLabel }}</strong>
            </article>
          </div>
        </article>
      </section>

      <section class="content-grid">
        <article class="card panel members-panel">
          <header class="panel-head members-head">
            <div>
              <small class="panel-kicker">{{ t('settings_admin.users.kicker', '會員名單') }}</small>
              <h3>{{ t('settings_admin.users.title', '使用者管理') }}</h3>
            </div>
            <strong class="panel-count">{{ formatMetricValue(filteredUsers.length) }}</strong>
          </header>

          <div class="user-toolbar">
            <label class="field search-field">
              <span>{{ t('settings_admin.users.search', '搜尋會員') }}</span>
              <input
                v-model.trim="searchQuery"
                class="input"
                type="search"
                :placeholder="t('settings_admin.users.search_placeholder', '搜尋 Email、名稱、會員狀態')"
              />
            </label>
            <label class="field page-jump-field">
              <span>{{ t('settings_admin.users.page_jump', '跳轉頁碼') }}</span>
              <div class="row page-jump-row">
                <input
                  v-model="pageInput"
                  class="input page-input"
                  type="number"
                  min="1"
                  :max="totalUserPages"
                  @keydown.enter.prevent="jumpToPage"
                />
                <button class="btn" :disabled="!filteredUsers.length" @click="jumpToPage">
                  {{ t('settings_admin.users.page_jump_action', '前往') }}
                </button>
              </div>
            </label>
          </div>

          <p class="muted compact list-summary">
            {{
              filteredUsers.length
                ? t(
                  'settings_admin.users.page_summary',
                  { start: visibleUserStart, end: visibleUserEnd, total: filteredUsers.length, page: currentUserPage, pages: totalUserPages },
                  '顯示第 {start} - {end} 筆，共 {total} 筆，第 {page} / {pages} 頁',
                )
                : t('settings_admin.users.empty', '目前沒有符合條件的會員。')
            }}
          </p>

          <div v-if="filteredUsers.length" class="user-summary-list">
            <article v-for="item in paginatedUsers" :key="item.id" class="user-summary-card">
              <div class="user-summary-head">
                <div class="summary-identity">
                  <div class="user-avatar">{{ userInitials(item) }}</div>
                  <div class="summary-main">
                    <strong>{{ item.display_name || item.email }}</strong>
                    <small class="muted">{{ item.email }}</small>
                  </div>
                </div>
                <div class="summary-badges">
                  <span class="status-chip" :class="item.membership_active ? 'status-active' : 'status-inactive'">
                    {{ membershipLabel(item) }}
                  </span>
                  <span v-if="item.is_admin" class="status-chip status-admin">
                    {{ t('settings_admin.users.admin', '管理員') }}
                  </span>
                </div>
              </div>

              <div class="summary-meta-grid">
                <div class="summary-meta-card">
                  <small class="muted">{{ t('settings_admin.users.last_login', '最後登入') }}</small>
                  <strong>{{ formatDateTime(item.last_login_at) }}</strong>
                </div>
                <div class="summary-meta-card">
                  <small class="muted">{{ t('settings_admin.users.membership_expiry', '會員到期') }}</small>
                  <strong>{{ formatDateTime(item.membership_bonus_expires_at) }}</strong>
                </div>
                <div class="summary-meta-card">
                  <small class="muted">{{ t('settings_admin.users.membership', '會員') }}</small>
                  <strong>{{ item.membership_source || '-' }}</strong>
                </div>
              </div>

              <div class="row action-row">
                <RouterLink class="btn primary" :to="{ name: 'settings-admin-user', params: { id: item.id } }">
                  {{ t('settings_admin.users.open_detail', '查看完整資料') }}
                </RouterLink>
              </div>
            </article>
          </div>

          <div v-if="filteredUsers.length" class="row pagination-row">
            <button class="btn" :disabled="currentUserPage <= 1" @click="goToPreviousPage">
              {{ t('common.previous', '上一頁') }}
            </button>
            <strong>{{ t('settings_admin.users.page_status', { page: currentUserPage, pages: totalUserPages }, '第 {page} / {pages} 頁') }}</strong>
            <button class="btn" :disabled="currentUserPage >= totalUserPages" @click="goToNextPage">
              {{ t('common.next', '下一頁') }}
            </button>
          </div>
        </article>

        <article class="card panel logs-panel">
          <header class="panel-head">
            <div>
              <small class="panel-kicker">{{ t('settings_admin.logs.kicker', '異常事件') }}</small>
              <h3>{{ t('settings_admin.logs.title', '錯誤 Log') }}</h3>
            </div>
            <span class="status-chip status-pending">
              {{ t('settings_admin.logs.pending', '待審核') }} {{ formatMetricValue(pendingErrorLogs) }}
            </span>
          </header>

          <div v-if="!overview.error_logs.length" class="muted empty-state">{{ t('settings_admin.logs.empty', '目前沒有錯誤 log。') }}</div>

          <div v-else class="log-list">
            <article v-for="log in overview.error_logs" :key="log.id" class="log-card">
              <div class="log-card-head">
                <div class="log-title-wrap">
                  <strong>{{ log.message }}</strong>
                  <small class="muted">{{ log.user_email || '-' }} · {{ log.platform || '-' }}</small>
                </div>
                <span class="status-chip" :class="`status-${normalizeReviewStatus(log.review_status)}`">
                  {{ reviewLabel(log.review_status) }}
                </span>
              </div>

              <div class="log-metadata">
                <span>{{ formatDateTime(log.created_at) }}</span>
                <span>{{ log.code || t('settings_admin.logs.no_code', '無錯誤碼') }}</span>
              </div>

              <div v-if="formatLogDebugContext(log)" class="log-debug">
                <small v-if="getLogDebugHint(log)" class="muted">Debug hint: {{ getLogDebugHint(log) }}</small>
                <small v-if="getLogDebugLastStep(log)" class="muted">Last step: {{ getLogDebugLastStep(log) }}</small>
                <pre class="stack-box">{{ formatLogDebugContext(log) }}</pre>
              </div>

              <pre v-if="log.stack" class="stack-box">{{ log.stack }}</pre>

              <div class="row action-row">
                <button class="btn" :disabled="reviewingLogId === log.id" @click="copyLogEvent(log)">
                  {{ t('settings_admin.logs.copy_event', '複製事件') }}
                </button>
                <button class="btn" :disabled="reviewingLogId === log.id" @click="reviewLog(log.id, 'reviewed')">
                  {{ t('settings_admin.logs.mark_reviewed', '標記已審核') }}
                </button>
                <button class="btn" :disabled="reviewingLogId === log.id" @click="reviewLog(log.id, 'ignored')">
                  {{ t('settings_admin.logs.ignore', '忽略') }}
                </button>
              </div>
            </article>
          </div>
        </article>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  getAdminOverview,
  getSharedLedgerApiUnavailableMessage,
  getSharedLedgerSession,
  isSharedLedgerApiConfigured,
  reviewAdminErrorLog,
  subscribeSharedLedgerSession,
} from '@/services/shared-ledger/backend'

const MEMBERS_PER_PAGE = 10
const CHART_WIDTH = 320
const CHART_HEIGHT = 140
const CHART_PADDING_X = 18
const CHART_PADDING_Y = 18

const uiStore = useUiStore()
const { locale, t } = useI18n()

const apiUnavailable = !isSharedLedgerApiConfigured()
const apiUnavailableMessage = getSharedLedgerApiUnavailableMessage()
const sessionUser = ref(getSharedLedgerSession()?.user ?? null)
const loading = ref(false)
const reviewingLogId = ref('')
const searchQuery = ref('')
const currentUserPage = ref(1)
const pageInput = ref('1')
const overview = ref(createEmptyOverview())

const isAdmin = computed(() => Boolean(sessionUser.value?.is_admin))
const totalUsers = computed(() => Number(overview.value?.stats?.total_users ?? 0) || 0)
const activeMemberships = computed(() => Number(overview.value?.stats?.active_memberships ?? 0) || 0)
const pendingErrorLogs = computed(() => Number(overview.value?.stats?.pending_error_logs ?? 0) || 0)
const totalErrorLogs = computed(() => Number(overview.value?.stats?.total_error_logs ?? 0) || 0)
const reviewedErrorLogs = computed(() => Math.max(0, totalErrorLogs.value - pendingErrorLogs.value))
const membershipRate = computed(() => (
  totalUsers.value > 0 ? Math.round((activeMemberships.value / totalUsers.value) * 100) : 0
))
const reviewCoverage = computed(() => (
  totalErrorLogs.value > 0 ? Math.round((reviewedErrorLogs.value / totalErrorLogs.value) * 100) : 100
))
const pendingLogRatio = computed(() => (
  totalErrorLogs.value > 0 ? Math.round((pendingErrorLogs.value / totalErrorLogs.value) * 100) : 0
))
const healthScore = computed(() => {
  const membershipScore = totalUsers.value > 0 ? membershipRate.value : 100
  const reviewScore = totalErrorLogs.value > 0 ? reviewCoverage.value : 100
  return Math.round((membershipScore + reviewScore) / 2)
})

function createEmptyOverview() {
  return {
    stats: {
      total_users: 0,
      active_memberships: 0,
      pending_error_logs: 0,
      total_error_logs: 0,
    },
    charts: {
      users_by_day: [],
      error_logs_by_day: [],
    },
    users: [],
    error_logs: [],
  }
}

function normalizeOverview(payload) {
  return {
    ...createEmptyOverview(),
    ...(payload && typeof payload === 'object' ? payload : {}),
    stats: {
      ...createEmptyOverview().stats,
      ...(payload?.stats && typeof payload.stats === 'object' ? payload.stats : {}),
    },
    charts: {
      ...createEmptyOverview().charts,
      ...(payload?.charts && typeof payload.charts === 'object' ? payload.charts : {}),
    },
    users: Array.isArray(payload?.users) ? payload.users : [],
    error_logs: Array.isArray(payload?.error_logs) ? payload.error_logs : [],
  }
}

function formatDateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString(locale.value)
}

function formatShortDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return '--'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return new Intl.DateTimeFormat(locale.value, {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function formatMetricValue(value) {
  return new Intl.NumberFormat(locale.value).format(Number(value ?? 0) || 0)
}

function membershipLabel(user) {
  if (user?.membership_active) {
    return t('settings_admin.users.membership_active', '啟用中')
  }
  return t('settings_admin.users.membership_inactive', '未啟用')
}

function normalizeReviewStatus(status) {
  return String(status ?? '').trim().toLowerCase() || 'pending'
}

function reviewLabel(status) {
  const normalized = normalizeReviewStatus(status)
  if (normalized === 'reviewed') return t('settings_admin.logs.reviewed', '已審核')
  if (normalized === 'ignored') return t('settings_admin.logs.ignored', '已忽略')
  if (normalized === 'linear_created') return t('settings_admin.logs.linear_created', '已建 Linear')
  return t('settings_admin.logs.pending', '待審核')
}

function getLogDebugPayload(log) {
  const debug = log?.context?.debug
  return debug && typeof debug === 'object' ? debug : null
}

function getLogDebugHint(log) {
  return String(getLogDebugPayload(log)?.debugHint ?? '').trim()
}

function getLogDebugLastStep(log) {
  return String(getLogDebugPayload(log)?.debugLastStep ?? '').trim()
}

function formatLogDebugContext(log) {
  const debug = getLogDebugPayload(log)
  if (!debug) return ''
  try {
    return JSON.stringify(debug, null, 2)
  } catch {
    return ''
  }
}

async function copyTextToClipboard(text) {
  const normalizedText = String(text ?? '').trim()
  if (!normalizedText) {
    throw new Error(t('settings_admin.logs.copy_missing', '缺少可複製的事件內容'))
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalizedText)
    return true
  }
  throw new Error(t('settings_admin.logs.copy_unsupported', '目前裝置不支援直接複製'))
}

function buildLogCopyPayload(log) {
  const sections = [
    ['Log ID', log?.id],
    ['Message', log?.message],
    ['Code', log?.code],
    ['User', log?.user_email],
    ['Platform', log?.platform],
    ['Created At', log?.created_at],
    ['Review Status', normalizeReviewStatus(log?.review_status)],
    ['Debug Hint', getLogDebugHint(log)],
    ['Last Step', getLogDebugLastStep(log)],
  ]
    .filter(([, value]) => String(value ?? '').trim())
    .map(([label, value]) => `${label}: ${String(value).trim()}`)

  const debugContext = formatLogDebugContext(log)
  if (debugContext) {
    sections.push(`Debug Context:\n${debugContext}`)
  }
  if (String(log?.stack ?? '').trim()) {
    sections.push(`Stack:\n${String(log.stack).trim()}`)
  }
  return sections.join('\n\n')
}

async function copyLogEvent(log) {
  try {
    await copyTextToClipboard(buildLogCopyPayload(log))
    uiStore.pushToast(t('settings_admin.toast.log_copied', '錯誤事件已複製'))
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? t('settings_admin.toast.log_copy_failed', '複製錯誤事件失敗')), 'error')
  }
}

function userInitials(user) {
  const source = String(user?.display_name || user?.email || '?').trim()
  if (!source) return '?'
  return source.slice(0, 2).toUpperCase()
}

const mergedChartRows = computed(() => {
  const userRows = Array.isArray(overview.value?.charts?.users_by_day) ? overview.value.charts.users_by_day : []
  const errorRows = Array.isArray(overview.value?.charts?.error_logs_by_day) ? overview.value.charts.error_logs_by_day : []
  const rowMap = new Map()

  for (const item of userRows) {
    const date = String(item?.date ?? '').trim()
    if (!date) continue
    rowMap.set(date, {
      ...(rowMap.get(date) ?? { date, users: 0, errors: 0 }),
      users: Number(item?.count ?? 0) || 0,
    })
  }

  for (const item of errorRows) {
    const date = String(item?.date ?? '').trim()
    if (!date) continue
    rowMap.set(date, {
      ...(rowMap.get(date) ?? { date, users: 0, errors: 0 }),
      errors: Number(item?.count ?? 0) || 0,
    })
  }

  return Array.from(rowMap.values())
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .map((row) => ({
      ...row,
      shortDate: formatShortDate(row.date),
    }))
})

const activityColumns = computed(() => {
  const maxUsers = Math.max(1, ...mergedChartRows.value.map((row) => row.users))
  const maxErrors = Math.max(1, ...mergedChartRows.value.map((row) => row.errors))

  return mergedChartRows.value.map((row) => ({
    ...row,
    userHeight: Math.max(row.users > 0 ? 18 : 0, Math.round((row.users / maxUsers) * 100)),
    errorHeight: Math.max(row.errors > 0 ? 12 : 0, Math.round((row.errors / maxErrors) * 100)),
  }))
})

// Map the 7-day error counts into an SVG overlay so the chart keeps adapting as data changes.
const activityChartDots = computed(() => {
  const rows = activityColumns.value
  if (!rows.length) return []

  const chartWidth = CHART_WIDTH - (CHART_PADDING_X * 2)
  const chartHeight = CHART_HEIGHT - (CHART_PADDING_Y * 2)
  const maxErrors = Math.max(1, ...rows.map((row) => row.errors))

  return rows.map((row, index) => {
    const x = CHART_PADDING_X + (rows.length === 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth)
    const y = CHART_PADDING_Y + chartHeight - ((row.errors / maxErrors) * chartHeight)
    return {
      key: `${row.date}-${index}`,
      x,
      y,
    }
  })
})

const activityChartPoints = computed(() => activityChartDots.value.map((point) => `${point.x},${point.y}`).join(' '))

const peakUserRow = computed(() => (
  mergedChartRows.value.reduce((best, row) => (row.users > (best?.users ?? -1) ? row : best), null)
))

const peakErrorRow = computed(() => (
  mergedChartRows.value.reduce((best, row) => (row.errors > (best?.errors ?? -1) ? row : best), null)
))

const insightCards = computed(() => [
  {
    key: 'users-peak',
    label: t('settings_admin.insights.user_peak', '單日新增高峰'),
    value: peakUserRow.value ? `${peakUserRow.value.users}` : '--',
    note: peakUserRow.value ? `${formatShortDate(peakUserRow.value.date)} ${t('settings_admin.chart.new_users', '新用戶')}` : t('settings_admin.analytics.empty', '目前沒有近 7 天的統計資料。'),
    icon: 'fa-solid fa-chart-column',
    tone: 'primary',
  },
  {
    key: 'errors-peak',
    label: t('settings_admin.insights.error_peak', '錯誤高峰日'),
    value: peakErrorRow.value ? `${peakErrorRow.value.errors}` : '--',
    note: peakErrorRow.value ? `${formatShortDate(peakErrorRow.value.date)} ${t('settings_admin.chart.errors', '錯誤')}` : t('settings_admin.analytics.empty', '目前沒有近 7 天的統計資料。'),
    icon: 'fa-solid fa-bug',
    tone: 'warn',
  },
  {
    key: 'coverage',
    label: t('settings_admin.insights.coverage', '會員轉換'),
    value: `${membershipRate.value}%`,
    note: `${formatMetricValue(activeMemberships.value)} / ${formatMetricValue(totalUsers.value)} ${t('settings_admin.stats.active_memberships', '啟用會員')}`,
    icon: 'fa-solid fa-sparkles',
    tone: 'ok',
  },
])

const statCards = computed(() => [
  {
    key: 'total-users',
    label: t('settings_admin.stats.total_users', '總使用者'),
    value: formatMetricValue(totalUsers.value),
    note: `${t('settings_admin.hero.membership_rate', '會員覆蓋率')} ${membershipRate.value}%`,
    icon: 'fa-solid fa-users',
    tone: 'primary',
  },
  {
    key: 'active-memberships',
    label: t('settings_admin.stats.active_memberships', '啟用會員'),
    value: formatMetricValue(activeMemberships.value),
    note: `${reviewedErrorLogs.value > 0 ? `${t('settings_admin.logs.reviewed', '已審核')} ${formatMetricValue(reviewedErrorLogs.value)}` : t('settings_admin.hero.log_review_rate', 'Log 審核率')}`,
    icon: 'fa-solid fa-user-check',
    tone: 'ok',
  },
  {
    key: 'pending-logs',
    label: t('settings_admin.stats.pending_error_logs', '待審核錯誤'),
    value: formatMetricValue(pendingErrorLogs.value),
    note: `${t('settings_admin.health.pending_load', '待處理負載')} ${pendingLogRatio.value}%`,
    icon: 'fa-solid fa-triangle-exclamation',
    tone: 'warn',
  },
  {
    key: 'recent-logs',
    label: t('settings_admin.stats.total_error_logs', '最近錯誤數'),
    value: formatMetricValue(totalErrorLogs.value),
    note: `${t('settings_admin.hero.log_review_rate', 'Log 審核率')} ${reviewCoverage.value}%`,
    icon: 'fa-solid fa-wave-square',
    tone: 'neutral',
  },
])

const latestUserActivity = computed(() => {
  const users = Array.isArray(overview.value?.users) ? overview.value.users : []
  const latest = users.reduce((best, item) => {
    const nextTime = new Date(String(item?.last_login_at ?? '')).getTime()
    if (Number.isNaN(nextTime)) return best
    return nextTime > best ? nextTime : best
  }, 0)
  return latest ? formatDateTime(new Date(latest).toISOString()) : '-'
})

const latestLogActivity = computed(() => {
  const logs = Array.isArray(overview.value?.error_logs) ? overview.value.error_logs : []
  const latest = logs.reduce((best, item) => {
    const nextTime = new Date(String(item?.created_at ?? '')).getTime()
    if (Number.isNaN(nextTime)) return best
    return nextTime > best ? nextTime : best
  }, 0)
  return latest ? formatDateTime(new Date(latest).toISOString()) : '-'
})

const overviewDateRangeLabel = computed(() => {
  if (!mergedChartRows.value.length) return t('settings_admin.health.no_range', '尚無區間資料')
  const first = mergedChartRows.value[0]
  const last = mergedChartRows.value[mergedChartRows.value.length - 1]
  return `${first.shortDate} - ${last.shortDate}`
})

const filteredUsers = computed(() => {
  const users = Array.isArray(overview.value?.users) ? overview.value.users : []
  const keyword = String(searchQuery.value ?? '').trim().toLowerCase()
  if (!keyword) return users
  return users.filter((item) => {
    const membershipText = item.membership_active
      ? `${t('settings_admin.users.membership_active', '啟用中')} active member`
      : `${t('settings_admin.users.membership_inactive', '未啟用')} inactive free`
    const haystack = [
      item.email,
      item.display_name,
      item.membership_source,
      membershipText,
      item.is_admin ? t('settings_admin.users.admin', '管理員') : '',
    ].join(' ').toLowerCase()
    return haystack.includes(keyword)
  })
})

const totalUserPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / MEMBERS_PER_PAGE)))

const paginatedUsers = computed(() => {
  const start = (currentUserPage.value - 1) * MEMBERS_PER_PAGE
  return filteredUsers.value.slice(start, start + MEMBERS_PER_PAGE)
})

const visibleUserStart = computed(() => (
  filteredUsers.value.length ? ((currentUserPage.value - 1) * MEMBERS_PER_PAGE) + 1 : 0
))

const visibleUserEnd = computed(() => (
  filteredUsers.value.length ? visibleUserStart.value + paginatedUsers.value.length - 1 : 0
))

function clampUserPage(value) {
  const numeric = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(numeric)) return currentUserPage.value
  return Math.min(totalUserPages.value, Math.max(1, numeric))
}

function setCurrentUserPage(value) {
  currentUserPage.value = clampUserPage(value)
  pageInput.value = String(currentUserPage.value)
}

function goToPreviousPage() {
  setCurrentUserPage(currentUserPage.value - 1)
}

function goToNextPage() {
  setCurrentUserPage(currentUserPage.value + 1)
}

function jumpToPage() {
  setCurrentUserPage(pageInput.value)
}

async function loadOverview() {
  if (apiUnavailable || !isAdmin.value) return
  loading.value = true
  try {
    overview.value = normalizeOverview(await getAdminOverview())
    setCurrentUserPage(currentUserPage.value)
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '載入管理員資料失敗'), 'error')
  } finally {
    loading.value = false
  }
}

async function reviewLog(logId, reviewStatus) {
  reviewingLogId.value = logId
  try {
    await reviewAdminErrorLog(logId, { reviewStatus })
    uiStore.pushToast(t('settings_admin.toast.log_reviewed', '錯誤 log 已更新'))
    await loadOverview()
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '更新錯誤 log 失敗'), 'error')
  } finally {
    reviewingLogId.value = ''
  }
}

let unsubscribeSession = null

watch(searchQuery, () => {
  setCurrentUserPage(1)
})

watch(filteredUsers, () => {
  setCurrentUserPage(currentUserPage.value)
})

onMounted(() => {
  unsubscribeSession = subscribeSharedLedgerSession((session) => {
    sessionUser.value = session?.user ?? null
  })
  void loadOverview()
})

onUnmounted(() => {
  if (typeof unsubscribeSession === 'function') {
    unsubscribeSession()
  }
})
</script>

<style scoped>
.admin-dashboard {
  gap: 18px;
}

.panel {
  padding: 16px;
}

.dashboard-hero {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
  gap: 18px;
  align-items: stretch;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--primary) 22%, transparent), transparent 48%),
    linear-gradient(145deg, color-mix(in srgb, var(--card) 90%, var(--surface-soft-accent) 10%), color-mix(in srgb, var(--card) 76%, var(--surface-soft-accent) 24%));
  border: 1px solid color-mix(in srgb, var(--primary) 14%, var(--field-border) 86%);
}

.dashboard-hero::after {
  content: '';
  position: absolute;
  inset: auto -44px -44px auto;
  width: 180px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--warn) 24%, transparent), transparent 68%);
  pointer-events: none;
}

.hero-copy,
.hero-orbit {
  position: relative;
  z-index: 1;
}

.hero-copy {
  display: grid;
  gap: 14px;
}

.hero-kicker,
.panel-kicker {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary);
}

.page-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}

.page-head {
  align-items: flex-start;
  gap: 12px;
}

.hero-title-wrap {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.hero-title-wrap h2 {
  margin: 0;
}

.hero-desc {
  margin: 0;
  max-width: 56ch;
}

.hero-actions {
  display: grid;
  gap: 12px;
}

.hero-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--card) 76%, white 24%);
  border: 1px solid color-mix(in srgb, var(--field-border) 78%, var(--primary) 22%);
  font-size: 13px;
  font-weight: 600;
}

.hero-orbit {
  display: grid;
  gap: 12px;
  align-content: center;
}

.orbit-card {
  display: grid;
  gap: 4px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid transparent;
  box-shadow: 0 20px 40px color-mix(in srgb, #00131a 14%, transparent);
}

.orbit-card small {
  color: var(--text-muted);
}

.orbit-card strong {
  font-size: 28px;
  line-height: 1;
}

.orbit-card span {
  color: var(--text-muted);
  font-size: 13px;
}

.orbit-card-primary {
  background: linear-gradient(160deg, color-mix(in srgb, var(--primary) 18%, var(--card) 82%), color-mix(in srgb, var(--card) 92%, white 8%));
  border-color: color-mix(in srgb, var(--primary) 32%, transparent);
}

.orbit-card-warm {
  background: linear-gradient(160deg, color-mix(in srgb, var(--warn) 16%, var(--card) 84%), color-mix(in srgb, var(--card) 92%, #fff 8%));
  border-color: color-mix(in srgb, var(--warn) 34%, transparent);
}

.orbit-card-neutral {
  background: linear-gradient(160deg, color-mix(in srgb, var(--surface-soft-accent) 72%, var(--card) 28%), color-mix(in srgb, var(--card) 88%, var(--surface-muted) 12%));
  border-color: color-mix(in srgb, var(--field-border) 70%, transparent);
}

.stats-grid,
.dashboard-grid,
.content-grid,
.insight-grid,
.health-metrics,
.health-notes {
  display: grid;
  gap: 14px;
}

.stats-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.dashboard-grid,
.content-grid {
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  align-items: start;
}

.stat-card,
.insight-card,
.note-card,
.summary-meta-card {
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--field-border) 82%, transparent);
  background: color-mix(in srgb, var(--card) 90%, var(--surface-soft-accent) 10%);
}

.stat-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
}

.stat-icon-wrap,
.insight-icon {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  font-size: 18px;
}

.stat-copy,
.insight-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.stat-copy strong,
.insight-copy strong {
  font-size: 24px;
  line-height: 1.1;
}

.tone-primary .stat-icon-wrap,
.tone-primary .insight-icon {
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
}

.tone-ok .stat-icon-wrap,
.tone-ok .insight-icon {
  color: var(--ok);
  background: color-mix(in srgb, var(--ok) 16%, transparent);
}

.tone-warn .stat-icon-wrap,
.tone-warn .insight-icon {
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 18%, transparent);
}

.tone-neutral .stat-icon-wrap,
.tone-neutral .insight-icon {
  color: var(--text);
  background: color-mix(in srgb, var(--field-border) 60%, transparent);
}

.panel-head,
.members-head,
.progress-head,
.pagination-row,
.page-jump-row,
.action-row {
  align-items: center;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-head h3 {
  margin: 4px 0 0;
}

.panel-count {
  font-size: 24px;
}

.chart-legend,
.legend-item,
.summary-badges {
  display: flex;
  align-items: center;
  gap: 10px;
}

.legend-item {
  font-size: 13px;
  color: var(--text-muted);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.legend-dot.users {
  background: var(--primary);
}

.legend-dot.errors {
  background: var(--danger, #b42318);
}

.activity-chart-shell {
  display: grid;
  gap: 16px;
}

.activity-chart {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  gap: 10px;
  align-items: end;
  min-height: 220px;
  padding: 22px 0 0;
}

.activity-line {
  position: absolute;
  inset: 0 0 44px 0;
  width: 100%;
  height: calc(100% - 44px);
  pointer-events: none;
}

.error-line {
  fill: none;
  stroke: color-mix(in srgb, var(--danger, #b42318) 72%, #ffb3b8 28%);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.error-dot {
  fill: color-mix(in srgb, var(--danger, #b42318) 76%, white 24%);
  stroke: color-mix(in srgb, var(--card) 70%, white 30%);
  stroke-width: 2;
}

.chart-day {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 8px;
  z-index: 1;
}

.chart-bars {
  display: flex;
  align-items: end;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 160px;
  padding: 0 4px;
}

.chart-bar {
  width: 14px;
  min-height: 2px;
  border-radius: 999px;
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 32%, transparent);
}

.chart-bar.users {
  background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 72%, white 28%), var(--primary));
}

.chart-bar.errors {
  background: linear-gradient(180deg, color-mix(in srgb, var(--danger, #b42318) 62%, #ffb3b8 38%), color-mix(in srgb, var(--danger, #b42318) 88%, black 12%));
}

.chart-label,
.chart-value {
  display: block;
  text-align: center;
}

.chart-label {
  font-weight: 700;
}

.chart-value {
  color: var(--text-muted);
  font-size: 12px;
}

.health-panel {
  display: grid;
  gap: 16px;
}

.health-ring {
  --health-angle: 0deg;
  width: min(220px, 100%);
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at center, var(--card) 54%, transparent 55%),
    conic-gradient(
      from -90deg,
      color-mix(in srgb, var(--primary) 82%, var(--ok) 18%) 0deg,
      color-mix(in srgb, var(--primary) 82%, var(--ok) 18%) var(--health-angle),
      color-mix(in srgb, var(--field-border) 56%, transparent) var(--health-angle),
      color-mix(in srgb, var(--field-border) 56%, transparent) 360deg
    );
}

.health-ring-inner {
  display: grid;
  place-items: center;
  width: 58%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: color-mix(in srgb, var(--card) 88%, white 12%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--field-border) 78%, transparent);
}

.health-ring-inner strong {
  font-size: 34px;
  line-height: 1;
}

.health-ring-inner small {
  text-align: center;
  color: var(--text-muted);
}

.progress-card,
.note-card {
  display: grid;
  gap: 8px;
  padding: 14px;
}

.progress-card {
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--field-border) 80%, transparent);
  background: color-mix(in srgb, var(--card) 92%, var(--surface-soft-accent) 8%);
}

.progress-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.progress-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--field-border) 54%, transparent);
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
}

.progress-fill.tone-primary {
  background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 64%, white 36%), var(--primary));
}

.progress-fill.tone-ok {
  background: linear-gradient(90deg, color-mix(in srgb, var(--ok) 62%, white 38%), var(--ok));
}

.progress-fill.tone-warn {
  background: linear-gradient(90deg, color-mix(in srgb, var(--warn) 76%, white 24%), var(--warn));
}

.user-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 12px;
  align-items: end;
}

.field,
.search-field,
.summary-main,
.summary-meta-grid,
.log-title-wrap,
.log-list {
  display: grid;
  gap: 6px;
}

.page-input {
  width: 100%;
}

.list-summary {
  margin: 0;
}

.user-summary-list {
  display: grid;
  gap: 12px;
}

.user-summary-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--field-border) 78%, transparent);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--primary) 8%, transparent), transparent 34%),
    color-mix(in srgb, var(--card) 92%, var(--surface-soft-accent) 8%);
}

.user-summary-head,
.summary-identity,
.log-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.summary-identity {
  justify-content: flex-start;
  min-width: 0;
}

.user-avatar {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 16px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
}

.summary-main strong,
.summary-main small {
  overflow-wrap: anywhere;
}

.summary-meta-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.summary-meta-card strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}

.pagination-row {
  justify-content: center;
  gap: 12px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-active {
  background: color-mix(in srgb, var(--ok) 15%, transparent);
  color: var(--ok);
}

.status-inactive {
  background: color-mix(in srgb, var(--muted) 16%, transparent);
  color: var(--muted);
}

.status-admin {
  background: color-mix(in srgb, var(--primary) 15%, transparent);
  color: var(--primary);
}

.status-pending {
  background: color-mix(in srgb, var(--warn) 15%, transparent);
  color: var(--warn);
}

.status-reviewed,
.status-linear_created {
  background: color-mix(in srgb, var(--ok) 15%, transparent);
  color: var(--ok);
}

.status-ignored {
  background: color-mix(in srgb, var(--muted) 16%, transparent);
  color: var(--muted);
}

.logs-panel {
  display: grid;
  gap: 14px;
}

.log-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--field-border) 80%, transparent);
  background: color-mix(in srgb, var(--card) 92%, var(--surface-soft-accent) 8%);
}

.log-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: var(--text-muted);
  font-size: 13px;
}

.stack-box {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 82%, #000 18%);
}

.compact {
  margin: 0;
}

.empty-state {
  color: var(--text-muted);
}

.error-text {
  color: var(--danger, #b42318);
}

@media (max-width: 1080px) {
  .dashboard-hero,
  .dashboard-grid,
  .content-grid,
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .hero-orbit {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .hero-orbit,
  .summary-meta-grid,
  .user-toolbar {
    grid-template-columns: 1fr;
  }

  .panel-head,
  .page-head,
  .user-summary-head,
  .summary-identity,
  .log-card-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .chart-legend,
  .hero-pills,
  .summary-badges {
    flex-wrap: wrap;
  }
}

@media (max-width: 640px) {
  .panel {
    padding: 14px;
  }

  .activity-chart {
    grid-template-columns: repeat(auto-fit, minmax(38px, 1fr));
  }

  .chart-bars {
    min-height: 136px;
  }

  .health-ring {
    width: min(180px, 100%);
  }

  .health-ring-inner strong,
  .panel-count,
  .orbit-card strong {
    font-size: 26px;
  }
}
</style>
