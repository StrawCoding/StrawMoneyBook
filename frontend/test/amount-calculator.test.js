import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateAmountExpression,
  expressionHasOperator,
} from '../src/ui/utils/amount-calculator.js'

// --- evaluateAmountExpression ---

test('evaluateAmountExpression returns null for null/undefined/empty input', () => {
  assert.equal(evaluateAmountExpression(null), null)
  assert.equal(evaluateAmountExpression(undefined), null)
  assert.equal(evaluateAmountExpression(''), null)
  assert.equal(evaluateAmountExpression('   '), null)
})

test('evaluateAmountExpression returns single number for plain numeric string', () => {
  assert.equal(evaluateAmountExpression('100'), 100)
  assert.equal(evaluateAmountExpression('0'), 0)
  assert.equal(evaluateAmountExpression('12.5'), 12.5)
})

test('evaluateAmountExpression handles addition', () => {
  assert.equal(evaluateAmountExpression('100+50'), 150)
  assert.equal(evaluateAmountExpression('1+2+3'), 6)
})

test('evaluateAmountExpression handles subtraction', () => {
  assert.equal(evaluateAmountExpression('100-30'), 70)
})

test('evaluateAmountExpression handles multiplication', () => {
  assert.equal(evaluateAmountExpression('10*3'), 30)
})

test('evaluateAmountExpression handles division', () => {
  assert.equal(evaluateAmountExpression('100/4'), 25)
})

test('evaluateAmountExpression respects operator precedence (* before +)', () => {
  assert.equal(evaluateAmountExpression('2+3*4'), 14)
  assert.equal(evaluateAmountExpression('10+2*5'), 20)
})

test('evaluateAmountExpression respects operator precedence (/ before -)', () => {
  assert.equal(evaluateAmountExpression('20-6/3'), 18)
})

test('evaluateAmountExpression handles mixed precedence', () => {
  assert.equal(evaluateAmountExpression('1+2*3+4/2'), 9)
})

test('evaluateAmountExpression handles decimal operands', () => {
  assert.equal(evaluateAmountExpression('1.5+2.5'), 4)
  assert.equal(evaluateAmountExpression('10.0*0.1'), 1)
})

test('evaluateAmountExpression returns null for expression ending with operator', () => {
  assert.equal(evaluateAmountExpression('100+'), null)
  assert.equal(evaluateAmountExpression('50*'), null)
})

test('evaluateAmountExpression returns null for expression starting with operator', () => {
  assert.equal(evaluateAmountExpression('+100'), null)
  assert.equal(evaluateAmountExpression('*50'), null)
})

test('evaluateAmountExpression returns null for negative result', () => {
  assert.equal(evaluateAmountExpression('10-100'), null)
})

test('evaluateAmountExpression returns null for division by zero', () => {
  assert.equal(evaluateAmountExpression('10/0'), null)
})

test('evaluateAmountExpression returns null for invalid characters', () => {
  assert.equal(evaluateAmountExpression('100+abc'), null)
  assert.equal(evaluateAmountExpression('100%5'), null)
})

test('evaluateAmountExpression rounds to 4 decimal places', () => {
  const result = evaluateAmountExpression('1/3')
  assert.ok(result !== null)
  assert.equal(result, 0.3333)
})

// --- expressionHasOperator ---

test('expressionHasOperator returns false for plain number string', () => {
  assert.equal(expressionHasOperator('100'), false)
  assert.equal(expressionHasOperator('0'), false)
  assert.equal(expressionHasOperator('12.5'), false)
})

test('expressionHasOperator returns true when operator present', () => {
  assert.equal(expressionHasOperator('100+50'), true)
  assert.equal(expressionHasOperator('100-'), true)
  assert.equal(expressionHasOperator('2*3'), true)
  assert.equal(expressionHasOperator('10/4'), true)
})

test('expressionHasOperator returns false for empty/null', () => {
  assert.equal(expressionHasOperator(''), false)
  assert.equal(expressionHasOperator(null), false)
  assert.equal(expressionHasOperator(undefined), false)
})
