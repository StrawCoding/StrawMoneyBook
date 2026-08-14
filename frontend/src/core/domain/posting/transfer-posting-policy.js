/**
 * ART-04d — Transfer dual-leg posting amounts.
 */
import { absoluteMinor, normalizeMinor } from '../money.js'

/**
 * @param {object} input
 * @param {unknown} input.amountMinor primary transfer magnitude
 * @param {unknown} [input.sourceExtraMinor] addon on outgoing only
 * @param {unknown} [input.toAmountMinor] optional explicit incoming amount
 * @returns {{ outAmountMinor: number, toAmountMinor: number, amountMinor: number, sourceExtraMinor: number }}
 */
export function toTransferLegAmounts(input = {}) {
  const amountMinor = absoluteMinor(input.amountMinor)
  const sourceExtraRaw = Number(input.sourceExtraMinor ?? 0)
  const sourceExtraMinor = Number.isFinite(sourceExtraRaw) ? normalizeMinor(sourceExtraRaw) : 0
  if (amountMinor + sourceExtraMinor <= 0) {
    throw new Error('轉出金額（含附加項目）需大於 0')
  }
  const toRaw = Number(input.toAmountMinor ?? 0)
  const toAmountMinor = Number.isFinite(toRaw) && toRaw > 0
    ? normalizeMinor(toRaw)
    : amountMinor
  return {
    amountMinor,
    sourceExtraMinor,
    outAmountMinor: -(amountMinor + sourceExtraMinor),
    toAmountMinor,
  }
}
