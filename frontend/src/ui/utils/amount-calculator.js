/**
 * Safe arithmetic expression evaluator for amount input fields.
 * Only handles: digits, decimal point, +, -, *, /
 * Respects operator precedence (* and / before + and -).
 * Returns null for invalid, incomplete, or negative results.
 */
export function evaluateAmountExpression(expr) {
  if (!expr || typeof expr !== 'string') return null
  const clean = expr.trim()
  if (!clean) return null
  if (!/^[\d+\-*/.]+$/.test(clean)) return null

  try {
    const tokens = tokenize(clean)
    if (!tokens) return null
    const result = evaluateTokens(tokens)
    if (result === null || !Number.isFinite(result)) return null
    if (result < 0) return null
    return Math.round(result * 10000) / 10000
  } catch {
    return null
  }
}

/**
 * Returns whether an expression string contains any arithmetic operator.
 */
export function expressionHasOperator(expr) {
  return typeof expr === 'string' && /[+\-*/]/.test(expr)
}

function tokenize(expr) {
  const tokens = []
  let i = 0
  while (i < expr.length) {
    if (/\d/.test(expr[i])) {
      let num = ''
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i++]
      }
      const val = parseFloat(num)
      if (!Number.isFinite(val)) return null
      tokens.push({ type: 'num', value: val })
    } else if (['+', '-', '*', '/'].includes(expr[i])) {
      tokens.push({ type: 'op', value: expr[i++] })
    } else {
      return null
    }
  }
  return tokens
}

function evaluateTokens(tokens) {
  if (!tokens || tokens.length === 0) return null
  if (tokens[0].type !== 'num') return null
  if (tokens.length % 2 === 0) return null

  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0 && tokens[i].type !== 'num') return null
    if (i % 2 === 1 && tokens[i].type !== 'op') return null
  }

  const nums = tokens.filter((_, i) => i % 2 === 0).map((t) => t.value)
  const ops = tokens.filter((_, i) => i % 2 === 1).map((t) => t.value)

  let i = 0
  while (i < ops.length) {
    if (ops[i] === '*' || ops[i] === '/') {
      if (ops[i] === '/' && nums[i + 1] === 0) return null
      const result = ops[i] === '*' ? nums[i] * nums[i + 1] : nums[i] / nums[i + 1]
      nums.splice(i, 2, result)
      ops.splice(i, 1)
    } else {
      i++
    }
  }

  let total = nums[0]
  for (let j = 0; j < ops.length; j++) {
    total = ops[j] === '+' ? total + nums[j + 1] : total - nums[j + 1]
  }
  return total
}
