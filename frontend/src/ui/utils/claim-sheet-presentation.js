export const CLAIM_ADVANCE_ICON = 'fa-solid fa-hand-holding-dollar'

export function buildClaimCategoryLookup(categories = []) {
  const lookup = new Map()

  for (const category of categories) {
    const id = String(category?.id ?? '').trim()
    if (!id) continue
    lookup.set(id, category)
  }

  return lookup
}

function categoryFromLookup(categoryId, categoryLookup) {
  const normalizedId = String(categoryId ?? '').trim()
  if (!normalizedId) return null
  return categoryLookup?.get?.(normalizedId) ?? null
}

function categoryNameFromLookup(categoryId, categoryLookup, fallback = '') {
  const directName = String(fallback ?? '').trim()
  if (directName) return directName
  return String(categoryFromLookup(categoryId, categoryLookup)?.name ?? '').trim()
}

function categoryIconFromLookup(categoryId, categoryLookup, fallback = '') {
  const directIcon = String(fallback ?? '').trim()
  if (directIcon) return directIcon
  return String(categoryFromLookup(categoryId, categoryLookup)?.icon ?? '').trim()
}

export function presentClaimDetailItem(item, categoryLookup, t) {
  const sourceType = String(item?.source_type ?? '').trim()
  const isAdvance = sourceType === 'advance'
  const transactionId = String(item?.transaction_id ?? '').trim()
  const entryType = String(item?.entry_type ?? '').trim() === 'income' ? 'income' : 'expense'

  return {
    title: String(item?.description ?? '').trim() || t('claim_sheet.form.unnamed_item'),
    icon: isAdvance ? CLAIM_ADVANCE_ICON : categoryIconFromLookup(item?.category_id, categoryLookup),
    categoryName: isAdvance
      ? t('claim_sheet.entry_type.advance')
      : categoryNameFromLookup(item?.category_id, categoryLookup, item?.category_name),
    entryLabel: isAdvance
      ? t('claim_sheet.entry_type.advance')
      : entryType === 'income'
        ? t('claim_sheet.entry_type.income')
        : t('claim_sheet.entry_type.expense'),
    sourceLabel: isAdvance
      ? t('claim_sheet.item_source.advance')
      : transactionId
        ? t('claim_sheet.item_source.imported')
        : t('claim_sheet.item_source.manual'),
    note: String(item?.transaction_note ?? '').trim(),
  }
}

export function presentClaimManualFormItem(item, categoryLookup, t) {
  const entryType = item?.entryType === 'income'
    ? 'income'
    : item?.entryType === 'advance'
      ? 'advance'
      : 'expense'

  const defaultTitle = entryType === 'income'
    ? t('claim_sheet.form.default_income_item')
    : entryType === 'advance'
      ? t('claim_sheet.form.default_advance_item')
      : t('claim_sheet.form.default_expense_item')

  return {
    title: String(item?.description ?? '').trim() || defaultTitle,
    icon: entryType === 'advance' ? CLAIM_ADVANCE_ICON : categoryIconFromLookup(item?.categoryId, categoryLookup),
    categoryName: entryType === 'advance'
      ? t('claim_sheet.entry_type.advance')
      : categoryNameFromLookup(item?.categoryId, categoryLookup),
    entryLabel: entryType === 'income'
      ? t('claim_sheet.entry_type.income')
      : entryType === 'advance'
        ? t('claim_sheet.entry_type.advance')
        : t('claim_sheet.entry_type.expense'),
  }
}

export function presentImportedClaimTx(tx, categoryLookup, t) {
  const title = String(tx?.category_name ?? '').trim()
    || String(tx?.note_plain ?? '').trim()
    || t('claim_sheet.form.imported_reimbursement_item', { id: tx.id })

  return {
    title,
    icon: categoryIconFromLookup(tx?.category_id, categoryLookup, tx?.category_icon),
    categoryName: categoryNameFromLookup(tx?.category_id, categoryLookup, tx?.category_name),
    note: String(tx?.note_plain ?? '').trim(),
  }
}
