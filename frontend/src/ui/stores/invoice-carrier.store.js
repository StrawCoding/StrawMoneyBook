import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as invoiceCarrierService from '@/core/services/invoice-carrier.service'

export const useInvoiceCarrierStore = defineStore('invoice_carrier', () => {
  const connections = ref([])
  const invoices = ref({})
  const currentConnectionId = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const currentConnection = computed(() =>
    currentConnectionId.value
      ? connections.value.find((item) => item.id === currentConnectionId.value) ?? null
      : null,
  )

  const currentInvoices = computed(() =>
    currentConnectionId.value ? (invoices.value[currentConnectionId.value] ?? []) : [],
  )

  const unimportedInvoices = computed(() =>
    currentInvoices.value.filter((invoice) => !invoice.imported_transaction_id),
  )

  function upsertConnection(connection) {
    if (!connection?.id) return
    const index = connections.value.findIndex((item) => item.id === connection.id)
    if (index >= 0) {
      connections.value.splice(index, 1, connection)
      return
    }
    connections.value.unshift(connection)
  }

  async function loadConnections() {
    try {
      loading.value = true
      error.value = null
      connections.value = await invoiceCarrierService.listInvoiceCarrierConnections()
      return connections.value
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to load connections')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function loadConnection(connectionId) {
    if (!connectionId) return null
    try {
      loading.value = true
      error.value = null
      const connection = await invoiceCarrierService.getInvoiceCarrierConnection(connectionId)
      if (connection) {
        upsertConnection(connection)
      } else {
        connections.value = connections.value.filter((item) => item.id !== connectionId)
      }
      return connection
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to load connection')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function selectConnection(connectionId) {
    currentConnectionId.value = connectionId || null
    if (!connectionId) return
    await loadConnection(connectionId)
    await loadInvoices(connectionId)
  }

  async function loadInvoices(connectionId) {
    if (!connectionId) return []
    try {
      loading.value = true
      error.value = null
      const result = await invoiceCarrierService.listInvoiceCarrierInvoices(connectionId, {
        limit: 500,
      })
      invoices.value[connectionId] = result
      return result
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to load invoices')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createConnection(settingsLedgerId, input, credentialState, existingConnectionId = '') {
    try {
      loading.value = true
      error.value = null
      const connection = existingConnectionId
        ? await invoiceCarrierService.reconnectInvoiceCarrierConnection(
          existingConnectionId,
          settingsLedgerId,
          input,
          credentialState,
        )
        : await invoiceCarrierService.createInvoiceCarrierConnection(
          settingsLedgerId,
          input,
          credentialState,
        )
      upsertConnection(connection)
      currentConnectionId.value = connection.id
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
      connections.value = connections.value.filter((item) => item.id !== connectionId)
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

  async function syncConnection(fallbackLedgerId, connectionId, opts = {}) {
    try {
      loading.value = true
      error.value = null
      const result = await invoiceCarrierService.syncInvoiceCarrierConnection(
        connectionId,
        fallbackLedgerId,
        opts,
      )
      invoices.value[connectionId] = result.invoices || []
      if (result.connection) {
        upsertConnection(result.connection)
      } else {
        await loadConnection(connectionId)
      }
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
      await loadInvoices(currentConnectionId.value)
      return result
    } catch (e) {
      error.value = String(e?.message ?? e ?? 'Failed to import invoices')
      throw e
    } finally {
      loading.value = false
    }
  }

  function setError(message) {
    error.value = String(message ?? '').trim() || null
  }

  function clearError() {
    error.value = null
  }

  return {
    connections,
    invoices,
    currentConnectionId,
    loading,
    error,
    currentConnection,
    currentInvoices,
    unimportedInvoices,
    loadConnections,
    loadConnection,
    selectConnection,
    loadInvoices,
    createConnection,
    deleteConnection,
    syncConnection,
    importInvoices,
    setError,
    clearError,
  }
})
