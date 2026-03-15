import { onBeforeUnmount, ref } from 'vue'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { translateMessage } from '@/ui/services/i18n.service'

const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
const SPEECH_RETRYABLE_ERROR_CODES = new Set(['no-speech', 'audio-capture', 'network'])
const SpeechInput = registerPlugin('SpeechInput')
let nativeSpeechAvailabilityTask = null
const t = (key, params, fallback) => translateMessage(key, params, fallback)

function resolveSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function isNativeSpeechRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function hasNativeSpeechSupport() {
  if (!isNativeSpeechRuntime()) return false
  if (!nativeSpeechAvailabilityTask) {
    nativeSpeechAvailabilityTask = SpeechInput.isAvailable()
      .then((result) => Boolean(result?.available))
      .catch(() => false)
  }
  return nativeSpeechAvailabilityTask
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
    return t('speech.error.permission_denied')
  }
  if (code === 'network') return t('speech.error.network_required')
  if (code === 'no-speech') return t('speech.error.no_speech')
  if (code === 'audio-capture') return t('speech.error.audio_capture')
  if (code === 'service-not-allowed') return t('speech.error.service_not_allowed')
  if (code === 'notreadableerror' || code === 'trackstarterror') return t('speech.error.mic_unavailable')
  if (code === 'notfounderror' || code === 'devicesnotfounderror') return t('speech.error.mic_not_found')
  return t('speech.error.failed')
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

function scoreSpeechAlternative(rawText, confidence) {
  const text = normalizeSpeechTranscript(rawText)
  if (!text) return Number.NEGATIVE_INFINITY

  let score = text.length * 5
  if (/\d/.test(text)) score += 16
  if (/[年月日點点分:：]/.test(text)) score += 8

  const numericConfidence = Number(confidence)
  if (Number.isFinite(numericConfidence)) {
    score += numericConfidence * 100
  }

  return score
}

function pickBestSpeechAlternative(result) {
  const alternatives = Array.from(result ?? [])
  if (!alternatives.length) return ''

  let bestText = ''
  let bestScore = Number.NEGATIVE_INFINITY
  for (const alternative of alternatives) {
    const transcript = String(alternative?.transcript ?? '')
    const score = scoreSpeechAlternative(transcript, alternative?.confidence)
    if (score > bestScore) {
      bestScore = score
      bestText = transcript
    }
  }

  return normalizeSpeechTranscript(bestText)
}

function pickBestSpeechAlternativeFromEntries(entries = []) {
  const alternatives = Array.isArray(entries) ? entries : []
  if (!alternatives.length) return ''

  let bestText = ''
  let bestScore = Number.NEGATIVE_INFINITY
  for (const alternative of alternatives) {
    const transcript = String(alternative?.transcript ?? '')
    const score = scoreSpeechAlternative(transcript, alternative?.confidence)
    if (score > bestScore) {
      bestScore = score
      bestText = transcript
    }
  }

  return normalizeSpeechTranscript(bestText)
}

export function useSpeechInput() {
  const isSupported = ref(Boolean(resolveSpeechRecognitionCtor()) || isNativeSpeechRuntime())
  const isListening = ref(false)
  const lastError = ref('')
  const hasMicPermission = ref(false)
  let recognition = null
  let manualStopRequested = false
  let activeEngine = ''
  let nativeCleanup = () => {}

  function clearNativeCleanup() {
    nativeCleanup()
    nativeCleanup = () => {}
  }

  async function stop() {
    if (activeEngine === 'native') {
      manualStopRequested = true
      isListening.value = false
      try {
        await SpeechInput.stop()
      } catch {
        // Ignore stop failures.
      }
      return
    }

    if (!recognition) return
    manualStopRequested = true
    isListening.value = false
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

    let stream = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
    } catch (primaryError) {
      if (isDev) {
        console.warn('[speech] getUserMedia preferred constraints failed, fallback to default:', {
          name: primaryError?.name,
          message: primaryError?.message,
        })
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (error) {
        if (isDev) {
          console.warn('[speech] getUserMedia failed:', {
            name: error?.name,
            message: error?.message,
          })
        }
        if (isPermissionDeniedError(error)) {
          lastError.value = t('speech.error.permission_denied')
          return false
        }
        // Non-permission failures (e.g. busy mic / temporary device lock) should not be
        // misreported as no permission, even if Permissions API says "denied".
        return true
      }
    }

    try {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      hasMicPermission.value = true
      return true
    } catch (error) {
      if (isDev) {
        console.warn('[speech] releasing getUserMedia stream failed:', {
          name: error?.name,
          message: error?.message,
        })
      }
      return true
    }
  }

  async function start(options = {}) {
    if (await hasNativeSpeechSupport()) {
      lastError.value = ''
      manualStopRequested = false
      clearNativeCleanup()
      activeEngine = 'native'
      isListening.value = false

      let started = false
      let restartQuota = Math.max(0, Number(options.autoRestartCount ?? 2) || 0)
      let lastNativeRawErrorCode = ''
      const nativeOptions = {
        lang: options.lang ?? 'zh-TW',
        partialResults: options.interimResults !== false,
        maxAlternatives: Math.max(1, Number(options.maxAlternatives ?? 5) || 1),
      }

      const handles = await Promise.all([
        SpeechInput.addListener('speechState', ({ state } = {}) => {
          if (activeEngine !== 'native') return
          const normalizedState = String(state ?? '').toLowerCase()
          if (normalizedState === 'start' || normalizedState === 'ready') {
            if (!started) {
              started = true
              options.onStart?.()
            }
            isListening.value = true
            return
          }
          if (normalizedState === 'end') {
            const shouldRestart = !manualStopRequested
              && restartQuota > 0
              && SPEECH_RETRYABLE_ERROR_CODES.has(lastNativeRawErrorCode)
            isListening.value = false
            if (shouldRestart) {
              restartQuota -= 1
              lastNativeRawErrorCode = ''
              lastError.value = ''
              void SpeechInput.start(nativeOptions).catch(() => {})
              return
            }
            manualStopRequested = false
            activeEngine = ''
            clearNativeCleanup()
            options.onEnd?.()
          }
        }),
        SpeechInput.addListener('speechResult', (payload = {}) => {
          if (activeEngine !== 'native') return
          const transcripts = Array.isArray(payload?.transcripts) ? payload.transcripts : []
          const confidences = Array.isArray(payload?.confidences) ? payload.confidences : []
          const normalized = pickBestSpeechAlternativeFromEntries(transcripts.map((transcript, index) => ({
            transcript,
            confidence: confidences[index],
          })))
          if (!normalized) return
          if (payload?.isFinal) {
            options.onResult?.({
              finalText: normalized,
              interimText: '',
            })
            return
          }
          options.onResult?.({
            finalText: '',
            interimText: normalized,
          })
        }),
        SpeechInput.addListener('speechError', ({ code } = {}) => {
          if (activeEngine !== 'native') return
          const normalizedCode = normalizeRawErrorCode(code)
          lastNativeRawErrorCode = normalizedCode
          if (manualStopRequested && (normalizedCode === 'aborted' || normalizedCode === 'no-speech')) {
            return
          }
          const message = normalizeSpeechError(normalizedCode)
          lastError.value = message
          options.onError?.(message)
        }),
      ])

      nativeCleanup = () => {
        for (const handle of handles) {
          try {
            handle?.remove?.()
          } catch {
            // Ignore listener cleanup failures.
          }
        }
      }

      try {
        await SpeechInput.start(nativeOptions)
        return true
      } catch (error) {
        activeEngine = ''
        isListening.value = false
        manualStopRequested = false
        clearNativeCleanup()
        const rawCode = normalizeRawErrorCode(error?.code || error?.message)
        const message = normalizeSpeechError(rawCode)
        lastError.value = message
        options.onError?.(message)
        return false
      }
    }

    const Ctor = resolveSpeechRecognitionCtor()
    if (!Ctor) {
      isSupported.value = false
      return false
    }

    const permissionOk = await ensureMicrophonePermission()
    if (!permissionOk) {
      options.onError?.(lastError.value || t('speech.error.permission_request_failed'))
      return false
    }

    await stop()
    lastError.value = ''
    manualStopRequested = false
    const instance = new Ctor()
    instance.lang = options.lang ?? 'zh-TW'
    instance.interimResults = options.interimResults ?? true
    instance.continuous = options.continuous ?? true
    const maxAlternatives = Math.max(1, Number(options.maxAlternatives ?? 5) || 1)
    if ('maxAlternatives' in instance) {
      instance.maxAlternatives = maxAlternatives
    }
    recognition = instance
    activeEngine = 'web'
    isListening.value = false
    let restartQuota = Math.max(0, Number(options.autoRestartCount ?? 2) || 0)
    let lastRawErrorCode = ''

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
        const fragment = pickBestSpeechAlternative(event.results[i])
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
      lastRawErrorCode = code
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
      if (!manualStopRequested && restartQuota > 0 && SPEECH_RETRYABLE_ERROR_CODES.has(lastRawErrorCode)) {
        restartQuota -= 1
        lastRawErrorCode = ''
        try {
          instance.start()
          return
        } catch (error) {
          if (isDev) {
            console.warn('[speech] auto-restart failed:', {
              name: error?.name,
              message: error?.message,
            })
          }
        }
      }
      manualStopRequested = false
      options.onEnd?.()
      activeEngine = ''
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
    void stop()
    clearNativeCleanup()
  })

  return {
    isSupported,
    isListening,
    lastError,
    start,
    stop,
  }
}
