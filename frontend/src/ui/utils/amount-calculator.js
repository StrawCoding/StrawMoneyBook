/**
 * Safe arithmetic expression evaluator for amount input fields.
 * Re-exports shared core evaluator so AI bookkeeping and manual quick-add stay aligned.
 */
export {
  evaluateAmountExpression,
  expressionHasOperator,
} from '../../core/utils/amount-expression.js'
