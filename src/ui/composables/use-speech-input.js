import { onBeforeUnmount, ref } from 'vue'

const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

function resolveSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function normalizeSpeechError(errorCode) {
  const code = String(errorCode ?? '').toLowerCase()
  if (
    code === 'not-allowed' ||
    code === 'permission-denied' ||
    code === 'notallowederror' ||
    code === 'permissiondeniederror' ||
    code === 'securityerror'
  ) {
    return '麥克風權限被拒絕'
  }
  if (code === 'network') return '語音辨識需要網路連線'
  if (code === 'no-speech') return '沒有偵測到語音，請再試一次'
  if (code === 'audio-capture') return '無法存取麥克風裝置'
  if (code === 'service-not-allowed') return '系統不允許語音辨識服務'
  if (code === 'notreadableerror' || code === 'trackstarterror') return '麥克風目前不可用，請稍後再試'
  if (code === 'notfounderror' || code === 'devicesnotfounderror') return '找不到可用麥克風裝置'
  return '語音辨識失敗'
}

function normalizeRawErrorCode(errorCode) {
  return String(errorCode ?? '').toLowerCase()
}

const CHINESE_DIGIT_MAP = {
  '零': 0,
  '〇': 0,
  '○': 0,
  '一': 1,
  '二': 2,
  '兩': 2,
  '两': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
}

const CHINESE_SMALL_UNIT_MAP = {
  '十': 10,
  '百': 100,
  '千': 1000,
}

const CHINESE_BIG_UNIT_MAP = {
  '萬': 10000,
  '万': 10000,
  '億': 100000000,
  '亿': 100000000,
}

function parseChineseIntegerToken(token) {
  let total = 0
  let section = 0
  let num = 0

  for (const char of token) {
    if (char in CHINESE_DIGIT_MAP) {
      num = CHINESE_DIGIT_MAP[char]
      continue
    }
    if (char in CHINESE_SMALL_UNIT_MAP) {
      const unit = CHINESE_SMALL_UNIT_MAP[char]
      if (num === 0) num = 1
      section += num * unit
      num = 0
      continue
    }
    if (char in CHINESE_BIG_UNIT_MAP) {
      const unit = CHINESE_BIG_UNIT_MAP[char]
      section += num
      total += section * unit
      section = 0
      num = 0
    }
  }

  return total + section + num
}

function parseChineseNumberToken(token) {
  const source = String(token ?? '').trim()
  if (!source) return null

  const isNegative = source.startsWith('負') || source.startsWith('负')
  const unsigned = isNegative ? source.slice(1) : source
  if (!unsigned) return null

  const hasDecimal = unsigned.includes('點') || unsigned.includes('点')
  if (hasDecimal) {
    const parts = unsigned.split(/[點点]/)
    if (!parts.length) return null
    const integerPart = parseChineseIntegerToken(parts[0] || '零')
    const decimalDigits = (parts[1] || '')
      .split('')
      .map((char) => (char in CHINESE_DIGIT_MAP ? String(CHINESE_DIGIT_MAP[char]) : ''))
      .join('')
    const merged = decimalDigits ? `${integerPart}.${decimalDigits}` : String(integerPart)
    const parsed = Number(merged)
    if (!Number.isFinite(parsed)) return null
    return isNegative ? -parsed : parsed
  }

  const parsed = parseChineseIntegerToken(unsigned)
  if (!Number.isFinite(parsed)) return null
  return isNegative ? -parsed : parsed
}

export function normalizeSpeechTranscript(text) {
  const source = String(text ?? '').trim()
  if (!source) return ''
  const timePattern = /([負负]?[零〇○一二兩两三四五六七八九十百千萬万億亿]+)點([零〇○一二兩两三四五六七八九十百千萬万億亿]+)分/g
  const hourOnlyTimePattern = /([負负]?[零〇○一二兩两三四五六七八九十百千萬万億亿]+)點(?![零〇○一二兩两三四五六七八九十百千萬万億亿])/g
  const normalizedTime = source
    .replace(timePattern, (_matched, rawHour, rawMinute) => {
      const hour = parseChineseNumberToken(rawHour)
      const minute = parseChineseNumberToken(rawMinute)
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return _matched
      return `${hour}點${minute}分`
    })
    .replace(hourOnlyTimePattern, (_matched, rawHour) => {
      const hour = parseChineseNumberToken(rawHour)
      if (!Number.isFinite(hour)) return _matched
      return `${hour}點`
    })
  const tokenPattern = /[負负]?(?=[零〇○一二兩两三四五六七八九十百千萬万億亿點点]*[零〇○一二兩两三四五六七八九十百千萬万億亿])[零〇○一二兩两三四五六七八九十百千萬万億亿點点]+/g
  return normalizedTime.replace(tokenPattern, (token) => {
    const parsed = parseChineseNumberToken(token)
    if (!Number.isFinite(parsed)) return token
    return String(parsed)
  })
}

export function useSpeechInput() {
  const isSupported = ref(Boolean(resolveSpeechRecognitionCtor()))
  const isListening = ref(false)
  const lastError = ref('')
  const hasMicPermission = ref(false)
  let recognition = null
  let manualStopRequested = false

  function stop() {
    if (!recognition) return
    manualStopRequested = true
    try {
      recognition.abort?.()
    } catch {
      // Ignore abort failures and fall back to stop.
    }
    try {
      recognition.stop()
    } catch {
      // Ignore stop failures.
    }
  }

  function isPermissionDeniedError(error) {
    const code = String(error?.name ?? error?.message ?? '').toLowerCase()
    return (
      code === 'notallowederror' ||
      code === 'permissiondeniederror' ||
      code === 'securityerror' ||
      code === 'not-allowed' ||
      code === 'permission-denied'
    )
  }

  async function readPermissionState() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return ''
    try {
      const result = await navigator.permissions.query({ name: 'microphone' })
      return String(result?.state ?? '')
    } catch {
      return ''
    }
  }

  async function ensureMicrophonePermission() {
    if (hasMicPermission.value) return true

    const permissionState = await readPermissionState()
    if (isDev) {
      console.info('[speech] permission query state:', permissionState || '(unknown)')
    }
    if (permissionState === 'granted') {
      hasMicPermission.value = true
      return true
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // Some Android WebView environments report "denied" from Permissions API even
      // when runtime permission is already granted. Do not hard-fail here.
      if (isDev && permissionState === 'denied') {
        console.warn('[speech] permissions.query=denied but getUserMedia is unavailable; continue to recognition.start()')
      }
      return true
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) {
        track.stop()
      }
      hasMicPermission.value = true
      return true
    } catch (error) {
      if (isDev) {
        console.warn('[speech] getUserMedia failed:', {
          name: error?.name,
          message: error?.message,
        })
      }
      if (isPermissionDeniedError(error)) {
        lastError.value = '麥克風權限被拒絕'
        return false
      }
      // Non-permission failures (e.g. busy mic / temporary device lock) should not be
      // misreported as no permission, even if Permissions API says "denied".
      return true
    }
  }

  async function start(options = {}) {
    const Ctor = resolveSpeechRecognitionCtor()
    if (!Ctor) {
      isSupported.value = false
      return false
    }

    const permissionOk = await ensureMicrophonePermission()
    if (!permissionOk) {
      options.onError?.(lastError.value || '無法取得麥克風權限')
      return false
    }

    stop()
    lastError.value = ''
    manualStopRequested = false
    const instance = new Ctor()
    instance.lang = options.lang ?? 'zh-TW'
    instance.interimResults = options.interimResults ?? true
    instance.continuous = options.continuous ?? false
    recognition = instance
    isListening.value = false

    instance.onstart = () => {
      if (recognition !== instance) return
      isListening.value = true
      options.onStart?.()
    }

    instance.onresult = (event) => {
      if (recognition !== instance) return
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const fragment = event.results[i][0]?.transcript ?? ''
        if (event.results[i].isFinal) {
          finalText += fragment
        } else {
          interimText += fragment
        }
      }
      options.onResult?.({
        finalText: normalizeSpeechTranscript(finalText),
        interimText: normalizeSpeechTranscript(interimText),
      })
    }

    instance.onerror = (event) => {
      if (recognition !== instance) return
      const code = normalizeRawErrorCode(event?.error)
      if (isDev) {
        console.warn('[speech] recognition.onerror:', code)
      }
      if (manualStopRequested && (code === 'aborted' || code === 'no-speech')) {
        return
      }
      const message = normalizeSpeechError(event?.error)
      lastError.value = message
      options.onError?.(message)
    }

    instance.onend = () => {
      if (recognition !== instance) return
      isListening.value = false
      manualStopRequested = false
      options.onEnd?.()
      recognition = null
    }

    try {
      instance.start()
    } catch (error) {
      isListening.value = false
      manualStopRequested = false
      recognition = null
      const rawCode = normalizeRawErrorCode(error?.name || error?.message)
      const message = normalizeSpeechError(rawCode)
      if (isDev) {
        console.warn('[speech] recognition.start() failed:', {
          code: rawCode,
          name: error?.name,
          message: error?.message,
        })
      }
      lastError.value = message
      options.onError?.(message)
      return false
    }
    return true
  }

  onBeforeUnmount(() => {
    stop()
  })

  return {
    isSupported,
    isListening,
    lastError,
    start,
    stop,
  }
}
