/**
 * ART-18 — Budget service facade (compatible public API).
 * Implementation split: budget-deps / budget-period / budget-spent / budget-crud.
 */
export {
  resetBudgetServiceDependenciesForTest,
  setBudgetServiceDependenciesForTest,
} from './budget-deps.js'

export {
  dateKeyForLedgerTimeZone,
  monthKeyForLedgerTimeZone,
  resolveCalendarBudgetPeriod,
  resolvePayCycleBudgetPeriod,
  resolveBudgetPeriodForLedger,
  resolveCurrentBudgetPeriodForLedger,
  previousBudgetPeriod,
  nextBudgetPeriod,
  listInclusiveMonthKeys,
  daysInPeriod,
  daysInMonthForKey,
  resolveContainerMonthlyAmountMinor,
  resolveContainerPeriodAmountMinor,
  isDailyPoolContainer,
  isDailyPoolChildItem,
  monthRangeUtc,
  previousMonthKey,
  dateRangeUtc,
} from './budget-period.js'

export {
  resolveBudgetItemForPeriod,
  resolveBudgetItemForMonth,
} from './budget-spent.js'

export {
  ensureBudgetForMonth,
  ensureBudgetForPeriod,
  getBudgetSavePreferences,
  saveBudgetSavePreferences,
  loadBudgetSnapshot,
  loadBudgetSnapshotForPeriod,
  saveBudgetItem,
  saveBudgetItemRange,
  saveBudgetTotalConfig,
  saveBudgetContainer,
  saveBudgetContainerRange,
  removeBudgetItem,
  removeBudgetContainer,
  copyPreviousMonthBudget,
  isBudgetPeriodStructureEmpty,
  applyLedgerBudgetPeriodSettings,
} from './budget-crud.js'
