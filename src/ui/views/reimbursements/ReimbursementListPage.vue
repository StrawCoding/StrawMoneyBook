<template>
  <section class="stack">
    <article class="card panel summary">
      <header class="row">
        <h2>報銷統整</h2>
      </header>
      <div class="row">
        <span class="muted">未報銷金額</span>
        <MoneyText :value-minor="reimbursementStore.pendingTotalMinor" />
      </div>
      <div class="row">
        <span class="muted">已報銷金額</span>
        <MoneyText :value-minor="reimbursementStore.reimbursedTotalMinor" />
      </div>
    </article>

    <article class="card panel">
      <div class="tab-row">
        <button class="btn" :class="{ primary: tab === 'pending' }" @click="tab = 'pending'">未報銷</button>
        <button class="btn" :class="{ primary: tab === 'reimbursed' }" @click="tab = 'reimbursed'">已報銷</button>
      </div>

      <ul class="list">
        <li v-for="tx in activeList" :key="tx.id" class="entry">
          <div class="row">
            <strong>{{ tx.category_name || tx.note || '未命名分類' }}</strong>
            <MoneyText :value-minor="Math.abs(Number(tx.amount_minor ?? 0))" />
          </div>
          <div class="row muted">
            <span>{{ formatTime(tx.occurred_at) }}</span>
            <span>{{ tx.note || '-' }}</span>
          </div>

          <div class="row btn-wrap">
            <button v-if="tab === 'pending'" class="btn primary" @click="openSettle(tx)">標記已報銷</button>
            <button v-else class="btn" @click="markPending(tx.id)">回到未報銷</button>
            <button class="btn danger" @click="markVoid(tx.id)">作廢</button>
          </div>
        </li>

        <li v-if="!activeList.length" class="muted">目前此分頁沒有資料</li>
      </ul>
    </article>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isSettleOpen" class="sheet-mask" @click.self="closeSettle">
          <article class="sheet card">
            <header class="row">
              <h3>報銷完成設定</h3>
              <button class="btn" @click="closeSettle">關閉</button>
            </header>

            <div class="stack form-wrap">
              <label>
                報銷金額（元）
                <input v-model.number="settleForm.amountMajor" type="number" min="0" step="1" class="input" />
              </label>

              <label>
                入帳帳戶
                <CustomSelect v-model="settleForm.accountId" :options="accountStore.accounts" />
              </label>
              <div class="copy-wrap">
                <p class="copy-title">同步複製到其他帳本（可複選）</p>
                <div v-if="copyLedgerOptions.length" class="copy-ledger-list">
                  <label v-for="ledger in copyLedgerOptions" :key="ledger.id" class="copy-ledger-item">
                    <input v-model="settleForm.copyToLedgerIds" class="copy-ledger-check" type="checkbox" :value="ledger.id" />
                    <span class="copy-ledger-mark">✓</span>
                    <span class="copy-ledger-name">{{ ledger.name }}</span>
                  </label>
                </div>
                <p v-else class="muted">目前沒有其他帳本可選</p>
              </div>
            </div>

            <footer class="row">
              <button class="btn" @click="closeSettle">取消</button>
              <button class="btn primary" @click="confirmSettle">確認</button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { isFreeTier } from '@/core/services/membership.service'

const reimbursementStore = useReimbursementStore()
const transactionStore = useTransactionStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()

const tab = ref('pending')
const isSettleOpen = ref(false)
const settleTargetTx = ref(null)
const settleForm = reactive({
  amountMajor: 0,
  accountId: '',
  copyToLedgerIds: [],
})

const activeList = computed(() => {
  return tab.value === 'pending' ? reimbursementStore.pendingItems : reimbursementStore.reimbursedItems
})
const copyLedgerOptions = computed(() => {
  if (isFreeTier()) return []
  return (ledgerStore.ledgers ?? []).filter((item) => item.id !== ledgerStore.activeLedgerId)
})

onMounted(() => {
  reimbursementStore.load()
})

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openSettle(tx) {
  settleTargetTx.value = tx
  settleForm.amountMajor = Math.abs(Number(tx.amount_minor ?? 0)) / 100
  settleForm.accountId = accountStore.accounts[0]?.id ?? ''
  settleForm.copyToLedgerIds = []
  isSettleOpen.value = true
}

function closeSettle() {
  isSettleOpen.value = false
  settleTargetTx.value = null
  settleForm.copyToLedgerIds = []
}

async function confirmSettle() {
  if (!settleTargetTx.value?.id) return

  try {
    const result = await reimbursementStore.settle(settleTargetTx.value.id, {
      amountMinor: Math.round(Number(settleForm.amountMajor ?? 0) * 100),
      accountId: settleForm.accountId,
      occurredAt: new Date().toISOString(),
      note: `報銷入帳（來源交易：${settleTargetTx.value.id}）`,
      copyToLedgerIds: settleForm.copyToLedgerIds,
    })
    await Promise.all([transactionStore.loadRecent(), accountStore.load()])
    const copiedInfo = Number(result?.copiedLedgers ?? 0) > 0 ? `，並複製到 ${result.copiedLedgers} 個帳本` : ''
    if (result?.alreadyExists) {
      uiStore.pushToast(`已標記為報銷，且已有入帳交易${copiedInfo}`)
    } else {
      uiStore.pushToast(`已標記報銷並完成入帳${copiedInfo}`)
    }
    closeSettle()
  } catch (error) {
    uiStore.pushToast(error.message ?? '更新失敗', 'error')
  }
}

async function markPending(txId) {
  try {
    await reimbursementStore.markUnreimbursed(txId)
    await Promise.all([transactionStore.loadRecent(), accountStore.load()])
    uiStore.pushToast('已移回未報銷')
  } catch (error) {
    uiStore.pushToast(error.message ?? '更新失敗', 'error')
  }
}

async function markVoid(txId) {
  const ok = window.confirm('確定要作廢這筆報銷交易？')
  if (!ok) return

  try {
    await transactionStore.deleteTransaction(txId)
    await reimbursementStore.load()
    uiStore.pushToast('報銷交易已作廢')
  } catch (error) {
    uiStore.pushToast(error.message ?? '作廢失敗', 'error')
  }
}
</script>

<style scoped>.panel {
  padding: 14px
}
h2 {
  margin: 0
}
.tab-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.entry {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 8px
}
.btn-wrap {
  justify-content: flex-end
}
.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 70
}
.sheet {
  width: min(900px, 100vw);
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height))
}
.form-wrap {
  margin-top: 12px
}
.copy-wrap {
  display: grid;
  gap: 8px
}
.copy-title {
  margin: 0;
  font-size: 13px;
  color: var(--muted)
}
.copy-ledger-list {
  display: grid;
  gap: 8px;
  max-height: 128px;
  overflow: auto;
  padding-right: 2px
}
.copy-ledger-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--text);
  padding: 10px 12px;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-soft-accent) 12%);
  cursor: pointer;
  transition: border-color var(--anim-fast) ease, background-color var(--anim-fast) ease, box-shadow var(--anim-fast) ease
}
.copy-ledger-item:has(.copy-ledger-check:checked) {
  border-color: color-mix(in srgb, var(--primary) 55%, var(--field-border) 45%);
  background: color-mix(in srgb, var(--primary) 14%, var(--card) 86%);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 24%, transparent) inset;
}
.copy-ledger-check {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.copy-ledger-mark {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid var(--field-border);
  background: color-mix(in srgb, var(--card) 90%, transparent);
  color: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  flex-shrink: 0;
}
.copy-ledger-item:has(.copy-ledger-check:checked) .copy-ledger-mark {
  background: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 70%, black 30%);
  color: var(--primary-contrast);
}
.copy-ledger-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
</style>
