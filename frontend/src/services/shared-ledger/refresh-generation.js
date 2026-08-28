/**
 * Refresh responses are applied only when no newer rotation / logout started
 * while the request was in flight. A late 200 with an already-rotated token
 * would otherwise revive the previous refresh token and trip reuse detection.
 */
export function shouldApplyRefreshGeneration(startedGeneration, currentGeneration) {
  return Number(startedGeneration) === Number(currentGeneration)
}
