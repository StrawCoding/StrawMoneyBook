const VERSION_SEGMENT_BASE = 1000
const MAJOR_MULTIPLIER = VERSION_SEGMENT_BASE * VERSION_SEGMENT_BASE
const PLAY_STORE_VERSION_CODE_OFFSET = 1_000_000
const MAX_PLAY_VERSION_CODE = 2_147_483_647
const DEFAULT_VERSION_CODE = PLAY_STORE_VERSION_CODE_OFFSET

export function deriveVersionCodeFromVersionName(versionName, fallbackValue = DEFAULT_VERSION_CODE) {
  const normalizedVersionName = String(versionName ?? '').trim()
  if (!normalizedVersionName) {
    return fallbackValue
  }

  const versionCore = normalizedVersionName.split('-')[0]
  const [majorText, minorText, patchText] = versionCore.split('.')
  if (!majorText || !minorText || !patchText) {
    return fallbackValue
  }

  const major = Number.parseInt(majorText, 10)
  const minor = Number.parseInt(minorText, 10)
  const patch = Number.parseInt(patchText, 10)

  if (
    !Number.isInteger(major) ||
    !Number.isInteger(minor) ||
    !Number.isInteger(patch) ||
    major < 0 ||
    minor < 0 ||
    patch < 0 ||
    minor >= VERSION_SEGMENT_BASE ||
    patch >= VERSION_SEGMENT_BASE
  ) {
    return fallbackValue
  }

  const computedVersionCode =
    PLAY_STORE_VERSION_CODE_OFFSET +
    (major * MAJOR_MULTIPLIER) +
    (minor * VERSION_SEGMENT_BASE) +
    patch

  if (!Number.isInteger(computedVersionCode) || computedVersionCode > MAX_PLAY_VERSION_CODE) {
    return fallbackValue
  }

  return computedVersionCode
}
