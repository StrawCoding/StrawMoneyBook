<template>
  <article
    ref="rootEl"
    id="analysis-report-document"
    class="analysis-report-document analysis-report-light-scope"
    data-testid="analysis-report-document"
    data-export-color-scheme="light"
  >
    <header class="report-header" data-testid="analysis-report-header">
      <div>
        <h2>{{ title }}</h2>
        <p class="meta-line">{{ ledgerName }}</p>
      </div>
      <div class="meta-grid">
        <div><span class="meta-label">{{ labels.period }}</span><strong>{{ periodLabel }}</strong></div>
        <div><span class="meta-label">{{ labels.exportedAt }}</span><strong>{{ exportedAtLabel }}</strong></div>
        <div><span class="meta-label">{{ labels.currency }}</span><strong>{{ currencyCode }}</strong></div>
        <div v-if="filterLabel"><span class="meta-label">{{ labels.filters }}</span><strong>{{ filterLabel }}</strong></div>
      </div>
    </header>

    <section class="big-numbers" data-testid="analysis-report-big-numbers">
      <article class="big-card income">
        <small>{{ labels.income }}</small>
        <MoneyText :value-minor="incomeTotalMinor" tone="income" />
      </article>
      <article class="big-card expense">
        <small>{{ labels.expense }}</small>
        <MoneyText :value-minor="expenseTotalMinor" tone="expense" />
      </article>
      <article class="big-card balance">
        <small>{{ labels.balance }}</small>
        <MoneyText :value-minor="balanceMinor" :tone="balanceMinor >= 0 ? 'income' : 'expense'" />
      </article>
    </section>

    <AnalysisIconizedChartPair
      v-if="incomeItems.length"
      :title="labels.incomeAnalysis"
      :total-label="labels.incomeTotal"
      :total-minor="incomeTotalMinor"
      :count="incomeCount"
      :items="incomeItems"
      tone="income"
      test-id="analysis-report-income-charts"
    />

    <AnalysisIconizedChartPair
      v-if="expenseItems.length"
      :title="labels.expenseAnalysis"
      :total-label="labels.expenseTotal"
      :total-minor="expenseTotalMinor"
      :count="expenseCount"
      :items="expenseItems"
      tone="expense"
      test-id="analysis-report-expense-charts"
    />

    <section
      v-if="budgetCards.length"
      class="budget-section"
      data-testid="analysis-report-budget-cards"
    >
      <header class="section-head">
        <h3>{{ labels.budgetAchievement }}</h3>
      </header>
      <div class="budget-grid">
        <article
          v-for="card in budgetCards"
          :key="card.id"
          class="budget-card"
          :class="{ over: card.isOver }"
        >
          <div class="budget-card-head">
            <span class="icon-swatch" :style="{ background: card.isOver ? '#fa5252' : '#4dabf7' }">
              <font-awesome-icon v-if="card.icon" :icon="card.icon" class="swatch-icon" />
            </span>
            <strong>{{ card.name }}</strong>
            <span class="muted">{{ card.percent }}%</span>
          </div>
          <div class="budget-track">
            <span
              class="budget-fill"
              :style="{ width: `${Math.min(100, card.percent)}%` }"
            />
          </div>
          <div class="budget-stats">
            <span>{{ labels.spent }} <MoneyText :value-minor="card.spentMinor" tone="expense" /></span>
            <span>{{ labels.budget }} <MoneyText :value-minor="card.budgetMinor" /></span>
          </div>
        </article>
      </div>
    </section>

    <AnalysisIconizedChartPair
      v-if="accountItems.length"
      :title="labels.accountShare"
      :total-label="labels.accountTotal"
      :total-minor="accountTotalMinor"
      :count="accountCount"
      :items="accountItems"
      test-id="analysis-report-account-charts"
    />

    <section
      v-if="detailRows.length"
      class="table-section"
      data-testid="analysis-report-detail-table"
    >
      <header class="section-head">
        <h3>{{ labels.details }}</h3>
        <span class="muted">{{ t('analysis_page.items_count', { count: detailRows.length }) }}</span>
      </header>
      <div class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>{{ labels.colDate }}</th>
              <th>{{ labels.colType }}</th>
              <th>{{ labels.colCategory }}</th>
              <th>{{ labels.colAccount }}</th>
              <th>{{ labels.colAmount }}</th>
              <th>{{ labels.colNote }}</th>
              <th>{{ labels.colTags }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in detailRows" :key="row.id">
              <td>{{ row.date }}</td>
              <td>{{ row.type }}</td>
              <td>
                <span class="cell-with-icon">
                  <span class="icon-swatch neutral">
                    <font-awesome-icon v-if="row.categoryIcon" :icon="row.categoryIcon" class="swatch-icon" />
                  </span>
                  <span>{{ row.categoryName }}</span>
                </span>
              </td>
              <td>
                <span class="cell-with-icon">
                  <span class="icon-swatch neutral">
                    <font-awesome-icon v-if="row.accountIcon" :icon="row.accountIcon" class="swatch-icon" />
                  </span>
                  <span>{{ row.accountName }}</span>
                </span>
              </td>
              <td class="amount-cell">
                <MoneyText :value-minor="row.amountMinor" :tone="row.typeKey" />
              </td>
              <td>{{ row.note || '—' }}</td>
              <td>{{ row.tagsText || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import AnalysisIconizedChartPair from '@/ui/components/analysis/AnalysisIconizedChartPair.vue'
import { applyAnalysisReportLightThemeInline } from '@/core/utils/analysis-report-light-theme'
import { useI18n } from '@/ui/services/i18n.service'

const props = defineProps({
  title: { type: String, default: '' },
  ledgerName: { type: String, default: '' },
  periodLabel: { type: String, default: '' },
  exportedAtLabel: { type: String, default: '' },
  currencyCode: { type: String, default: 'TWD' },
  filterLabel: { type: String, default: '' },
  incomeItems: { type: Array, default: () => [] },
  expenseItems: { type: Array, default: () => [] },
  accountItems: { type: Array, default: () => [] },
  budgetCards: { type: Array, default: () => [] },
  detailRows: { type: Array, default: () => [] },
  incomeTotalMinor: { type: Number, default: 0 },
  expenseTotalMinor: { type: Number, default: 0 },
  incomeCount: { type: Number, default: 0 },
  expenseCount: { type: Number, default: 0 },
  accountTotalMinor: { type: Number, default: 0 },
  accountCount: { type: Number, default: 0 },
})

const { t } = useI18n()
const rootEl = ref(null)

const balanceMinor = computed(() => props.incomeTotalMinor - props.expenseTotalMinor)
const labels = computed(() => ({
  period: t('analysis_print.meta.period'),
  exportedAt: t('analysis_print.meta.exported_at'),
  currency: t('analysis_print.meta.currency'),
  filters: t('analysis_print.meta.filters'),
  income: t('analysis_page.type.income'),
  expense: t('analysis_page.type.expense'),
  balance: t('analysis_print.summary.balance'),
  incomeAnalysis: t('analysis_page.type_analysis', { type: t('analysis_page.type.income') }),
  expenseAnalysis: t('analysis_page.type_analysis', { type: t('analysis_page.type.expense') }),
  incomeTotal: t('analysis_page.type_total', { type: t('analysis_page.type.income') }),
  expenseTotal: t('analysis_page.type_total', { type: t('analysis_page.type.expense') }),
  budgetAchievement: t('analysis_print.budget_achievement'),
  spent: t('analysis_print.budget_spent'),
  budget: t('analysis_print.budget_limit'),
  accountShare: t('analysis_print.account_share'),
  accountTotal: t('analysis_page.type_total', { type: t('analysis_page.scope.account') }),
  details: t('analysis_print.details_title'),
  colDate: t('analysis_print.col.date'),
  colType: t('analysis_print.col.type'),
  colCategory: t('analysis_print.col.category'),
  colAccount: t('analysis_print.col.account'),
  colAmount: t('analysis_print.col.amount'),
  colNote: t('analysis_print.col.note'),
  colTags: t('analysis_print.col.tags'),
}))

onMounted(() => {
  // Beat App Dark mode CSS variables / color-scheme inheritance for export preview.
  applyAnalysisReportLightThemeInline(rootEl.value, { important: true })
})

defineExpose({
  rootEl,
  getElement: () => rootEl.value,
})
</script>

<style scoped>
.analysis-report-document {
  color-scheme: light;
  --bg: #ffffff;
  --bg-soft: #f8fafc;
  --card: #ffffff;
  --card-elevated: #ffffff;
  --text: #0f172a;
  --text-soft: #334155;
  --muted: #64748b;
  --field-border: #dbe3f0;
  --border: #dbe3f0;
  --border-strong: #cbd5e1;
  --surface-soft-accent: #eef4ff;
  --surface-muted: #f1f5f9;
  --chart-track: #e2e8f0;
  --income-dark: #059669;
  --expense-dark: #dc2626;
  --income-light: #d1fae5;
  --expense-light: #fee2e2;
  --primary: #2563eb;
  --btn-bg: #ffffff;
  --input-bg: #ffffff;
  color: #0f172a;
  background: #ffffff;
  border: 1px solid #dbe3f0;
  border-radius: 18px;
  padding: 18px;
  display: grid;
  gap: 16px;
  width: min(794px, 100%);
  margin: 0 auto;
  box-sizing: border-box;
}

.report-header,
.section-head,
.budget-card-head,
.budget-stats,
.cell-with-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-header,
.section-head,
.budget-stats {
  justify-content: space-between;
}

.report-header h2,
.section-head h3 {
  margin: 0;
}

.meta-line {
  margin: 6px 0 0;
  color: var(--muted);
}

.meta-grid {
  display: grid;
  gap: 6px;
  min-width: 220px;
  font-size: 12px;
}

.meta-label {
  display: block;
  color: var(--muted);
  margin-bottom: 2px;
}

.big-numbers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.big-card {
  border: 1px solid var(--field-border);
  border-radius: 14px;
  padding: 14px;
  display: grid;
  gap: 8px;
  background: #f8fafc;
}

.big-card.income {
  background: linear-gradient(180deg, #ecfdf3 0%, #ffffff 100%);
}

.big-card.expense {
  background: linear-gradient(180deg, #fff1f2 0%, #ffffff 100%);
}

.big-card small {
  color: var(--muted);
}

.budget-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.budget-card {
  border: 1px solid var(--field-border);
  border-radius: 14px;
  padding: 12px;
  display: grid;
  gap: 8px;
  background: #f8fafc;
}

.budget-card.over {
  border-color: #fda4af;
}

.budget-track {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: #e2e8f0;
}

.budget-fill {
  display: block;
  height: 100%;
  background: #4dabf7;
}

.budget-card.over .budget-fill {
  background: #fa5252;
}

.icon-swatch {
  width: 22px;
  height: 22px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: #fff;
}

.icon-swatch.neutral {
  background: #64748b;
}

.swatch-icon {
  width: 12px;
  height: 12px;
}

.table-wrap {
  overflow: auto;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.report-table th,
.report-table td {
  border: 1px solid var(--field-border);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}

.report-table th {
  background: #f1f5f9;
}

.amount-cell {
  white-space: nowrap;
}

@media (max-width: 720px) {
  .big-numbers,
  .budget-grid,
  .report-header {
    grid-template-columns: 1fr;
    display: grid;
  }

  .meta-grid {
    min-width: 0;
  }
}

/* PDF / print capture: force A4 desktop layout even on narrow viewports */
.analysis-report-document[data-print-layout='a4'] {
  width: 794px;
  max-width: 794px;
  min-width: 794px;
}

.analysis-report-document[data-print-layout='a4'] .big-numbers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.analysis-report-document[data-print-layout='a4'] .budget-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.analysis-report-document[data-print-layout='a4'] .report-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.analysis-report-document[data-print-layout='a4'] .meta-grid {
  min-width: 220px;
}

.analysis-report-document[data-print-layout='a4'] .table-wrap {
  overflow: visible;
}

.analysis-report-document[data-print-layout='a4'] .report-table {
  table-layout: fixed;
  width: 100%;
}
</style>
