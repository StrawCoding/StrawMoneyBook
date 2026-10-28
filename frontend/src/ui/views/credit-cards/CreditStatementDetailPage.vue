<template>
  <HabitatPageShell
    :title="t('credit_statement_detail.title')"
    :kicker="accountName"
    test-id="credit-statement-detail-page"
    :back-to="backTo"
  >
    <p v-if="loading" class="muted">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="warn-text">{{ error }}</p>

    <template v-else-if="detail">
      <section class="habitat-flow-section" data-testid="credit-statement-summary">
        <header class="row panel-head">
          <h3>{{ formatPeriod(detail.statement) }}</h3>
          <span class="status-badge" :class="detail.statement.status">{{ statusLabel(detail.statement.status) }}</span>
        </header>
        <div class="summary-grid">
          <div>
            <small class="muted">{{ t('credit_statement_detail.remaining') }}</small>
            <MoneyText :value-minor="detail.statement.remaining_minor" />
          </div>
          <div>
            <small class="muted">{{ t('credit_statement_detail.paid') }}</small>
            <MoneyText :value-minor="detail.statement.paid_minor" />
          </div>
          <div v-if="detail.statement.due_on">
            <small class="muted">{{ t('credit_cards_page.due_on') }}</small>
            <span>{{ detail.statement.due_on }}</span>
          </div>
          <div v-if="detail.statement.status === 'closed'">
            <small class="muted">{{ t('credit_statement_detail.closing') }}</small>
            <MoneyText :value-minor="detail.statement.closing_balance_minor ?? detail.statement.liability_minor" />
          </div>
        </div>
        <p v-if="detail.statement.status === 'closed'" class="muted tip" data-testid="credit-statement-closed-lock">
          {{ t('credit_statement_detail.closed_hint') }}
        </p>
        <p v-if="detail.statement.overdue" class="warn-text">{{ t('credit_cards_page.overdue') }}</p>
      </section>

      <section class="habitat-flow-section" data-testid="credit-statement-postings">
        <h3>{{ t('credit_statement_detail.postings') }}</h3>
        <p v-if="!detail.postings.length" class="muted">{{ t('credit_statement_detail.no_postings') }}</p>
        <ul v-else class="posting-list">
          <li v-for="row in detail.postings" :key="row.id" class="posting-row">
            <div>
              <strong>{{ row.category_name || row.role }}</strong>
              <small class="muted block">{{ formatPosted(row) }}</small>
            </div>
            <MoneyText :value-minor="Math.abs(Number(row.amount_minor))" tone="expense" />
          </li>
        </ul>
      </section>
    </template>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { loadCreditStatementDetail } from '@/core/services/credit.service'

const props = defineProps({
  accountId: { type: String, default: '' },
  statementId: { type: String, default: '' },
})

const route = useRoute()
const { t } = useI18n()
const ledgerStore = useLedgerStore()

const loading = ref(true)
const error = ref('')
const detail = ref(null)

const resolvedAccountId = computed(() => String(props.accountId || route.params.accountId || ''))
const resolvedStatementId = computed(() => String(props.statementId || route.params.statementId || ''))
const accountName = computed(() => detail.value?.account?.name ?? '')
const backTo = computed(() => ({
  name: 'credit-cards',
  query: resolvedAccountId.value ? { account: resolvedAccountId.value } : undefined,
}))

function formatPeriod(st) {
  return `${String(st.period_start_inclusive).slice(0, 10)} → ${String(st.period_end_exclusive).slice(0, 10)}`
}

function statusLabel(status) {
  if (status === 'closed') return t('credit_cards_page.status_closed')
  if (status === 'open') return t('credit_cards_page.status_open')
  return String(status ?? '')
}

function formatPosted(row) {
  const posted = String(row.posted_at || row.occurred_at || '').slice(0, 16).replace('T', ' ')
  return posted || '—'
}

async function load() {
  loading.value = true
  error.value = ''
  detail.value = null
  try {
    const ledgerId = ledgerStore.activeLedgerId
    if (!ledgerId) throw new Error(t('common.no_ledger_selected'))
    detail.value = await loadCreditStatementDetail(
      ledgerId,
      resolvedAccountId.value,
      resolvedStatementId.value,
    )
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([() => ledgerStore.activeLedgerId, resolvedAccountId, resolvedStatementId], load)
</script>

<style scoped>
.panel-head { align-items: center; justify-content: space-between; gap: 8px; }
.summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.tip { font-size: 12px; margin-top: 8px; }
.warn-text { color: #b45309; }
.status-badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--border) 60%, transparent); }
.status-badge.closed { background: color-mix(in srgb, #64748b 25%, transparent); }
.posting-list { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.posting-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 8px 0; border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.posting-row:first-child { border-top: 0; }
.block { display: block; }
</style>
