<template>
  <section class="stack">
    <article class="card panel">
      <header class="row page-head">
        <h2>{{ t('settings_admin.title', '管理員平台') }}</h2>
        <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
      </header>
      <p class="muted">
        {{ t('settings_admin.desc', '查看使用者、會員狀態與錯誤 log，並執行基本管理操作。') }}
      </p>
      <p v-if="apiUnavailable" class="muted error-text">{{ apiUnavailableMessage }}</p>
      <p v-else-if="!isAdmin" class="muted error-text">{{ t('settings_admin.not_allowed', '你目前沒有管理員權限。') }}</p>
      <div v-else class="row action-row">
        <button class="btn" :disabled="loading" :aria-busy="loading" @click="loadOverview">
          {{ loading ? t('common.loading', '載入中...') : t('common.refresh', '重新整理') }}
        </button>
      </div>
    </article>

    <template v-if="!apiUnavailable && isAdmin">
      <article class="card panel stats-grid">
        <div class="stat-card">
          <small class="muted">{{ t('settings_admin.stats.total_users', '總使用者') }}</small>
          <strong>{{ overview.stats.total_users }}</strong>
        </div>
        <div class="stat-card">
          <small class="muted">{{ t('settings_admin.stats.active_memberships', '啟用會員') }}</small>
          <strong>{{ overview.stats.active_memberships }}</strong>
        </div>
        <div class="stat-card">
          <small class="muted">{{ t('settings_admin.stats.pending_error_logs', '待審核錯誤') }}</small>
          <strong>{{ overview.stats.pending_error_logs }}</strong>
        </div>
        <div class="stat-card">
          <small class="muted">{{ t('settings_admin.stats.total_error_logs', '最近錯誤數') }}</small>
          <strong>{{ overview.stats.total_error_logs }}</strong>
        </div>
      </article>

      <article class="card panel">
        <header class="section-head">
          <h3>{{ t('settings_admin.chart.users', '近 7 天使用者 / 錯誤') }}</h3>
        </header>
        <div class="chart-list">
          <div v-for="row in mergedChartRows" :key="row.date" class="chart-row">
            <span class="chart-label">{{ row.date }}</span>
            <div class="chart-bars">
              <div class="chart-track">
                <div class="chart-fill users" :style="{ width: `${row.userWidth}%` }"></div>
              </div>
              <small>{{ t('settings_admin.chart.new_users', '新用戶') }} {{ row.users }}</small>
            </div>
            <div class="chart-bars">
              <div class="chart-track">
                <div class="chart-fill errors" :style="{ width: `${row.errorWidth}%` }"></div>
              </div>
              <small>{{ t('settings_admin.chart.errors', '錯誤') }} {{ row.errors }}</small>
            </div>
          </div>
        </div>
      </article>

      <article class="card panel">
        <header class="section-head user-section-head">
          <h3>{{ t('settings_admin.users.title', '使用者管理') }}</h3>
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
              <div class="summary-main">
                <strong>{{ item.display_name || item.email }}</strong>
                <small class="muted">{{ item.email }}</small>
              </div>
              <span class="status-chip" :class="item.membership_active ? 'status-active' : 'status-inactive'">
                {{ membershipLabel(item) }}
              </span>
            </div>
            <div class="summary-meta">
              <small class="muted">{{ t('settings_admin.users.last_login', '最後登入') }}：{{ formatDateTime(item.last_login_at) }}</small>
              <small class="muted">{{ t('settings_admin.users.membership_expiry', '會員到期') }}：{{ formatDateTime(item.membership_bonus_expires_at) }}</small>
              <small v-if="item.is_admin" class="muted">{{ t('settings_admin.users.admin', '管理員') }}</small>
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

      <article class="card panel">
        <header class="section-head">
          <h3>{{ t('settings_admin.logs.title', '錯誤 Log') }}</h3>
        </header>
        <div v-if="!overview.error_logs.length" class="muted">{{ t('settings_admin.logs.empty', '目前沒有錯誤 log。') }}</div>
        <div v-for="log in overview.error_logs" :key="log.id" class="log-card">
          <div class="row log-head">
            <strong>{{ log.message }}</strong>
            <span class="status-chip" :class="`status-${log.review_status}`">{{ reviewLabel(log.review_status) }}</span>
          </div>
          <small class="muted">{{ log.user_email || '-' }} · {{ log.platform || '-' }} · {{ formatDateTime(log.created_at) }}</small>
          <p class="muted compact">{{ log.code || t('settings_admin.logs.no_code', '無錯誤碼') }}</p>
          <pre v-if="log.stack" class="stack-box">{{ log.stack }}</pre>
          <div class="row action-row">
            <button class="btn" :disabled="reviewingLogId === log.id" @click="reviewLog(log.id, 'reviewed')">
              {{ t('settings_admin.logs.mark_reviewed', '標記已審核') }}
            </button>
            <button class="btn" :disabled="reviewingLogId === log.id" @click="reviewLog(log.id, 'ignored')">
              {{ t('settings_admin.logs.ignore', '忽略') }}
            </button>
          </div>
        </div>
      </article>
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
const overview = ref({
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
})

const isAdmin = computed(() => Boolean(sessionUser.value?.is_admin))

function formatDateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString(locale.value)
}

function membershipLabel(user) {
  if (user?.membership_active) {
    return t('settings_admin.users.membership_active', '啟用中')
  }
  return t('settings_admin.users.membership_inactive', '未啟用')
}

function reviewLabel(status) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'reviewed') return t('settings_admin.logs.reviewed', '已審核')
  if (normalized === 'ignored') return t('settings_admin.logs.ignored', '已忽略')
  if (normalized === 'linear_created') return t('settings_admin.logs.linear_created', '已建 Linear')
  return t('settings_admin.logs.pending', '待審核')
}

const mergedChartRows = computed(() => {
  const users = Array.isArray(overview.value?.charts?.users_by_day) ? overview.value.charts.users_by_day : []
  const errors = Array.isArray(overview.value?.charts?.error_logs_by_day) ? overview.value.charts.error_logs_by_day : []
  const rows = users.map((item, index) => ({
    date: item.date,
    users: Number(item.count ?? 0) || 0,
    errors: Number(errors[index]?.count ?? 0) || 0,
  }))
  const maxUsers = Math.max(1, ...rows.map((item) => item.users))
  const maxErrors = Math.max(1, ...rows.map((item) => item.errors))
  return rows.map((item) => ({
    ...item,
    userWidth: Math.round((item.users / maxUsers) * 100),
    errorWidth: Math.round((item.errors / maxErrors) * 100),
  }))
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
    overview.value = await getAdminOverview()
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
.panel {
  padding: 14px;
}
.page-head,
.section-head,
.log-head {
  align-items: center;
}
.action-row {
  gap: 8px;
  flex-wrap: wrap;
}
.field {
  display: grid;
  gap: 6px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.stat-card {
  display: grid;
  gap: 4px;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 12px;
}
.user-section-head {
  margin-bottom: 12px;
}
.user-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 12px;
  align-items: end;
}
.search-field {
  min-width: 0;
}
.page-jump-row {
  gap: 8px;
}
.page-input {
  width: 100%;
}
.list-summary {
  margin: 12px 0 0;
}
.user-summary-list {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}
.user-summary-card {
  display: grid;
  gap: 10px;
  border: 1px solid var(--field-border);
  border-radius: 14px;
  padding: 14px;
  background: color-mix(in srgb, var(--card) 92%, var(--surface-soft-accent) 8%);
}
.user-summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.summary-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.summary-main strong,
.summary-main small {
  overflow-wrap: anywhere;
}
.summary-meta {
  display: grid;
  gap: 4px;
}
.pagination-row {
  margin-top: 12px;
  justify-content: center;
  align-items: center;
}
.status-active {
  background: color-mix(in srgb, var(--ok) 15%, transparent);
  color: var(--ok);
}
.status-inactive {
  background: color-mix(in srgb, var(--muted) 16%, transparent);
  color: var(--muted);
}
.chart-list {
  display: grid;
  gap: 10px;
}
.chart-row {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
.chart-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted) 14%, transparent);
  overflow: hidden;
}
.chart-fill {
  height: 100%;
  border-radius: 999px;
}
.chart-fill.users {
  background: var(--primary);
}
.chart-fill.errors {
  background: var(--danger, #b42318);
}
.chart-bars {
  display: grid;
  gap: 4px;
}
.log-card {
  display: grid;
  gap: 8px;
  padding: 12px 0;
}
.log-card + .log-card {
  border-top: 1px solid var(--field-border);
}
.status-chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
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
.stack-box {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  padding: 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 82%, #000 18%);
}
.error-text {
  color: var(--danger, #b42318);
}
@media (max-width: 720px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  .user-toolbar {
    grid-template-columns: 1fr;
  }
  .chart-row {
    grid-template-columns: 1fr;
  }
  .user-summary-head {
    flex-direction: column;
  }
}
</style>
