import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as invoiceCarrierService from '@/core/services/invoice-carrier.service'
import * as uiService from '@/ui/services/invoice-carrier.service'

export const useInvoiceCarrierStore = defineStore('invoice_carrier', () => {
  // State
  const connections = ref([])
  const invoices = ref({}) // { [connectionId]: [...invoices] }
  const sessionIds = ref({}) // { [connectionId]: sessionId }
  const currentConnectionId = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // Computed
  const currentConnection = computed(() =>
    currentConnectionId.value
      ? connections.value.find((c) => c.id === currentConnectionId.value)
      : null,
  )

  const currentInvoices = computed(() =>
    currentConnectionId.value ? (invoices.value[currentConnectionId.value] ?? []) : [],
  )

  const unimportedInvoices = computed(() =>
    currentInvoices.value.filter((inv) => !inv.imported_transaction_id),
  )

  // Actions
  async function loadConnections() {
    try {
      loading.value = true
      error.value = null
      const result = await invoiceCarrierService.listInvoiceCarrierConnections()
      connections.value = result
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to load connections')
    } finally {
      loading.value = false
    }
  }

  async function selectConnection(connectionId) {
    currentConnectionId.value = connectionId
    if (connectionId) {
      await loadInvoices(connectionId)
    }
  }

  async function loadInvoices(connectionId) {
    if (!connectionId) return
    try {
      loading.value = true
      error.value = null
      const result = await invoiceCarrierService.listInvoiceCarrierInvoices(connectionId, {
        limit: 500,
      })
      invoices.value[connectionId] = result
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to load invoices')
    } finally {
      loading.value = false
    }
  }

  async function createConnection(input) {
    try {
      loading.value = true
      error.value = null
      const connection = await invoiceCarrierService.createInvoiceCarrierConnection(input)
      connections.value.push(connection)
      return connection
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to create connection')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteConnection(connectionId) {
    try {
      loading.value = true
      error.value = null
      await invoiceCarrierService.deleteInvoiceCarrierConnection(connectionId)
      connections.value = connections.value.filter((c) => c.id !== connectionId)
      if (currentConnectionId.value === connectionId) {
        currentConnectionId.value = null
      }
      delete invoices.value[connectionId]
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to delete connection')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function syncConnection(sessionId, connectionId, opts = {}) {
    try {
      loading.value = true
      error.value = null
      const result = await uiService.syncConnection(sessionId, connectionId, opts)
      invoices.value[connectionId] = result.invoices || []
      await loadConnections()
      return result
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to sync')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function importInvoices(invoiceIds, ledgerId, targetAccountId, categoryId = null) {
    if (!currentConnectionId.value) throw new Error('No connection selected')

    try {
      loading.value = true
      error.value = null
      const result = await invoiceCarrierService.importInvoicesAsTransactions(
        currentConnectionId.value,
        invoiceIds,
        ledgerId,
        targetAccountId,
        categoryId,
      )
      // 重載發票清單以反映已匯入狀態
      await loadInvoices(currentConnectionId.value)
      return result
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to import invoices')
      throw e
    } finally {
      loading.value = false
    }
  }

  function setSessionId(connectionId, sessionId) {
    sessionIds.value[connectionId] = sessionId
  }

  function clearError() {
    error.value = null
  }

  return {
    // State
    connections,
    invoices,
    sessionIds,
    currentConnectionId,
    loading,
    error,

    // Computed
    currentConnection,
    currentInvoices,
    unimportedInvoices,

    // Actions
    loadConnections,
    selectConnection,
    loadInvoices,
    createConnection,
    deleteConnection,
    syncConnection,
    importInvoices,
    setSessionId,
    clearError,
  }
})
