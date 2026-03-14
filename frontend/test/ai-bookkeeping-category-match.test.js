import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectCategoryTextMatchCandidates,
  pickBestCategoryTextMatch,
} from '../src/core/services/ai-bookkeeping-category-match.js'

test('matches full category names directly', () => {
  const matched = pickBestCategoryTextMatch('今天午餐吃拉麵 180', [
    { id: 'cat_breakfast', name: '早餐' },
    { id: 'cat_lunch', name: '午餐' },
    { id: 'cat_dinner', name: '晚餐' },
  ])

  assert.equal(matched?.categoryId, 'cat_lunch')
  assert.equal(matched?.categoryName, '午餐')
})

test('matches unique short prefixes for two-character categories', () => {
  const matched = pickBestCategoryTextMatch('午 120', [
    { id: 'cat_breakfast', name: '早餐' },
    { id: 'cat_lunch', name: '午餐' },
    { id: 'cat_dinner', name: '晚餐' },
  ])

  assert.equal(matched?.categoryId, 'cat_lunch')
  assert.ok(Number(matched?.confidence ?? 0) >= 0.68)
})

test('matches distinctive inner fragments for longer categories', () => {
  const matched = pickBestCategoryTextMatch('用品 299', [
    { id: 'cat_daily', name: '生活用品' },
    { id: 'cat_books', name: '書本' },
  ])

  assert.equal(matched?.categoryId, 'cat_daily')
})

test('skips ambiguous one-character partial matches shared by multiple categories', () => {
  const matches = collectCategoryTextMatchCandidates('交 200', [
    { id: 'cat_transport', name: '交通' },
    { id: 'cat_social', name: '交際' },
  ])

  assert.equal(matches.length, 0)
})
