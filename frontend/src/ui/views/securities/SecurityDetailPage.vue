<template>
  <section class="stack securities-detail-page">
    <header class="row page-head">
      <h2 class="page-title">{{ detail?.security?.name || t('securities_page.detail_title') }}</h2>
      <RouterLink class="btn back-btn" to="/assets/securities">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="detail" class="card panel">
      <p class="muted symbol-line">{{ detail.security.symbol }} · {{ assetClassLabel(detail.security.asset_class) }}</p>
      <div class="summary-grid">
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.qty_label') }}</small>
          <strong>{{ detail.position.quantity }}</strong>
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.invested') }}</small>
          <MoneyText :value-minor="detail.position.investedMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.market_value') }}</small>
          <MoneyText :value-minor="detail.position.marketValueMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.delta') }}</small>
          <MoneyText :value-minor="detail.position.deltaMinor" />
        </div>
      </div>

      <label class="field mt">
        {{ t('securities_page.manual_price') }}
        <div class="row price-row">
          <input v-model.number="priceMajor" class="input" type="number" min="0" step="0.01" />
          <button type="button" class="btn" :disabled="savingPrice" @click="savePrice">{{ t('common.save') }}</button>
        </div>
      </label>

      <button
        type="button"
        class="switch-row mt"
        :class="{ active: includeInAssets }"
        role="checkbox"
        :aria-checked="includeInAssets ? 'true' : 'false'"
        @click="toggleInclude"
      >
        <span>{{ t('account.include_in_assets_label') }}</span>
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </button>
    </article>

    <article v-if="detail" class="card panel">
      <header class="row panel-head">
        <h3>{{ t('securities_page.transactions') }}</h3>
        <div class="row">
          <button type="button" class="btn" @click="openTx('buy')">{{ t('securities_page.buy') }}</button>
          <button type="button" class="btn primary" @click="openTx('sell')">{{ t('securities_page.sell') }}</button>
        </div>
      </header>
      <ul v-if="detail.transactions.length" class="tx-list">
        <li v-for="tx in detail.transactions" :key="tx.id" class="tx-row">
          <div>
            <strong>{{ tx.type === 'sell' ? t('securities_page.sell') : t('securities_page.buy') }}</strong>
            <small class="muted">{{ formatWhen(tx.occurred_at) }}</small>
          </div>
          <div class="tx-metrics">
            <span>{{ t('securities_page.qty', { count: tx.quantity }) }}</span>
            <MoneyText :value-minor="tx.quantity * tx.price_minor" />
            <small class="muted">{{ t('securities_page.fee') }} <MoneyText :value-minor="tx.fee_minor" /></small>
          </div>
        </li>
      </ul>
      <p v-else class="muted">{{ t('securities_page.no_transactions') }}</p>
    </article>

    <InputBottomSheet
      :open="txOpen"
      :title="txForm.type === 'sell' ? t('securities_page.sell') : t('securities_page.buy')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="txOpen = false"
    >
      <label>
        {{ t('securities_page.quantity') }}
        <input v-model.number="txForm.quantity" class="input" type="number" min="1" step="1" />
      </label>
      <label>
        {{ t('securities_page.unit_price') }}
        <input v-model.number="txForm.priceMajor" class="input" type="number" min="0" step="0.01" />
      </label>
      <label>
        {{ t('securities_page.fee') }}
        <input v-model.number="txForm.feeMajor" class="input" type="number" min="0" step="0.01" />
      </label>
      <div class="field-block">
        <span class="field-label">{{ t('securities_page.occurred_at') }}</span>
        <DateTimePickerField
          :date="txForm.date"
          :hour="txForm.hour"
          :minute="txForm.minute"
          @update:date="txForm.date = $event"
          @update:hour="txForm.hour = $event"
          @update:minute="txForm.minute = $event"
        />
      </div>
      <label>
        {{ t('common.note') }}
        <input v-model.trim="txForm.note" class="input" maxlength="120" />
      </label>
      <template #footer>
        <button type="button" class="btn" @click="txOpen = false">{{ t('common.cancel') }}</button>
        <button type="button" class="btn primary" :disabled="savingTx" @click="submitTx">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useSecurityStore } from '@/ui/stores/security.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const props = defineProps({
  id: { type: String, required: true },
})

const { t } = useI18n()
const route = useRoute()
const securityStore = useSecurityStore()
const uiStore = useUiStore()
const savingPrice = ref(false)
const savingTx = ref(false)
const txOpen = ref(false)
const priceMajor = ref(0)
const includeInAssets = ref(true)
const txForm = reactive({
  type: 'buy',
  quantity: 1,
  priceMajor: 0,
  feeMajor: 0,
  date: '',
  hour: 9,
  minute: 0,
  note: '',
})

const detail = computed(() => securityStore.detail)
const securityId = computed(() => String(props.id || route.params.id || '').trim())

function assetClassLabel(value) {
  return value === 'etf' ? t('securities_page.class.etf') : t('securities_page.class.stock')
}

function formatWhen(value) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value ?? '')
  }
}

function toDateInput(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function syncFromDetail() {
  if (!detail.value?.security) return
  priceMajor.value = Number(detail.value.security.manual_price_minor ?? 0) / 100
  includeInAssets.value = Number(detail.value.security.include_in_assets ?? 1) === 1
}

async function reload() {
  await securityStore.loadDetail(securityId.value)
  syncFromDetail()
}

async function savePrice() {
  if (savingPrice.value || !securityId.value) return
  savingPrice.value = true
  try {
    await securityStore.update(securityId.value, {
      manualPriceMinor: Math.round(Number(priceMajor.value || 0) * 100),
    })
    uiStore.pushToast(t('securities_page.price_saved'))
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  } finally {
    savingPrice.value = false
  }
}

async function toggleInclude() {
  includeInAssets.value = !includeInAssets.value
  try {
    await securityStore.update(securityId.value, { includeInAssets: includeInAssets.value })
  } catch (error) {
    includeInAssets.value = !includeInAssets.value
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

function openTx(type) {
  const now = new Date()
  txForm.type = type
  txForm.quantity = 1
  txForm.priceMajor = priceMajor.value || 0
  txForm.feeMajor = 0
  txForm.date = toDateInput(now)
  txForm.hour = now.getHours()
  txForm.minute = now.getMinutes()
  txForm.note = ''
  txOpen.value = true
}

async function submitTx() {
  if (savingTx.value || !securityId.value) return
  savingTx.value = true
  try {
    const occurred = new Date(`${txForm.date}T${String(txForm.hour).padStart(2, '0')}:${String(txForm.minute).padStart(2, '0')}:00`)
    const payload = {
      securityId: securityId.value,
      quantity: Math.trunc(Number(txForm.quantity || 0)),
      priceMinor: Math.round(Number(txForm.priceMajor || 0) * 100),
      feeMinor: Math.round(Number(txForm.feeMajor || 0) * 100),
      occurredAt: occurred.toISOString(),
      note: txForm.note,
    }
    if (txForm.type === 'sell') await securityStore.sell(payload)
    else await securityStore.buy(payload)
    txOpen.value = false
    uiStore.pushToast(t('securities_page.tx_saved'))
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  } finally {
    savingTx.value = false
  }
}

watch(securityId, () => { void reload() }, { immediate: true })
onMounted(() => { void reload() })
</script>

<style scoped>
.page-head { align-items: center; justify-content: space-between; }
.page-title { margin: 0; }
.symbol-line { margin: 0 0 10px; }
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.summary-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: var(--input-bg);
  display: grid;
  gap: 4px;
}
.field { display: grid; gap: 6px; }
.mt { margin-top: 12px; }
.price-row { gap: 8px; align-items: center; }
.panel-head { align-items: center; justify-content: space-between; }
.tx-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.tx-row {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: var(--input-bg);
}
.tx-metrics { display: grid; gap: 2px; justify-items: end; text-align: right; }
.form-wrap { gap: 12px; }
.field-block { display: grid; gap: 6px; }
.field-label { font-size: 13px; font-weight: 600; }
.switch-row {
  width: 100%;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--input-bg);
  color: var(--text);
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.switch-track {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 35%, transparent);
  position: relative;
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 150ms ease;
}
.switch-row.active .switch-track { background: color-mix(in srgb, var(--primary) 70%, transparent); }
.switch-row.active .switch-thumb { transform: translateX(18px); }
</style>
