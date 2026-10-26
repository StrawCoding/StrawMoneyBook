import { defineStore } from 'pinia'

const emptyStats = () => ({
  incomeCategory: [],
  expenseCategory: [],
  incomeAccount: [],
  expenseAccount: [],
  timeBarFacts: [],
  addonExpenseFacts: [],
})

export const useAnalysisCacheStore = defineStore('analysisCache', {
  state: () => ({
    ledgerId: '',
    mode: 'month',
    key: '',
    stats: emptyStats(),
    ready: false,
  }),

  actions: {
    clear() {
      this.ledgerId = ''
      this.mode = 'month'
      this.key = ''
      this.stats = emptyStats()
      this.ready = false
    },

    matches(ledgerId, mode, key) {
      return this.ready
        && String(this.ledgerId) === String(ledgerId ?? '').trim()
        && this.mode === mode
        && String(this.key) === String(key ?? '').trim()
    },

    setStats(ledgerId, mode, key, stats) {
      const normalizedLedgerId = String(ledgerId ?? '').trim()
      if (!normalizedLedgerId) {
        this.clear()
        return
      }
      this.ledgerId = normalizedLedgerId
      this.mode = mode
      this.key = String(key ?? '').trim()
      this.stats = stats ?? emptyStats()
      this.ready = true
    },

    takeStats(ledgerId, mode, key) {
      if (!this.matches(ledgerId, mode, key)) return null
      return this.stats
    },
  },
})
