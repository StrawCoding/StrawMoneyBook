import { monthKeyFromDate } from '@/core/utils/id'
import { loadAnalysisStats } from '@/core/services/transaction-query.service'
import { useAnalysisCacheStore } from '@/ui/stores/analysis-cache.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useSecurityStore } from '@/ui/stores/security.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'

/**
 * Warm home feed + analysis (current budget month) before user opens those tabs.
 */
export async function prefetchMainTabData(pinia, ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return

  const budgetStore = useBudgetStore(pinia)
  const monthKey = String(budgetStore.monthKey ?? '').trim() || monthKeyFromDate(new Date())
  const mode = 'month'

  const transactionStore = useTransactionStore(pinia)
  const analysisCache = useAnalysisCacheStore(pinia)
  const securityStore = useSecurityStore(pinia)

  const results = await Promise.allSettled([
    transactionStore.loadHomeMonth(monthKey),
    loadAnalysisStats(normalizedLedgerId, { mode, key: monthKey }),
    securityStore.load(),
  ])

  const homeResult = results[0]
  const analysisResult = results[1]
  if (analysisResult.status === 'fulfilled') {
    analysisCache.setStats(normalizedLedgerId, mode, monthKey, analysisResult.value)
  } else {
    console.warn('[main-tab-prefetch] analysis stats failed', analysisResult.reason)
  }

  if (homeResult.status === 'rejected') {
    console.warn('[main-tab-prefetch] home feed failed', homeResult.reason)
  }
}
