<template>
  <span
    v-if="visible"
    class="tx-reimbursable-badge"
    data-testid="tx-reimbursable-badge"
  >{{ t('home_tx.reimbursable_badge') }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'
import { isPendingReimbursableTransaction } from '@/ui/utils/reimbursable-transaction'

const props = defineProps({
  tx: {
    type: Object,
    required: true,
  },
})

const { t } = useI18n()
const visible = computed(() => isPendingReimbursableTransaction(props.tx))
</script>
