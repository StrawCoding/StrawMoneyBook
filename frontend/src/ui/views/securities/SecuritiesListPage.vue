<template>
  <section class="stack securities-page">
    <header class="row page-head">
      <h2 class="page-title">
        <font-awesome-icon icon="fa-solid fa-chart-line" class="title-icon" />
        {{ t('securities_page.title') }}
      </h2>
      <RouterLink class="btn back-btn" to="/assets">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <header class="row panel-head">
        <h3>{{ t('securities_page.summary_title') }}</h3>
        <button type="button" class="btn primary" @click="openCreate">{{ t('securities_page.add') }}</button>
      </header>
      <div class="summary-grid">
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.market_value') }}</small>
          <MoneyText :value-minor="securityStore.summary.totalMarketValueMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.invested') }}</small>
          <MoneyText :value-minor="securityStore.summary.totalInvestedMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.delta') }}</small>
          <MoneyText :value-minor="securityStore.summary.totalDeltaMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('securities_page.included_market_value') }}</small>
          <MoneyText :value-minor="securityStore.summary.includedMarketValueMinor" />
        </div>
      </div>
    </article>

    <article class="card panel">
      <ul v-if="securityStore.items.length" class="sec-list">
        <li v-for="item in securityStore.items" :key="item.id">
          <button type="button" class="sec-row" @click="openDetail(item.id)">
            <div class="sec-main">
              <strong>{{ item.name }}</strong>
              <small class="muted">{{ item.symbol }} · {{ assetClassLabel(item.asset_class) }}</small>
            </div>
            <div class="sec-metrics">
              <MoneyText :value-minor="item.position.marketValueMinor" />
              <small class="muted">{{ t('securities_page.qty', { count: item.position.quantity }) }}</small>
            </div>
          </button>
        </li>
      </ul>
      <p v-else class="muted">{{ t('securities_page.empty') }}</p>
    </article>

    <InputBottomSheet
      :open="createOpen"
      :title="t('securities_page.add')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="createOpen = false"
    >
      <label>
        {{ t('securities_page.symbol') }}
        <input v-model.trim="createForm.symbol" class="input" maxlength="20" placeholder="2330" />
      </label>
      <label>
        {{ t('securities_page.name') }}
        <input v-model.trim="createForm.name" class="input" maxlength="80" placeholder="台積電" />
      </label>
      <label>
        {{ t('securities_page.asset_class') }}
        <CustomSelect v-model="createForm.assetClass" :options="assetClassOptions" />
      </label>
      <label>
        {{ t('securities_page.manual_price') }}
        <input v-model.number="createForm.priceMajor" class="input" type="number" min="0" step="0.01" />
      </label>
      <button
        type="button"
        class="switch-row"
        :class="{ active: createForm.includeInAssets }"
        role="checkbox"
        :aria-checked="createForm.includeInAssets ? 'true' : 'false'"
        @click="createForm.includeInAssets = !createForm.includeInAssets"
      >
        <span>{{ t('account.include_in_assets_label') }}</span>
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </button>
      <template #footer>
        <button type="button" class="btn" @click="createOpen = false">{{ t('common.cancel') }}</button>
        <button type="button" class="btn primary" :disabled="creating" @click="submitCreate">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useSecurityStore } from '@/ui/stores/security.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const router = useRouter()
const securityStore = useSecurityStore()
const uiStore = useUiStore()
const createOpen = ref(false)
const creating = ref(false)
const createForm = reactive({
  symbol: '',
  name: '',
  assetClass: 'stock',
  priceMajor: 0,
  includeInAssets: true,
})

const assetClassOptions = computed(() => [
  { value: 'stock', label: t('securities_page.class.stock') },
  { value: 'etf', label: t('securities_page.class.etf') },
])

function assetClassLabel(value) {
  return value === 'etf' ? t('securities_page.class.etf') : t('securities_page.class.stock')
}

function openCreate() {
  createForm.symbol = ''
  createForm.name = ''
  createForm.assetClass = 'stock'
  createForm.priceMajor = 0
  createForm.includeInAssets = true
  createOpen.value = true
}

function openDetail(id) {
  router.push(`/assets/securities/${id}`)
}

async function submitCreate() {
  if (creating.value) return
  creating.value = true
  try {
    const result = await securityStore.create({
      symbol: createForm.symbol,
      name: createForm.name,
      assetClass: createForm.assetClass,
      manualPriceMinor: Math.round(Number(createForm.priceMajor || 0) * 100),
      includeInAssets: createForm.includeInAssets,
    })
    createOpen.value = false
    uiStore.pushToast(t('securities_page.created'))
    if (result?.security?.id) openDetail(result.security.id)
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  await securityStore.load()
})
</script>

<style scoped>
.page-head { align-items: center; justify-content: space-between; }
.page-title { display: flex; align-items: center; gap: 8px; margin: 0; }
.title-icon { color: var(--primary); }
.panel-head { align-items: center; justify-content: space-between; }
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}
.summary-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 4px;
  background: var(--input-bg);
}
.sec-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.sec-row {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--input-bg);
  color: var(--text);
  padding: 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  cursor: pointer;
}
.sec-main, .sec-metrics { display: grid; gap: 2px; }
.sec-metrics { text-align: right; justify-items: end; }
.form-wrap { gap: 12px; }
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
