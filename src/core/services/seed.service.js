import {
  listCategoryGroups,
  listCategories,
} from '@/core/repositories/category.repo'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { run } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'

const LEDGER_SEED_LOCALE_KEY = 'app.seed_locale'
const SUPPORTED_SEED_LOCALES = ['zh-TW', 'en']

const CATEGORY_DEFAULTS_BY_LOCALE = {
  'zh-TW': {
    groups: [
      { key: 'expense_food', name: '飲食', kind: 'expense', sortOrder: 0 },
      { key: 'expense_education', name: '教育', kind: 'expense', sortOrder: 1 },
      { key: 'expense_shopping', name: '購物', kind: 'expense', sortOrder: 2 },
      { key: 'expense_other', name: '其他', kind: 'expense', sortOrder: 3 },
      { key: 'income_main', name: '收入', kind: 'income', sortOrder: 0 },
    ],
    categories: [
      { name: '飲食', kind: 'expense', icon: 'fa-solid fa-utensils', sortOrder: 0, group: 'expense_food' },
      { name: '早餐', kind: 'expense', icon: 'fa-solid fa-mug-hot', sortOrder: 1, group: 'expense_food' },
      { name: '午餐', kind: 'expense', icon: 'fa-solid fa-burger', sortOrder: 2, group: 'expense_food' },
      { name: '晚餐', kind: 'expense', icon: 'fa-solid fa-bowl-food', sortOrder: 3, group: 'expense_food' },
      { name: '文具', kind: 'expense', icon: 'fa-solid fa-wand-magic-sparkles', sortOrder: 0, group: 'expense_education' },
      { name: '書本', kind: 'expense', icon: 'fa-solid fa-book-open', sortOrder: 1, group: 'expense_education' },
      { name: '學費', kind: 'expense', icon: 'fa-solid fa-graduation-cap', sortOrder: 2, group: 'expense_education' },
      { name: '購物', kind: 'expense', icon: 'fa-solid fa-cart-shopping', sortOrder: 0, group: 'expense_shopping' },
      { name: '娛樂', kind: 'expense', icon: 'fa-solid fa-gamepad', sortOrder: 1, group: 'expense_shopping' },
      { name: '生活用品', kind: 'expense', icon: 'fa-solid fa-lightbulb', sortOrder: 2, group: 'expense_shopping' },
      { name: '電子工具', kind: 'expense', icon: 'fa-solid fa-laptop', sortOrder: 3, group: 'expense_shopping' },
      { name: '交通', kind: 'expense', icon: 'fa-solid fa-train-subway', sortOrder: 0, group: 'expense_other' },
      { name: '醫療', kind: 'expense', icon: 'fa-solid fa-briefcase-medical', sortOrder: 1, group: 'expense_other' },
      { name: '請客', kind: 'expense', icon: 'fa-solid fa-users', sortOrder: 2, group: 'expense_other' },
      { name: '薪資', kind: 'income', icon: 'fa-solid fa-sack-dollar', sortOrder: 0, group: 'income_main' },
      { name: '零用錢', kind: 'income', icon: 'fa-solid fa-hand-holding-dollar', sortOrder: 1, group: 'income_main' },
    ],
  },
  en: {
    groups: [
      { key: 'expense_food', name: 'Food', kind: 'expense', sortOrder: 0 },
      { key: 'expense_education', name: 'Education', kind: 'expense', sortOrder: 1 },
      { key: 'expense_shopping', name: 'Shopping', kind: 'expense', sortOrder: 2 },
      { key: 'expense_other', name: 'Other', kind: 'expense', sortOrder: 3 },
      { key: 'income_main', name: 'Income', kind: 'income', sortOrder: 0 },
    ],
    categories: [
      { name: 'Food', kind: 'expense', icon: 'fa-solid fa-utensils', sortOrder: 0, group: 'expense_food' },
      { name: 'Breakfast', kind: 'expense', icon: 'fa-solid fa-mug-hot', sortOrder: 1, group: 'expense_food' },
      { name: 'Lunch', kind: 'expense', icon: 'fa-solid fa-burger', sortOrder: 2, group: 'expense_food' },
      { name: 'Dinner', kind: 'expense', icon: 'fa-solid fa-bowl-food', sortOrder: 3, group: 'expense_food' },
      { name: 'Stationery', kind: 'expense', icon: 'fa-solid fa-wand-magic-sparkles', sortOrder: 0, group: 'expense_education' },
      { name: 'Books', kind: 'expense', icon: 'fa-solid fa-book-open', sortOrder: 1, group: 'expense_education' },
      { name: 'Tuition', kind: 'expense', icon: 'fa-solid fa-graduation-cap', sortOrder: 2, group: 'expense_education' },
      { name: 'Shopping', kind: 'expense', icon: 'fa-solid fa-cart-shopping', sortOrder: 0, group: 'expense_shopping' },
      { name: 'Entertainment', kind: 'expense', icon: 'fa-solid fa-gamepad', sortOrder: 1, group: 'expense_shopping' },
      { name: 'Daily Necessities', kind: 'expense', icon: 'fa-solid fa-lightbulb', sortOrder: 2, group: 'expense_shopping' },
      { name: 'Electronics', kind: 'expense', icon: 'fa-solid fa-laptop', sortOrder: 3, group: 'expense_shopping' },
      { name: 'Transport', kind: 'expense', icon: 'fa-solid fa-train-subway', sortOrder: 0, group: 'expense_other' },
      { name: 'Medical', kind: 'expense', icon: 'fa-solid fa-briefcase-medical', sortOrder: 1, group: 'expense_other' },
      { name: 'Treating', kind: 'expense', icon: 'fa-solid fa-users', sortOrder: 2, group: 'expense_other' },
      { name: 'Salary', kind: 'income', icon: 'fa-solid fa-sack-dollar', sortOrder: 0, group: 'income_main' },
      { name: 'Allowance', kind: 'income', icon: 'fa-solid fa-hand-holding-dollar', sortOrder: 1, group: 'income_main' },
    ],
  },
}

function normalizeSeedLocale(value) {
  const raw = String(value ?? '').trim()
  if (SUPPORTED_SEED_LOCALES.includes(raw)) return raw
  return 'zh-TW'
}

async function resolveLedgerSeedLocale(ledgerId, preferredLocale = '') {
  const preferred = normalizeSeedLocale(preferredLocale)
  if (preferredLocale) return preferred
  const stored = normalizeSeedLocale(await getSetting(ledgerId, LEDGER_SEED_LOCALE_KEY))
  return stored
}

async function seedCategoryGroupsAndCategories(ledgerId, seedConfig) {
  const now = nowIso()
  const groupRows = seedConfig.groups.map((group) => ({
    key: group.key,
    id: createId('cg'),
    name: group.name,
    kind: group.kind,
    sortOrder: group.sortOrder ?? 0,
  }))

  if (groupRows.length > 0) {
    const groupPlaceholders = groupRows
      .map(() => '(?, ?, ?, ?, ?, 0, ?, ?)')
      .join(', ')

    const groupValues = groupRows.flatMap((group) => [
      ledgerId,
      group.id,
      group.name,
      group.kind,
      group.sortOrder,
      now,
      now,
    ])

    await run(
      `INSERT INTO category_groups (
        ledger_id, id, name, kind, sort_order, is_archived, created_at, updated_at
      ) VALUES ${groupPlaceholders};`,
      groupValues,
    )
  }

  const groupIdMap = new Map(groupRows.map((group) => [group.key, group.id]))
  const categoryRows = seedConfig.categories
    .map((item) => {
      const groupId = groupIdMap.get(item.group)
      if (!groupId) return null
      return {
        id: createId('cat'),
        groupId,
        name: item.name,
        kind: item.kind,
        icon: item.icon,
        isBudgetable: item.isBudgetable ?? 1,
        sortOrder: item.sortOrder ?? 0,
      }
    })
    .filter(Boolean)

  if (categoryRows.length > 0) {
    const categoryPlaceholders = categoryRows
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
      .join(', ')

    const categoryValues = categoryRows.flatMap((item) => [
      ledgerId,
      item.id,
      item.groupId,
      item.name,
      item.kind,
      item.icon,
      item.isBudgetable,
      item.sortOrder,
      now,
      now,
    ])

    await run(
      `INSERT INTO categories (
        ledger_id, id, group_id, name, kind, icon, is_budgetable, sort_order, is_archived, created_at, updated_at
      ) VALUES ${categoryPlaceholders};`,
      categoryValues,
    )
  }
}

export async function ensureLedgerDefaults(ledgerId, options = {}) {
  const seedLocale = await resolveLedgerSeedLocale(ledgerId, options.locale)
  const seedConfig = CATEGORY_DEFAULTS_BY_LOCALE[seedLocale] ?? CATEGORY_DEFAULTS_BY_LOCALE['zh-TW']
  const assumeEmpty = Boolean(options.assumeEmpty)

  if (assumeEmpty) {
    await seedCategoryGroupsAndCategories(ledgerId, seedConfig)
    await setSetting(ledgerId, LEDGER_SEED_LOCALE_KEY, seedLocale)
    return
  }

  const categoryGroups = await listCategoryGroups(ledgerId)
  const categories = await listCategories(ledgerId)

  if (categoryGroups.length === 0 || categories.length === 0) {
    await seedCategoryGroupsAndCategories(ledgerId, seedConfig)

    await setSetting(ledgerId, LEDGER_SEED_LOCALE_KEY, seedLocale)
    return
  }

  if ((await getSetting(ledgerId, LEDGER_SEED_LOCALE_KEY)) == null) {
    await setSetting(ledgerId, LEDGER_SEED_LOCALE_KEY, seedLocale)
  }
}
