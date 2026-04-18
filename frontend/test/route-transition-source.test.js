import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  resolveRouteTransitionKey,
  setRouteStageMinHeight,
} from '../src/ui/composables/app-shell-runtime.helpers.js'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/App.vue'),
  'utf8',
)

test('app route transition locks stage height during page switches', () => {
  assert.match(source, /ref="routeStageRef"[\s\S]*class="route-stage"/)
  assert.match(source, /@before-leave="handleRouteBeforeLeave"/)
  assert.match(source, /@after-enter="handleRouteAfterEnter"/)
  assert.match(source, /\.route-stage \{/)
  assert.match(source, /\.route-stage\.transitioning \{/)

  const stageRef = { value: { style: {} } }
  setRouteStageMinHeight(stageRef, 42.2)
  assert.equal(stageRef.value.style.minHeight, '43px')
  setRouteStageMinHeight(stageRef, 0)
  assert.equal(stageRef.value.style.minHeight, '')
})

test('app route transition uses softer enter and leave transforms', () => {
  assert.match(source, /opacity 220ms var\(--anim-standard\)/)
  assert.match(source, /transform 260ms var\(--anim-spring\)/)
  assert.match(source, /translate3d\(0, 12px, 0\) scale\(0\.994\)/)
  assert.match(source, /translate3d\(0, -8px, 0\) scale\(0\.998\)/)
  assert.doesNotMatch(source, /filter:/)
  assert.doesNotMatch(source, /blur\(/)
})

test('route transition prefers stable meta key before falling back to full path', () => {
  assert.equal(
    resolveRouteTransitionKey({
      meta: { transitionKey: 'claim-sheets' },
      fullPath: '/claim-sheets?page=2',
    }),
    'claim-sheets',
  )
  assert.equal(
    resolveRouteTransitionKey({
      meta: {},
      fullPath: '/transactions/search?keyword=lunch',
    }),
    '/transactions/search?keyword=lunch',
  )
})
