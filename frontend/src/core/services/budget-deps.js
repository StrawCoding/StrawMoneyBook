/**
 * ART-18 — Budget service dependency injection (testable seams).
 */
const BUDGET_SAVE_PREFERENCES_KEY = 'budget_save_preferences'
export { BUDGET_SAVE_PREFERENCES_KEY }

const defaultDependencies = {
  async createBudget(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.createBudget(...args)
  },
  async deleteBudgetItem(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.deleteBudgetItem(...args)
  },
  async deleteBudgetItemsByBudget(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.deleteBudgetItemsByBudget(...args)
  },
  async deleteBudgetContainersByBudget(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.deleteBudgetContainersByBudget(...args)
  },
  async deleteBudgetContainer(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.deleteBudgetContainer(...args)
  },
  async listBudgetContainers(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetContainers(...args)
  },
  async upsertBudgetContainer(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.upsertBudgetContainer(...args)
  },
  async getBudgetByMonth(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.getBudgetByMonth(...args)
  },
  async getBudgetByPeriod(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.getBudgetByPeriod(...args)
  },
  async listBudgetUsageDaysByCategory(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetUsageDaysByCategory(...args)
  },
  async listBudgetSpentByCategoryAndDay(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetSpentByCategoryAndDay(...args)
  },
  async listBudgetItems(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetItems(...args)
  },
  async updateBudgetSaveTotalConfig(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.updateBudgetSaveTotalConfig(...args)
  },
  async upsertBudgetItem(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.upsertBudgetItem(...args)
  },
  async computeBudgetSpentByCategory(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.computeBudgetSpentByCategory(...args)
  },
  async findAccountById(...args) {
    const mod = await import('../repositories/account.repo.js')
    return mod.findAccountById(...args)
  },
  async isSavingsJarAccount(...args) {
    const mod = await import('../repositories/savings-jar.repo.js')
    return mod.isSavingsJarAccount(...args)
  },
  async getSetting(...args) {
    const mod = await import('../repositories/settings.repo.js')
    return mod.getSetting(...args)
  },
  async setSetting(...args) {
    const mod = await import('../repositories/settings.repo.js')
    return mod.setSetting(...args)
  },
  async getLedger(...args) {
    const mod = await import('../repositories/ledger.repo.js')
    return mod.getLedger(...args)
  },
  async updateLedgerBudgetPeriodSettings(...args) {
    const mod = await import('../repositories/ledger.repo.js')
    return mod.updateLedgerBudgetPeriodSettings(...args)
  },
}
export const dependencies = { ...defaultDependencies }

export function resetBudgetServiceDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
}

export function setBudgetServiceDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}
