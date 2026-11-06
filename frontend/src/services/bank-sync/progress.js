/** Native bank automation progress (Android Capacitor plugin events). */

let active = false
let percent = 0
let stage = ''
let action = ''
const listeners = new Set()

export function getBankSyncProgressSnapshot() {
  return { active, percent, stage, action }
}

function notifyListeners() {
  const snapshot = getBankSyncProgressSnapshot()
  for (const listener of listeners) {
    listener(snapshot)
  }
}

export function subscribeBankSyncProgress(listener) {
  listeners.add(listener)
  listener(getBankSyncProgressSnapshot())
  return () => listeners.delete(listener)
}

export function updateBankSyncProgress(patch = {}) {
  if (typeof patch.active === 'boolean') active = patch.active
  if (typeof patch.percent === 'number' && Number.isFinite(patch.percent)) {
    percent = Math.max(0, Math.min(100, Math.round(patch.percent)))
  }
  if (typeof patch.stage === 'string') stage = patch.stage
  if (typeof patch.action === 'string') action = patch.action
  notifyListeners()
}

export function resetBankSyncProgress() {
  active = false
  percent = 0
  stage = ''
  action = ''
  notifyListeners()
}

export function beginBankSyncProgressTracking(actionName = 'sync_bank') {
  updateBankSyncProgress({ active: true, percent: 0, stage: 'starting', action: actionName })
}
