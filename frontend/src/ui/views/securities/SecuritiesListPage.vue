<template>
  <HabitatPageShell
    :title="t('securities_page.title')"
    :kicker="t('securities_page.habitat_hello')"
    test-id="securities-page"
    hello-test-id="securities-page-title"
    back-to="/features"
    stack-class="securities-page"
  >

    <article class="card panel">
      <header class="row panel-head">
        <h3>{{ t('securities_page.summary_title') }}</h3>
        <button
          type="button"
          class="btn primary"
          data-testid="securities-add"
          @click="openCreate"
        >{{ t('securities_page.add') }}</button>
      </header>

      <div class="mode-row" data-testid="securities-unrealized-mode">
        <span class="muted">{{ t('securities_page.unrealized_mode') }}</span>
        <div class="seg">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: securityStore.unrealizedMode === 'market' }"
            @click="setMode('market')"
          >{{ t('securities_page.unrealized_market') }}</button>
          <button
            type="button"
            class="seg-btn"
            :class="{ active: securityStore.unrealizedMode === 'cost' }"
            @click="setMode('cost')"
          >{{ t('securities_page.unrealized_cost') }}</button>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-item">
          <small class="muted">{{ displayValueLabel }}</small>
          <MoneyText :value-minor="securityStore.summary.totalDisplayValueMinor" />
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
              <small class="muted">
                {{ item.symbol }} · {{ assetClassLabel(item.asset_class) }}
                <template v-if="settlementName(item.settlement_account_id)">
                  · {{ settlementName(item.settlement_account_id) }}
                </template>
              </small>
            </div>
            <div class="sec-metrics">
              <MoneyText :value-minor="item.position.displayValueMinor" />
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
      :sheet-class="'sheet securities-sheet'"
      :show-footer="true"
      @close="createOpen = false"
    >
      <label data-testid="securities-create-settlement">
        {{ t('securities_page.settlement_account') }}
        <CustomSelect
          v-model="createForm.settlementAccountId"
          :groups="settlementAccountGroups"
          :placeholder="t('securities_page.settlement_account')"
        />
      </label>
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
        <button
          type="button"
          class="btn primary"
          data-testid="securities-create-save"
          :disabled="creating"
          @click="submitCreate"
        >{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useSecurityStore } from '@/ui/stores/security.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { buildAccountOptionGroups } from '@/ui/utils/account-option-groups'

const { t } = useI18n()
const router = useRouter()
const accountStore = useAccountStore()
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
  settlementAccountId: '',
})

const assetClassOptions = computed(() => [
  { value: 'stock', label: t('securities_page.class.stock') },
  { value: 'etf', label: t('securities_page.class.etf') },
])

const settlementAccountGroups = computed(() => buildAccountOptionGroups(
  accountStore.groups,
  securityStore.candidateAccounts || [],
))

const displayValueLabel = computed(() => (
  securityStore.unrealizedMode === 'cost'
    ? t('securities_page.cost_value')
    : t('securities_page.market_value')
))

const accountNameMap = computed(() => {
  const map = new Map()
  for (const acc of securityStore.candidateAccounts || []) {
    map.set(acc.id, acc.name)
  }
  return map
})

function settlementName(id) {
  return accountNameMap.value.get(String(id || '')) || ''
}

function assetClassLabel(value) {
  return value === 'etf' ? t('securities_page.class.etf') : t('securities_page.class.stock')
}

async function setMode(mode) {
  try {
    await securityStore.setUnrealizedMode(mode)
  } catch (error) {
    uiStore.pushToast(error?.message || String(error), 'error')
  }
}

function openCreate() {
  createForm.symbol = ''
  createForm.name = ''
  createForm.assetClass = 'stock'
  createForm.priceMajor = 0
  createForm.includeInAssets = true
  createForm.settlementAccountId = securityStore.candidateAccounts[0]?.id || ''
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
      name: createForm.name || createForm.symbol,
      assetClass: createForm.assetClass,
      manualPriceMinor: Math.round(Number(createForm.priceMajor || 0) * 100),
      includeInAssets: createForm.includeInAssets,
      settlementAccountId: createForm.settlementAccountId,
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
  await Promise.all([
    accountStore.load?.() || Promise.resolve(),
    securityStore.load(),
  ])
})
</script>

<style scoped>
.securities-page {
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px) + var(--bottom-nav-height, 64px));
  overflow-x: hidden;
}
.page-head { align-items: center; justify-content: space-between; gap: 12px; }
.page-title { display: flex; align-items: center; gap: 8px; margin: 0; min-width: 0; }
.title-icon { color: var(--primary); flex-shrink: 0; }
.panel { padding: 14px; overflow: hidden; }
.panel-head { align-items: center; justify-content: space-between; gap: 8px; }
.mode-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 10px 0;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--input-bg);
}
.seg-btn {
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
}
.seg-btn.active {
  background: color-mix(in srgb, var(--primary) 22%, transparent);
  color: var(--primary);
  font-weight: 600;
}
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
  min-width: 0;
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
  min-width: 0;
}
.sec-main { display: grid; gap: 4px; min-width: 0; }
.sec-main strong, .sec-main small { overflow-wrap: anywhere; }
.sec-metrics { display: grid; gap: 2px; justify-items: end; text-align: right; flex-shrink: 0; }
.form-wrap { gap: 12px; padding-bottom: 8px; }
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
