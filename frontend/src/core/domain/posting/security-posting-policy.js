/**
 * ART-04b — Securities cash-leg posting magnitudes.
 */
import { absoluteMinor, normalizeMinor } from '../money.js'

/**
 * Principal / PnL cash legs use absolute magnitudes; sign is applied by settlement plan.
 * @param {unknown} value
 */
export function toSecurityCashMagnitudeMinor(value) {
  return absoluteMinor(value)
}

/**
 * Preserve signed adjustment when already signed (e.g. principal move).
 * @param {unknown} value
 */
export function toSecuritySignedMinor(value) {
  return normalizeMinor(value)
}
