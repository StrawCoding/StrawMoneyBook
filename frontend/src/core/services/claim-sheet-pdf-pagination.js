function normalizeCapacity(value) {
  const numericValue = Math.max(0, Math.round(Number(value ?? 0)))
  if (!numericValue) {
    throw new Error('claim sheet pdf pagination requires a positive page capacity')
  }
  return numericValue
}

function normalizeMeasuredItem(item = {}) {
  const wholeHeight = Math.max(0, Math.round(Number(item.wholeHeight ?? 0)))
  const mainHeight = Math.max(0, Math.round(Number(item.mainHeight ?? 0)))
  const continuationHeights = Array.isArray(item.continuationHeights)
    ? item.continuationHeights.map((value) => Math.max(0, Math.round(Number(value ?? 0)))).filter((value) => value > 0)
    : []

  return {
    continuationHeights,
    id: String(item.id ?? ''),
    mainHeight,
    wholeHeight,
  }
}

function createPage(capacity) {
  return {
    blocks: [],
    capacity,
    used: 0,
  }
}

function remainingCapacity(page) {
  return Math.max(0, page.capacity - page.used)
}

function appendBlock(page, block) {
  page.blocks.push(block)
  page.used += Math.max(0, Math.round(Number(block.height ?? 0)))
}

export function paginateMeasuredClaimSheetItems(items = [], options = {}) {
  const firstPageCapacity = normalizeCapacity(options.firstPageCapacity)
  const continuationPageCapacity = normalizeCapacity(options.continuationPageCapacity)
  const pages = [createPage(firstPageCapacity)]

  function currentPage() {
    return pages[pages.length - 1]
  }

  function appendPage() {
    const nextPage = createPage(continuationPageCapacity)
    pages.push(nextPage)
    return nextPage
  }

  function ensureCapacity(requiredHeight) {
    const page = currentPage()
    if (requiredHeight <= remainingCapacity(page)) {
      return page
    }
    if (!page.blocks.length) {
      return page
    }
    return appendPage()
  }

  for (const rawItem of items) {
    const item = normalizeMeasuredItem(rawItem)
    const page = currentPage()
    const wholeFitsCurrentPage = item.wholeHeight > 0 && item.wholeHeight <= remainingCapacity(page)
    const wholeFitsFreshPage = item.wholeHeight > 0 && item.wholeHeight <= page.capacity

    if (wholeFitsCurrentPage) {
      appendBlock(page, { height: item.wholeHeight, itemId: item.id, segment: 'whole' })
      continue
    }

    if (wholeFitsFreshPage) {
      const targetPage = page.blocks.length ? appendPage() : page
      appendBlock(targetPage, { height: item.wholeHeight, itemId: item.id, segment: 'whole' })
      continue
    }

    const mainPage = ensureCapacity(item.mainHeight)
    appendBlock(mainPage, { height: item.mainHeight, itemId: item.id, segment: 'main' })

    item.continuationHeights.forEach((height, index) => {
      const targetPage = ensureCapacity(height)
      appendBlock(targetPage, {
        height,
        itemId: item.id,
        segment: `continuation-${index + 1}`,
      })
    })
  }

  return pages.map((page) => ({
    blocks: page.blocks.map((block) => ({ ...block })),
    capacity: page.capacity,
    used: page.used,
  }))
}
