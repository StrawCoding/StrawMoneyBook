import { query, run } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'
import { assertLedgerId, rowsOf, firstRow } from '@/core/repositories/base.repo'

function normalizeCategoryIcon(input) {
  const value = String(input?.icon ?? '').trim()
  if (value) return value

  const name = String(input?.name ?? '').trim()
  const kind = String(input?.kind ?? 'expense').trim()
  if (name.includes('飲食')) return 'fa-solid fa-utensils'
  if (kind === 'income') return 'fa-solid fa-sack-dollar'
  return 'fa-solid fa-tag'
}

export async function listCategoryGroups(ledgerId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT ledger_id, id, name, kind, sort_order, is_archived
     FROM category_groups
     WHERE ledger_id = ? AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC;`,
    [ledgerId],
  )
  return rowsOf(result)
}

export async function listCategories(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const includeArchived = Boolean(options.includeArchived)
  const result = await query(
    `SELECT ledger_id, id, group_id, name, kind, icon, is_budgetable, sort_order, is_archived
     FROM categories
     WHERE ledger_id = ?
       AND deleted_at IS NULL
       AND (? = 1 OR is_archived = 0)
     ORDER BY sort_order ASC, created_at ASC;`,
    [ledgerId, includeArchived ? 1 : 0],
  )
  return rowsOf(result)
}

export async function createCategoryGroup(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('cg')
  const now = nowIso()

  await run(
    `INSERT INTO category_groups (
      ledger_id, id, name, kind, sort_order, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?);`,
    [ledgerId, id, input.name, input.kind ?? 'expense', input.sortOrder ?? 0, now, now],
  )

  return { ledger_id: ledgerId, id, ...input }
}

export async function createCategory(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('cat')
  const now = nowIso()
  const icon = normalizeCategoryIcon(input)

  await run(
    `INSERT INTO categories (
      ledger_id, id, group_id, name, kind, icon, is_budgetable, sort_order, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);`,
    [
      ledgerId,
      id,
      input.groupId,
      input.name,
      input.kind ?? 'expense',
      icon,
      input.isBudgetable ?? 1,
      input.sortOrder ?? 0,
      now,
      now,
    ],
  )

  return { ledger_id: ledgerId, id, ...input }
}

export async function updateCategoryIcon(ledgerId, categoryId, icon) {
  assertLedgerId(ledgerId)
  if (!categoryId) throw new Error('缺少分類 ID')
  const normalizedIcon = normalizeCategoryIcon({ icon })
  await run(
    `UPDATE categories
     SET icon = ?, updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [normalizedIcon, nowIso(), ledgerId, categoryId],
  )
}

export async function updateCategoryProfile(ledgerId, categoryId, input = {}) {
  assertLedgerId(ledgerId)
  if (!categoryId) throw new Error('缺少分類 ID')
  const name = String(input.name ?? '').trim()
  const groupId = String(input.groupId ?? '').trim()
  if (!name) throw new Error('分類名稱不可為空')
  if (!groupId) throw new Error('缺少分類群組')
  const normalizedIcon = normalizeCategoryIcon({ icon: input.icon, name })

  await run(
    `UPDATE categories
     SET name = ?, group_id = ?, icon = ?, updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [name, groupId, normalizedIcon, nowIso(), ledgerId, categoryId],
  )
}

export async function countCategoryTransactions(ledgerId, categoryId) {
  const result = await query(
    `SELECT COUNT(*) AS count
     FROM transactions
     WHERE ledger_id = ? AND category_id = ? AND deleted_at IS NULL;`,
    [ledgerId, categoryId],
  )
  return Number(firstRow(result)?.count ?? 0)
}

export async function archiveCategory(ledgerId, categoryId) {
  await run('UPDATE categories SET is_archived = 1, updated_at = ? WHERE ledger_id = ? AND id = ?;', [
    nowIso(),
    ledgerId,
    categoryId,
  ])
}

export async function archiveCategoryGroup(ledgerId, groupId) {
  await run('UPDATE category_groups SET is_archived = 1, updated_at = ? WHERE ledger_id = ? AND id = ?;', [
    nowIso(),
    ledgerId,
    groupId,
  ])
}

export async function archiveCategoriesByGroup(ledgerId, groupId) {
  await run('UPDATE categories SET is_archived = 1, updated_at = ? WHERE ledger_id = ? AND group_id = ?;', [
    nowIso(),
    ledgerId,
    groupId,
  ])
}

export async function deleteCategoryGroupById(ledgerId, groupId) {
  await run('DELETE FROM category_groups WHERE ledger_id = ? AND id = ?;', [ledgerId, groupId])
}

export async function deleteCategoriesByGroup(ledgerId, groupId) {
  await run('DELETE FROM categories WHERE ledger_id = ? AND group_id = ?;', [ledgerId, groupId])
}

export async function countCategoryTransactionsByGroup(ledgerId, groupId) {
  const result = await query(
    `SELECT COUNT(*) AS count
     FROM transactions t
     INNER JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     WHERE t.ledger_id = ?
       AND c.group_id = ?
       AND t.deleted_at IS NULL;`,
    [ledgerId, groupId],
  )
  return Number(firstRow(result)?.count ?? 0)
}

export async function countBudgetItemReferencesByGroup(ledgerId, groupId) {
  const result = await query(
    `SELECT COUNT(*) AS count
     FROM budget_items bi
     INNER JOIN categories c
       ON c.ledger_id = bi.ledger_id
      AND c.id = bi.category_id
     WHERE bi.ledger_id = ?
       AND c.group_id = ?;`,
    [ledgerId, groupId],
  )
  return Number(firstRow(result)?.count ?? 0)
}

export async function deleteCategoryIfUnused(ledgerId, categoryId) {
  const count = await countCategoryTransactions(ledgerId, categoryId)
  if (count > 0) {
    await archiveCategory(ledgerId, categoryId)
    return { archived: true, deleted: false }
  }

  await run('DELETE FROM categories WHERE ledger_id = ? AND id = ?;', [ledgerId, categoryId])
  return { archived: false, deleted: true }
}

export async function deleteCategoryGroupIfUnused(ledgerId, groupId) {
  assertLedgerId(ledgerId)
  const txCount = await countCategoryTransactionsByGroup(ledgerId, groupId)
  const budgetRefCount = await countBudgetItemReferencesByGroup(ledgerId, groupId)

  if (txCount > 0 || budgetRefCount > 0) {
    await archiveCategoryGroup(ledgerId, groupId)
    await archiveCategoriesByGroup(ledgerId, groupId)
    return { archived: true, deleted: false, txCount, budgetRefCount }
  }

  await deleteCategoriesByGroup(ledgerId, groupId)
  await deleteCategoryGroupById(ledgerId, groupId)
  return { archived: false, deleted: true, txCount, budgetRefCount }
}

export async function updateCategoryGroupSortOrdersByKind(ledgerId, kind, groupIds = []) {
  assertLedgerId(ledgerId)
  if (!kind || !Array.isArray(groupIds) || groupIds.length === 0) return

  const now = nowIso()
  for (let index = 0; index < groupIds.length; index += 1) {
    const groupId = groupIds[index]
    if (!groupId) continue
    await run(
      `UPDATE category_groups
       SET sort_order = ?, updated_at = ?
       WHERE ledger_id = ? AND id = ? AND kind = ?;`,
      [index, now, ledgerId, groupId, kind],
    )
  }
}

export async function updateCategorySortOrdersByGroup(ledgerId, groupId, categoryIds = []) {
  assertLedgerId(ledgerId)
  if (!groupId || !Array.isArray(categoryIds) || categoryIds.length === 0) return

  const now = nowIso()
  for (let index = 0; index < categoryIds.length; index += 1) {
    const categoryId = categoryIds[index]
    if (!categoryId) continue
    await run(
      `UPDATE categories
       SET sort_order = ?, updated_at = ?
       WHERE ledger_id = ? AND id = ? AND group_id = ?;`,
      [index, now, ledgerId, categoryId, groupId],
    )
  }
}

export async function findFirstCategoryByKind(ledgerId, kind) {
  const result = await query(
    `SELECT id, group_id, name, kind, icon
     FROM categories
     WHERE ledger_id = ?
       AND is_archived = 0
       AND deleted_at IS NULL
       AND (kind = ? OR kind = 'both')
     ORDER BY sort_order ASC, created_at ASC
     LIMIT 1;`,
    [ledgerId, kind],
  )

  return firstRow(result)
}
