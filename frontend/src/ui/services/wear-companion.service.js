import { Capacitor, registerPlugin } from '@capacitor/core'

const WearCompanion = registerPlugin('WearCompanion')

function isAndroidNativeRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function isWearCompanionSupported() {
  return isAndroidNativeRuntime()
}

export async function getWearConnectionStatus() {
  if (!isAndroidNativeRuntime()) {
    return {
      supported: false,
      nearby: false,
      nodes: [],
      syncEpoch: '',
      snapshotRevision: 0,
      catalogRevision: 0,
      activeLedgerId: '',
      reason: 'android_only',
    }
  }
  try {
    const result = await WearCompanion.getConnectionStatus()
    return {
      supported: true,
      nearby: Boolean(result?.nearby),
      nodes: Array.isArray(result?.nodes) ? result.nodes : [],
      syncEpoch: String(result?.syncEpoch ?? ''),
      snapshotRevision: Number(result?.snapshotRevision) || 0,
      catalogRevision: Number(result?.catalogRevision) || 0,
      activeLedgerId: String(result?.activeLedgerId ?? ''),
      schemaVersion: Number(result?.schemaVersion) || 0,
      error: result?.error ? String(result.error) : null,
      dbError: result?.dbError ? String(result.dbError) : null,
    }
  } catch (error) {
    return {
      supported: true,
      nearby: false,
      nodes: [],
      syncEpoch: '',
      snapshotRevision: 0,
      catalogRevision: 0,
      activeLedgerId: '',
      error: String(error?.message ?? error),
    }
  }
}
