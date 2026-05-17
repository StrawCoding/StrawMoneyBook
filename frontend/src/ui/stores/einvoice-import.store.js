import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { EINVOICE_STATUS } from '@/services/einvoice/shared.js'

export const useEInvoiceImportStore = defineStore('einvoiceImport', () => {
  // ── Wizard state ────────────────────────────────────────────────────────────
  const currentStep = ref(1)

  // Step 1: account
  const phone = ref('')
  const password = ref('')
  const rememberCredentials = ref(true)

  // Step 2: query conditions
  const dateFrom = ref('')
  const dateTo = ref('')
  const selectedCarrier = ref('all')
  const invoiceStatus = ref(EINVOICE_STATUS.ALL)
  const buyerTaxId = ref('')
  const keyword = ref('')

  // Step 3: scraped list & selection
  const invoiceList = ref([])
  const selectedInvoiceNumbers = ref(new Set())

  // Step 4: import results & optional transaction creation
  const importResult = ref(null)
  const defaultAccountId = ref('')
  const defaultCategoryId = ref('')

  // ── Loading / error ─────────────────────────────────────────────────────────
  const isScraping = ref(false)
  const isImporting = ref(false)
  const errorMessage = ref('')

  // ── Computed ────────────────────────────────────────────────────────────────
  const selectedInvoices = computed(() =>
    invoiceList.value.filter((inv) => selectedInvoiceNumbers.value.has(inv.invoiceNumber)),
  )

  const totalSelectedAmount = computed(() =>
    selectedInvoices.value.reduce((sum, inv) => sum + inv.amount, 0),
  )

  const allSelected = computed(
    () => invoiceList.value.length > 0 && selectedInvoiceNumbers.value.size === invoiceList.value.length,
  )

  // ── Actions ─────────────────────────────────────────────────────────────────
  function toggleSelectAll() {
    if (allSelected.value) {
      selectedInvoiceNumbers.value = new Set()
    } else {
      selectedInvoiceNumbers.value = new Set(invoiceList.value.map((inv) => inv.invoiceNumber))
    }
  }

  function toggleSelect(invoiceNumber) {
    const next = new Set(selectedInvoiceNumbers.value)
    if (next.has(invoiceNumber)) {
      next.delete(invoiceNumber)
    } else {
      next.add(invoiceNumber)
    }
    selectedInvoiceNumbers.value = next
  }

  function setInvoiceList(list) {
    invoiceList.value = list
    selectedInvoiceNumbers.value = new Set()
  }

  function reset() {
    currentStep.value = 1
    phone.value = ''
    password.value = ''
    rememberCredentials.value = true
    dateFrom.value = ''
    dateTo.value = ''
    selectedCarrier.value = 'all'
    invoiceStatus.value = EINVOICE_STATUS.ALL
    buyerTaxId.value = ''
    keyword.value = ''
    invoiceList.value = []
    selectedInvoiceNumbers.value = new Set()
    importResult.value = null
    defaultAccountId.value = ''
    defaultCategoryId.value = ''
    isScraping.value = false
    isImporting.value = false
    errorMessage.value = ''
  }

  return {
    currentStep,
    phone,
    password,
    rememberCredentials,
    dateFrom,
    dateTo,
    selectedCarrier,
    invoiceStatus,
    buyerTaxId,
    keyword,
    invoiceList,
    selectedInvoiceNumbers,
    importResult,
    isScraping,
    isImporting,
    errorMessage,
    defaultAccountId,
    defaultCategoryId,
    selectedInvoices,
    totalSelectedAmount,
    allSelected,
    toggleSelectAll,
    toggleSelect,
    setInvoiceList,
    reset,
  }
})
