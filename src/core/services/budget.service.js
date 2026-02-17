import { createId, monthKeyFromDate } from '@/core/utils/id'
import {
  createBudget,
  deleteBudgetItem,
  deleteBudgetItemsByBudget,
  getBudgetByMonth,
  listBudgetItems,
  upsertBudgetItem,
  computeBudgetSpentByCategory,
} from '@/core/repositories/budget.repo'

export function monthRangeUtc(monthKey) {
  const [year, month] = monthKey.split('-').map((part) => Number(part))
  const start = new Date(year, month - 1, 1, 0, 0, 0)
  const end = new Date(year, month, 1, 0, 0, 0)

  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  }
}

export function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map((part) => Number(part))
  const date = new Date(year, month - 2, 1)
  return monthKeyFromDate(date)
}

export async function ensureBudgetForMonth(ledgerId, monthKey) {
  let budget = await getBudgetByMonth(ledgerId, monthKey)
  if (!budget) {
    budget = await createBudget(ledgerId, {
      monthKey,
      name: `${monthKey} 月預算`,
      includeTransfers: false,
      includeLoanRepayments: false,
      includeReimbursedExpenses: false,
    })
  }

  return budget
}

export async function loadBudgetSnapshot(ledgerId, monthKey) {
  const budget = await ensureBudgetForMonth(ledgerId, monthKey)
  const items = await listBudgetItems(ledgerId, budget.id)
  const { startUtc, endUtc } = monthRangeUtc(monthKey)
  const spentRows = await computeBudgetSpentByCategory(ledgerId, startUtc, endUtc)

  return {
    budget,
    items,
    spentRows,
  }
}

export async function saveBudgetItem(ledgerId, monthKey, payload) {
  const budget = await ensureBudgetForMonth(ledgerId, monthKey)

  if (!payload.categoryId) {
    throw new Error('請選擇分類')
  }

  const amountMinor = Math.max(0, Math.round(Number(payload.amountMinor)))

  const id = await upsertBudgetItem(ledgerId, {
    id: payload.id,
    budgetId: budget.id,
    scopeType: 'category',
    categoryId: payload.categoryId,
    categoryGroupId: null,
    amountMinor,
    sortOrder: payload.sortOrder ?? 0,
  })

  return id
}

export async function removeBudgetItem(ledgerId, budgetItemId) {
  if (!budgetItemId) return
  await deleteBudgetItem(ledgerId, budgetItemId)
}

export async function copyPreviousMonthBudget(ledgerId, monthKey, options = {}) {
  const currentBudget = await ensureBudgetForMonth(ledgerId, monthKey)
  const prevKey = previousMonthKey(monthKey)
  const prevBudget = await getBudgetByMonth(ledgerId, prevKey)

  if (!prevBudget) {
    return { copied: 0, fromMonth: prevKey }
  }

  const prevItems = await listBudgetItems(ledgerId, prevBudget.id)

  if (options.replaceExisting !== false) {
    await deleteBudgetItemsByBudget(ledgerId, currentBudget.id)
  }

  for (const [index, item] of prevItems.entries()) {
    await upsertBudgetItem(ledgerId, {
      id: createId('bi'),
      budgetId: currentBudget.id,
      scopeType: item.scope_type,
      categoryId: item.category_id,
      categoryGroupId: item.category_group_id,
      amountMinor: Number(item.amount_minor),
      sortOrder: index,
    })
  }

  return {
    copied: prevItems.length,
    fromMonth: prevKey,
  }
}
