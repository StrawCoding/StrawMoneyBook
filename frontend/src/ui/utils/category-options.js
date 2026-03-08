export function getCategoryGroupsByType(categoryStore, type) {
  if (type === 'income') return categoryStore.incomeCategoryGroups ?? []
  if (type === 'expense') return categoryStore.expenseCategoryGroups ?? []
  return []
}

export function getCategoryOptionsByType(categoryStore, type) {
  return getCategoryGroupsByType(categoryStore, type)
    .filter((group) => Array.isArray(group?.categories) && group.categories.length > 0)
    .flatMap((group) => group.categories)
}

export function buildCategorySelectGroups(categoryStore, type) {
  return getCategoryGroupsByType(categoryStore, type)
    .filter((group) => Array.isArray(group?.categories) && group.categories.length > 0)
    .map((group) => ({
      id: group.id,
      name: group.name,
      options: group.categories.map((category) => ({
        value: category.id,
        label: category.name,
        icon: category.icon ?? '',
      })),
    }))
}

export function ensureCategoryIdForType(categoryStore, type, currentCategoryId = '') {
  if (type === 'transfer') return ''
  const categories = getCategoryOptionsByType(categoryStore, type)
  if (!categories.length) return ''
  if (categories.some((item) => item.id === currentCategoryId)) {
    return currentCategoryId
  }
  return categories[0]?.id ?? ''
}
