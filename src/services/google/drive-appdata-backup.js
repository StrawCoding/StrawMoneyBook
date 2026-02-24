const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files'

function authHeaders(accessToken, extraHeaders = {}) {
  const normalizedExtra = normalizeHeaders(extraHeaders)
  delete normalizedExtra.Authorization
  delete normalizedExtra.authorization
  return {
    ...normalizedExtra,
    Authorization: `Bearer ${accessToken}`,
  }
}

function normalizeHeaders(headers) {
  if (!headers) return {}
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  if (typeof headers.entries === 'function') {
    return Object.fromEntries(Array.from(headers.entries()))
  }
  if (typeof headers === 'object') {
    return { ...headers }
  }
  return {}
}

async function fetchWithAuth(accessToken, reauth, url, init) {
  const response = await fetch(url, init)
  if (response.status !== 401 || typeof reauth !== 'function') {
    return response
  }
  const refreshedToken = await reauth()
  return fetch(url, {
    ...init,
    headers: authHeaders(refreshedToken, init?.headers ?? {}),
  })
}

function ensureOk(response, errorPrefix) {
  if (response.ok) return response
  return response.text().then((text) => {
    throw new Error(`${errorPrefix}：${text || response.status}`)
  })
}

function buildMultipartBody(metadata, jsonText) {
  const boundary = `strawmoneybook_${Math.random().toString(16).slice(2)}`
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const body = new Blob([
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    jsonText,
    closeDelimiter,
  ])

  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  }
}

async function findFilesByName(accessToken, reauth, filename) {
  const q = encodeURIComponent(`name='${filename}' and 'appDataFolder' in parents and trashed=false`)
  const fields = encodeURIComponent('files(id,name,modifiedTime,size)')
  const url = `${DRIVE_FILES_API}?spaces=appDataFolder&q=${q}&fields=${fields}&orderBy=modifiedTime desc`
  const response = await fetchWithAuth(accessToken, reauth, url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  await ensureOk(response, '讀取 Google 備份清單失敗')
  const data = await response.json()
  return Array.isArray(data?.files) ? data.files : []
}

async function deleteDriveFile(accessToken, reauth, fileId) {
  const url = `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}`
  const response = await fetchWithAuth(accessToken, reauth, url, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  })
  await ensureOk(response, '刪除重複備份失敗')
}

async function createDriveFile(accessToken, reauth, filename, jsonText) {
  const metadata = {
    name: filename,
    parents: ['appDataFolder'],
  }
  const { body, contentType } = buildMultipartBody(metadata, jsonText)
  const response = await fetchWithAuth(
    accessToken,
    reauth,
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,modifiedTime`,
    {
      method: 'POST',
      headers: authHeaders(accessToken, { 'Content-Type': contentType }),
      body,
    },
  )
  await ensureOk(response, '建立 Google 備份失敗')
  return response.json()
}

async function updateDriveFile(accessToken, reauth, fileId, jsonText) {
  const response = await fetchWithAuth(accessToken, reauth, `${DRIVE_UPLOAD_API}/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: authHeaders(accessToken, { 'Content-Type': 'application/json; charset=UTF-8' }),
    body: jsonText,
  })
  await ensureOk(response, '更新 Google 備份失敗')
}

export async function uploadBackupJsonToAppDataFolder({ accessToken, reauth, filename, jsonText }) {
  let currentAccessToken = accessToken
  const reauthWithCache = typeof reauth === 'function'
    ? async () => {
      const refreshed = await reauth()
      currentAccessToken = String(refreshed ?? '').trim() || currentAccessToken
      return currentAccessToken
    }
    : null

  const files = await findFilesByName(currentAccessToken, reauthWithCache, filename)
  const primaryFile = files[0] || null

  if (primaryFile?.id) {
    await updateDriveFile(currentAccessToken, reauthWithCache, primaryFile.id, jsonText)
    for (const duplicate of files.slice(1)) {
      if (duplicate?.id) await deleteDriveFile(currentAccessToken, reauthWithCache, duplicate.id)
    }
    return {
      fileId: primaryFile.id,
      filename,
      modifiedTime: new Date().toISOString(),
      created: false,
    }
  }

  const created = await createDriveFile(currentAccessToken, reauthWithCache, filename, jsonText)
  return {
    fileId: String(created?.id ?? ''),
    filename: String(created?.name ?? filename),
    modifiedTime: String(created?.modifiedTime ?? new Date().toISOString()),
    created: true,
  }
}

export async function listAppDataBackups({ accessToken, reauth }) {
  const fields = encodeURIComponent('files(id,name,modifiedTime,size)')
  const url = `${DRIVE_FILES_API}?spaces=appDataFolder&fields=${fields}&orderBy=modifiedTime desc`
  const response = await fetchWithAuth(accessToken, reauth, url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  await ensureOk(response, '讀取 Google 備份清單失敗')
  const data = await response.json()
  return Array.isArray(data?.files) ? data.files : []
}

export async function downloadAppDataBackupText({ accessToken, reauth, fileId }) {
  const url = `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media`
  const response = await fetchWithAuth(accessToken, reauth, url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
  await ensureOk(response, '下載 Google 備份失敗')
  return response.text()
}
