<template>
  <article v-if="visible" class="card home-credit-card" data-testid="home-credit-summary">
    <header class="row">
      <h3>{{ t('credit_cards_page.home_card') }}</h3>
      <RouterLink class="btn mini-btn" to="/credit-cards">{{ t('assets_page.view') }}</RouterLink>
    </header>
    <p v-if="!cards.length" class="muted">{{ t('credit_cards_page.empty') }}</p>
    <ul v-else class="list">
      <li v-for="card in cards.slice(0, 3)" :key="card.account.id">
        <div class="row">
          <strong>{{ card.account.name }}</strong>
          <MoneyText :value-minor="card.openRemainingMinor" />
        </div>
        <small v-if="card.nearLimit" class="warn">{{ t('credit_cards_page.near_limit') }}</small>
      </li>
    </ul>
  </article>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useCreditStore } from '@/ui/stores/credit.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const creditStore = useCreditStore()
const ledgerStore = useLedgerStore()
const loaded = ref(false)

const visible = computed(() => creditStore.homeCardEnabled && loaded.value)
const cards = computed(() => creditStore.cards || [])

async function refresh() {
  if (!ledgerStore.activeLedgerId) return
  await creditStore.load()
  loaded.value = true
}

onMounted(refresh)
watch(() => ledgerStore.activeLedgerId, refresh)
</script>

<style scoped>
.home-credit-card { padding: 14px; }
.list { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.warn { color: #b45309; }
.mini-btn { font-size: 12px; }
</style>
