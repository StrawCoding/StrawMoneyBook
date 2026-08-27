import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appleUiSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/assets/css/apple-ui.css'),
  'utf8',
)

const settingsPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings.vue'),
  'utf8',
)

function extractBlock(source, selectorMarker) {
  const start = source.indexOf(selectorMarker)
  assert.notEqual(start, -1, `selector not found: ${selectorMarker}`)
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

test('SMB-254: modern settings rows use compact vertical padding while keeping 44px tap target', () => {
  const block = extractBlock(
    appleUiSource,
    "[data-ui-layout='modern'] .settings-page .setting-group .item-link {",
  )
  // Compact: vertical padding reduced from 12px to 8px, horizontal padding preserved at 14px.
  assert.match(block, /padding:\s*8px\s+14px/)
  assert.doesNotMatch(block, /padding:\s*12px\s+14px/)
  // Tap target must stay >= 44px for accessibility / safe touch area.
  assert.match(block, /min-height:\s*var\(--apple-row-min-height\)/)
})

test('SMB-254: settings scoped list rows are tightened but keep min tap height', () => {
  // Separator spacing between rows reduced from 12px to 8px for a more compact list.
  assert.match(settingsPageSource, /\.item-link \+ \.item-link\s*\{[^}]*margin-top:\s*8px/)
  assert.match(settingsPageSource, /\.item-link \+ \.item-link\s*\{[^}]*padding-top:\s*8px/)
  // Each row keeps a 44px minimum height so the click area / readability is preserved.
  const itemLinkBlock = extractBlock(settingsPageSource, '.item-link {')
  assert.match(itemLinkBlock, /min-height:\s*44px/)
})
