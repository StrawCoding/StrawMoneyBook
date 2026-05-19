import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useEInvoiceImportStore = defineStore('einvoiceImport', () => {
  // ── Wizard navigation ─────────────────────────────────────────────────────
  const currentStep = ref(1)

  // ── Step 1: carrier credentials ───────────────────────────────────────────
  const carrierBarcode = ref('')
  const verificationCode = ref('')
  const rememberCredentials = ref(true)

  // ── Step 2: query conditions ──────────────────────────────────────────────
  const dateFrom = ref('')
  const dateTo = ref('')

  // ── Step 3: scrape state machine ──────────────────────────────────────────
  // scrapeStatus: 'idle' | 'running' | 'done' | 'failed' | 'cancelled' | 'timeout'
  const scrapeStatus = ref('idle')
  const scrapeError = ref('')
  // Monotonically-increasing counter; callers capture the value from startScrape()
  // and pass it back so late-arriving results from cancelled requests are discarded.
  const scrapeGeneration = ref(0)
  const invoiceList = ref([])
  const selectedInvoiceNumbers = ref(new Set())

  // ── Step 4: import results ────────────────────────────────────────────────
  const importResult = ref(null)
  const defaultAccountId = ref('')
  const defaultCategoryId = ref('')
  const isImporting = ref(false)

  // ── Derived ───────────────────────────────────────────────────────────────
  const isScraping = computed(() => scrapeStatus.value === 'running')

  const selectedInvoices = computed(() =>
    invoiceList.value.filter((inv) => selectedInvoiceNumbers.value.has(inv.invoiceNumber)),
  )

  const totalSelectedAmount = computed(() =>
    selectedInvoices.value.reduce((sum, inv) => sum + inv.amount, 0),
  )

  const allSelected = computed(
    () => invoiceList.value.length > 0 && selectedInvoiceNumbers.value.size === invoiceList.value.length,
  )

  // ── Scrape lifecycle ──────────────────────────────────────────────────────

  function startScrape() {
    scrapeGeneration.value++
    scrapeStatus.value = 'running'
    scrapeError.value = ''
    invoiceList.value = []
    selectedInvoiceNumbers.value = new Set()
    return scrapeGeneration.value
  }

  function commitScrapeResult(token, list) {
    if (scrapeGeneration.value !== token) return false
    invoiceList.value = list ?? []
    selectedInvoiceNumbers.value = new Set()
    scrapeStatus.value = 'done'
    return true
  }

  function failScrape(token, message, status = 'failed') {
    if (scrapeGeneration.value !== token) return false
    scrapeError.value = message
    scrapeStatus.value = status
    return true
  }

  function cancelScrape() {
    if (scrapeStatus.value !== 'running') return
    scrapeGeneration.value++
    scrapeStatus.value = 'cancelled'
    scrapeError.value = ''
  }

  /** Clear scrape results; call when navigating back to step 2 so downstream state is fresh. */
  function clearScrapeResults() {
    scrapeGeneration.value++
    scrapeStatus.value = 'idle'
    scrapeError.value = ''
    invoiceList.value = []
    selectedInvoiceNumbers.value = new Set()
  }

  // ── Selection ─────────────────────────────────────────────────────────────

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

  // ── Full reset ────────────────────────────────────────────────────────────

  function reset() {
    currentStep.value = 1
    carrierBarcode.value = ''
    verificationCode.value = ''
    rememberCredentials.value = true
    dateFrom.value = ''
    dateTo.value = ''
    scrapeGeneration.value = 0
    scrapeStatus.value = 'idle'
    scrapeError.value = ''
    invoiceList.value = []
    selectedInvoiceNumbers.value = new Set()
    importResult.value = null
    defaultAccountId.value = ''
    defaultCategoryId.value = ''
    isImporting.value = false
  }

  return {
    currentStep,
    carrierBarcode, verificationCode, rememberCredentials,
    dateFrom, dateTo,
    scrapeStatus, scrapeError,
    invoiceList, selectedInvoiceNumbers,
    importResult, defaultAccountId, defaultCategoryId,
    isScraping, isImporting,
    selectedInvoices, totalSelectedAmount, allSelected,
    startScrape, commitScrapeResult, failScrape, cancelScrape, clearScrapeResults,
    toggleSelectAll, toggleSelect,
    reset,
  }
})
