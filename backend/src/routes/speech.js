import Busboy from 'busboy'
import {
  methodGuard,
  normalizePath,
  sendJson,
} from '../collab/http.js'
import { parseSpeechBookkeeping } from '../speech/financial-parser.js'

const STT_SERVICE_URL = String(process.env.SPEECH_STT_SERVICE_URL ?? 'http://127.0.0.1:8001').trim().replace(/\/$/, '')
const STT_SHARED_SECRET = String(process.env.SPEECH_STT_SHARED_SECRET ?? '').trim()
const TRANSCRIBE_TIMEOUT_MS = Math.max(5000, Number(process.env.SPEECH_TRANSCRIBE_TIMEOUT_MS ?? 120_000) || 0)
const SPEECH_MAX_AUDIO_BYTES = Math.max(1024 * 256, Number(process.env.SPEECH_MAX_AUDIO_BYTES ?? 10 * 1024 * 1024) || 0)

function createSpeechError(message, code = 'speech_request_failed', status = 400, extras = {}) {
  const error = new Error(String(message ?? '').trim() || 'speech request failed')
  error.code = code
  error.status = status
  Object.assign(error, extras)
  return error
}

function sendSpeechError(res, error) {
  sendJson(res, Number(error?.status ?? 400) || 400, {
    error: String(error?.code ?? 'speech_request_failed'),
    message: String(error?.message ?? error ?? 'speech request failed'),
  })
}

async function parseMultipartRequest(req) {
  const contentType = String(req.headers?.['content-type'] ?? '')
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw createSpeechError('請使用 multipart/form-data 上傳音訊', 'invalid_content_type', 415)
  }
  if (!Buffer.isBuffer(req.rawBody)) {
    throw createSpeechError('找不到音訊內容', 'audio_required', 400)
  }

  return new Promise((resolve, reject) => {
    const fields = {}
    let audioFile = null
    let fileTooLarge = false
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: SPEECH_MAX_AUDIO_BYTES,
        fields: 12,
      },
    })

    busboy.on('field', (name, value) => {
      fields[String(name ?? '').trim()] = String(value ?? '')
    })

    busboy.on('file', (fieldName, fileStream, info = {}) => {
      const chunks = []
      let totalBytes = 0
      fileStream.on('data', (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        totalBytes += buffer.length
        chunks.push(buffer)
      })
      fileStream.on('limit', () => {
        fileTooLarge = true
      })
      fileStream.on('end', () => {
        if (fileTooLarge) return
        audioFile = {
          fieldName: String(fieldName ?? '').trim(),
          filename: String(info.filename ?? 'voice-input.webm').trim() || 'voice-input.webm',
          mimeType: String(info.mimeType ?? 'application/octet-stream').trim() || 'application/octet-stream',
          buffer: Buffer.concat(chunks),
          size: totalBytes,
        }
      })
    })

    busboy.once('error', (error) => {
      reject(createSpeechError(error?.message ?? '無法解析音訊上傳內容', 'multipart_parse_failed', 400))
    })

    busboy.once('finish', () => {
      if (fileTooLarge) {
        reject(createSpeechError('音訊檔案過大，請控制在 10MB 內', 'audio_too_large', 413))
        return
      }
      if (!audioFile?.buffer?.length) {
        reject(createSpeechError('請先錄製語音後再送出', 'audio_required', 400))
        return
      }
      resolve({ fields, audioFile })
    })

    busboy.end(req.rawBody)
  })
}

function parseContextField(rawContext) {
  const source = String(rawContext ?? '').trim()
  if (!source) return {}
  try {
    const parsed = JSON.parse(source)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw createSpeechError('語音解析上下文格式錯誤', 'invalid_context_payload', 400)
  }
}

async function fetchSttService(pathname, { method = 'GET', body } = {}) {
  const requestUrl = `${STT_SERVICE_URL}${pathname}`
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS)
    : null

  const headers = {}
  if (STT_SHARED_SECRET) {
    headers['X-STT-Api-Key'] = STT_SHARED_SECRET
  }

  try {
    const response = await fetch(requestUrl, {
      method,
      headers,
      body,
      signal: controller?.signal,
    })
    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (!response.ok) {
      throw createSpeechError(
        String(data?.detail ?? data?.message ?? text ?? '語音辨識服務錯誤'),
        'speech_service_failed',
        response.status >= 500 ? 502 : response.status,
      )
    }
    return data
  } catch (error) {
    if (error?.code === 'speech_service_failed') throw error
    if (String(error?.name ?? '') === 'AbortError') {
      throw createSpeechError('語音辨識逾時，請縮短錄音長度後重試', 'speech_timeout', 504)
    }
    throw createSpeechError(`無法連線語音辨識服務：${requestUrl}`, 'speech_service_unavailable', 503)
  } finally {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId)
    }
  }
}

async function handleSpeechHealth(_req, res) {
  const stt = await fetchSttService('/health')
  sendJson(res, 200, {
    ok: true,
    service: 'speech',
    stt,
  })
}

async function handleSpeechTranscribe(req, res) {
  const { fields, audioFile } = await parseMultipartRequest(req)
  const context = parseContextField(fields.context)
  const language = String(fields.language ?? 'zh').trim() || 'zh'
  const source = String(fields.source ?? 'ai_bookkeeping').trim() || 'ai_bookkeeping'

  const formData = new FormData()
  formData.set('audio', new Blob([audioFile.buffer], { type: audioFile.mimeType }), audioFile.filename)
  formData.set('language', language)
  formData.set('source', source)

  const transcript = await fetchSttService('/v1/transcribe', {
    method: 'POST',
    body: formData,
  })
  const parse = parseSpeechBookkeeping({
    text: transcript?.text ?? '',
    context,
  })

  sendJson(res, 200, {
    transcript: {
      text: String(transcript?.text ?? '').trim(),
      language: String(transcript?.language ?? language).trim(),
      languageProbability: Number(transcript?.language_probability ?? 0),
      durationMs: Math.round(Number(transcript?.duration_ms ?? 0) || 0),
      avgLogProb: Number(transcript?.avg_logprob ?? 0),
      noSpeechProb: Number(transcript?.no_speech_prob ?? 0),
      segments: Array.isArray(transcript?.segments) ? transcript.segments : [],
      normalizationApplied: parse.normalizationApplied,
      normalizedText: parse.normalizedText,
    },
    parse,
  })
}

export default async function speechHandler(req, res) {
  if (methodGuard(req, res, ['GET', 'POST'])) return

  try {
    const pathname = normalizePath(req, '/api/speech')

    if (pathname === '/health' && req.method === 'GET') {
      await handleSpeechHealth(req, res)
      return
    }

    if (pathname === '/transcribe' && req.method === 'POST') {
      await handleSpeechTranscribe(req, res)
      return
    }

    sendJson(res, 404, {
      error: 'not_found',
      message: 'speech route not found',
    })
  } catch (error) {
    sendSpeechError(res, error)
  }
}
