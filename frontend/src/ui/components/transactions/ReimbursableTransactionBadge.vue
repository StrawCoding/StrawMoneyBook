<template>
  <span
    v-if="variant"
    class="tx-reimbursable-badge"
    :class="{ 'tx-reimbursable-badge--settled': variant === 'settled' }"
    data-testid="tx-reimbursable-badge"
  >{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'
import { reimbursableTransactionBadgeVariant } from '@/ui/utils/reimbursable-transaction'

const props = defineProps({
  tx: {
    type: Object,
    required: true,
  },
})

const { t } = useI18n()
const variant = computed(() => reimbursableTransactionBadgeVariant(props.tx))
const label = computed(() => (
  variant.value === 'settled'
    ? t('home_tx.reimbursable_badge_settled')
    : t('home_tx.reimbursable_badge')
))
</script>
