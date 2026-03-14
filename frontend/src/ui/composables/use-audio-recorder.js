import { onBeforeUnmount, ref } from 'vue'

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
]

function canRecordAudio() {
  return typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined'
}

function resolveMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }
  return PREFERRED_MIME_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
}

export function useAudioRecorder({ maxDurationMs = 75_000 } = {}) {
  const isSupported = ref(canRecordAudio())
  const isRecording = ref(false)
  const elapsedMs = ref(0)
  const mimeType = ref(resolveMimeType())
  const lastError = ref('')
  let stream = null
  let recorder = null
  let chunks = []
  let startedAt = 0
  let tickerId = 0
  let stopResolver = null

  function clearTicker() {
    if (tickerId) {
      clearInterval(tickerId)
      tickerId = 0
    }
  }

  function releaseStream() {
    if (!stream) return
    for (const track of stream.getTracks()) {
      track.stop()
    }
    stream = null
  }

  function reset() {
    clearTicker()
    elapsedMs.value = 0
    lastError.value = ''
    chunks = []
  }

  async function start() {
    if (!isSupported.value || isRecording.value) return false
    reset()

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (error) {
      lastError.value = error?.message || '無法啟用麥克風'
      releaseStream()
      return false
    }

    try {
      recorder = mimeType.value
        ? new MediaRecorder(stream, { mimeType: mimeType.value })
        : new MediaRecorder(stream)
    } catch (error) {
      lastError.value = error?.message || '裝置不支援此錄音格式'
      releaseStream()
      return false
    }

    chunks = []
    startedAt = Date.now()
    isRecording.value = true
    elapsedMs.value = 0

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) {
        chunks.push(event.data)
      }
    })
    recorder.addEventListener('stop', () => {
      clearTicker()
      isRecording.value = false
      const blob = chunks.length
        ? new Blob(chunks, { type: recorder?.mimeType || mimeType.value || 'audio/webm' })
        : null
      const result = blob
        ? {
          blob,
          mimeType: blob.type || recorder?.mimeType || mimeType.value || 'audio/webm',
          durationMs: Math.max(0, Date.now() - startedAt),
        }
        : null
      releaseStream()
      const resolver = stopResolver
      stopResolver = null
      recorder = null
      chunks = []
      if (typeof resolver === 'function') {
        resolver(result)
      }
    })

    recorder.start(250)
    tickerId = setInterval(() => {
      elapsedMs.value = Math.max(0, Date.now() - startedAt)
      if (elapsedMs.value >= maxDurationMs && recorder?.state === 'recording') {
        void stop()
      }
    }, 200)

    return true
  }

  async function stop({ discard = false } = {}) {
    if (!recorder || recorder.state === 'inactive') {
      releaseStream()
      isRecording.value = false
      return null
    }

    return new Promise((resolve) => {
      stopResolver = (result) => {
        if (discard) {
          resolve(null)
          return
        }
        resolve(result)
      }
      recorder.stop()
    })
  }

  onBeforeUnmount(async () => {
    try {
      await stop({ discard: true })
    } catch {
      releaseStream()
    }
    reset()
  })

  return {
    isSupported,
    isRecording,
    elapsedMs,
    mimeType,
    lastError,
    start,
    stop,
    reset,
  }
}
