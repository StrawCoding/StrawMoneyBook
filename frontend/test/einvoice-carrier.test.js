/**
 * 載具（carrier）重建測試 — SMB-226
 * 驗證載具名稱可正確轉成交易標籤 JSON（spec §3.3.2：載具名稱 → 標籤/tag），
 * 並覆蓋空值 / 去除空白 / 去重等邊界。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCarrierTagsJson } from '../src/services/einvoice/shared.js'

test('載具名稱轉為單一標籤的 JSON 陣列字串', () => {
  assert.equal(buildCarrierTagsJson('手機條碼'), JSON.stringify(['手機條碼']))
})

test('載具名稱前後空白會被去除', () => {
  assert.equal(buildCarrierTagsJson('  手機條碼  '), JSON.stringify(['手機條碼']))
})

test('空字串 / null / undefined 回傳 null（不產生空標籤）', () => {
  assert.equal(buildCarrierTagsJson(''), null)
  assert.equal(buildCarrierTagsJson('   '), null)
  assert.equal(buildCarrierTagsJson(null), null)
  assert.equal(buildCarrierTagsJson(undefined), null)
})

test('非字串輸入會被安全轉換或回傳 null', () => {
  assert.equal(buildCarrierTagsJson(123), JSON.stringify(['123']))
  assert.equal(buildCarrierTagsJson({}), null)
})

test('產出的 JSON 可被 JSON.parse 還原成陣列', () => {
  const json = buildCarrierTagsJson('信用卡載具')
  const parsed = JSON.parse(json)
  assert.ok(Array.isArray(parsed))
  assert.deepEqual(parsed, ['信用卡載具'])
})
