import test from 'node:test'
import assert from 'node:assert/strict'

import { paginateMeasuredClaimSheetItems } from '../src/core/services/claim-sheet-pdf-pagination.js'

test('paginateMeasuredClaimSheetItems moves a full item to the next page when the current page is full', () => {
  const pages = paginateMeasuredClaimSheetItems(
    [
      { id: 'item-1', wholeHeight: 320 },
      { id: 'item-2', wholeHeight: 230 },
      { id: 'item-3', wholeHeight: 180 },
    ],
    {
      continuationPageCapacity: 600,
      firstPageCapacity: 600,
    },
  )

  assert.equal(pages.length, 2)
  assert.deepEqual(
    pages.map((page) => page.blocks.map((block) => `${block.itemId}:${block.segment}`)),
    [
      ['item-1:whole', 'item-2:whole'],
      ['item-3:whole'],
    ],
  )
})

test('paginateMeasuredClaimSheetItems keeps oversized items in order by splitting continuation blocks across pages', () => {
  const pages = paginateMeasuredClaimSheetItems(
    [
      {
        id: 'item-long',
        wholeHeight: 900,
        mainHeight: 120,
        continuationHeights: [220, 220, 180],
      },
    ],
    {
      continuationPageCapacity: 600,
      firstPageCapacity: 600,
    },
  )

  assert.equal(pages.length, 2)
  assert.deepEqual(
    pages.map((page) => page.blocks.map((block) => `${block.itemId}:${block.segment}`)),
    [
      ['item-long:main', 'item-long:continuation-1', 'item-long:continuation-2'],
      ['item-long:continuation-3'],
    ],
  )
})

test('paginateMeasuredClaimSheetItems preserves item order when whole rows and split rows are mixed', () => {
  const pages = paginateMeasuredClaimSheetItems(
    [
      { id: 'item-1', wholeHeight: 260 },
      {
        id: 'item-2',
        wholeHeight: 780,
        mainHeight: 120,
        continuationHeights: [210, 210, 120],
      },
      { id: 'item-3', wholeHeight: 180 },
    ],
    {
      continuationPageCapacity: 620,
      firstPageCapacity: 620,
    },
  )

  assert.deepEqual(
    pages.flatMap((page) => page.blocks.map((block) => block.itemId)),
    ['item-1', 'item-2', 'item-2', 'item-2', 'item-2', 'item-3'],
  )
  assert.deepEqual(
    pages.map((page) => page.blocks.map((block) => `${block.itemId}:${block.segment}`)),
    [
      ['item-1:whole', 'item-2:main', 'item-2:continuation-1'],
      ['item-2:continuation-2', 'item-2:continuation-3', 'item-3:whole'],
    ],
  )
})
