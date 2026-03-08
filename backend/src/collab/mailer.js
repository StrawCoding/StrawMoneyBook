import nodemailer from 'nodemailer'
import { fileURLToPath } from 'node:url'

const SMTP_URL = String(process.env.SMTP_URL ?? '').trim()
const SMTP_HOST = String(process.env.SMTP_HOST ?? process.env.SMTP_SERVER ?? '').trim()
const SMTP_PORT = Math.max(1, Number(process.env.SMTP_PORT ?? process.env.SMTP_SERVER_PORT ?? 587) || 587)
const SMTP_SECURE = String(process.env.SMTP_SECURE ?? '').trim().toLowerCase()
const SMTP_FROM = String(process.env.SMTP_FROM ?? process.env.SMTP_EMAIL ?? '').trim()
const SMTP_USER = String(process.env.SMTP_USER ?? process.env.SMTP_USERNAME ?? SMTP_FROM).trim()
const SMTP_PASS = String(process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? '').trim()
const SMTP_JSON_TRANSPORT = String(process.env.SMTP_JSON_TRANSPORT ?? '').trim().toLowerCase()
const EMAIL_BRAND_LOGO_FILE = fileURLToPath(new URL('../../../frontend/public/assets/icons/icon-512.webp', import.meta.url))
const EMAIL_BRAND_LOGO_CID = 'strawmb-logo'

let transporterPromise = null

function isTruthy(value) {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasConfiguredTransport() {
  if (isTruthy(SMTP_JSON_TRANSPORT)) return true
  if (SMTP_URL) return true
  return Boolean(SMTP_HOST && SMTP_FROM)
}

async function getTransporter() {
  if (transporterPromise) return transporterPromise

  transporterPromise = Promise.resolve().then(() => {
    if (isTruthy(SMTP_JSON_TRANSPORT)) {
      return nodemailer.createTransport({
        jsonTransport: true,
      })
    }

    if (SMTP_URL) {
      return nodemailer.createTransport(SMTP_URL)
    }

    if (!SMTP_HOST || !SMTP_FROM) {
      throw new Error('未設定寄信服務，請設定 SMTP_URL 或 SMTP_HOST/SMTP_FROM')
    }

    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: isTruthy(SMTP_SECURE) || SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    })
  })

  return transporterPromise
}

export function isMailTransportConfigured() {
  return hasConfiguredTransport()
}

export async function sendPasswordResetEmail({ email, displayName, resetUrl, expiresMinutes = 30 }) {
  if (!hasConfiguredTransport()) {
    throw new Error('目前尚未設定重設密碼寄信服務')
  }

  const transporter = await getTransporter()
  const safeDisplayName = String(displayName ?? '').trim() || String(email ?? '').trim()
  const info = await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: String(email ?? '').trim(),
    subject: 'StrawMoneyBook 重設密碼',
    attachments: buildBrandLogoAttachments(),
    text: [
      `Hi ${safeDisplayName},`,
      '',
      '我們收到你的重設密碼申請。',
      `請在 ${Math.max(1, Number(expiresMinutes) || 30)} 分鐘內開啟以下連結設定新密碼：`,
      resetUrl,
      '',
      '如果這不是你本人操作，請忽略這封信。',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 560px; margin: 0 auto;">
        ${buildEmailLogoHtml()}
        <p>Hi ${escapeHtml(safeDisplayName)},</p>
        <p>我們收到你的重設密碼申請。</p>
        <p>請在 ${Math.max(1, Number(expiresMinutes) || 30)} 分鐘內點擊以下連結設定新密碼：</p>
        <p>
          <a
            href="${escapeHtml(resetUrl)}"
            style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f0b33f;color:#1f2937;text-decoration:none;font-weight:700;"
          >前往設定新密碼</a>
        </p>
        <p style="font-size:13px;color:#6b7280;word-break:break-all;">${escapeHtml(resetUrl)}</p>
        <p>如果這不是你本人操作，請忽略這封信。</p>
      </div>
    `,
  })

  return info
}

export async function sendTemporaryPasswordEmail({ email, displayName, temporaryPassword }) {
  if (!hasConfiguredTransport()) {
    throw new Error('目前尚未設定忘記密碼寄信服務')
  }

  const transporter = await getTransporter()
  const safeDisplayName = String(displayName ?? '').trim() || String(email ?? '').trim()
  const safeTemporaryPassword = String(temporaryPassword ?? '').trim()
  const info = await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: String(email ?? '').trim(),
    subject: 'StrawMoneyBook 臨時密碼通知',
    attachments: buildBrandLogoAttachments(),
    text: [
      `Hi ${safeDisplayName},`,
      '',
      '我們已為你建立新的臨時密碼。',
      `臨時密碼：${safeTemporaryPassword}`,
      '',
      '請使用這組臨時密碼登入 App，登入後系統會要求你立即更改密碼。',
      '如果這不是你本人操作，請盡快登入並重新設定密碼。',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 560px; margin: 0 auto;">
        ${buildEmailLogoHtml()}
        <p>Hi ${escapeHtml(safeDisplayName)},</p>
        <p>我們已為你建立新的臨時密碼。</p>
        <p
          style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f7f0d9;border:1px solid #e7c563;font-size:20px;font-weight:700;letter-spacing:1px;"
        ><strong>${escapeHtml(safeTemporaryPassword)}</strong></p>
        <p>請使用這組臨時密碼登入 App，登入後系統會要求你立即更改密碼。</p>
        <p>如果這不是你本人操作，請盡快登入並重新設定密碼。</p>
      </div>
    `,
  })

  return info
}

function buildBrandLogoAttachments() {
  return [
    {
      filename: 'straw-money-book-icon.png',
      path: EMAIL_BRAND_LOGO_FILE,
      cid: EMAIL_BRAND_LOGO_CID,
    },
  ]
}

function buildEmailLogoHtml() {
  return `
    <div style="text-align:center;margin:0 0 20px;">
      <img
        src="cid:${EMAIL_BRAND_LOGO_CID}"
        alt="Straw Money Book"
        style="display:block;margin:0 auto;width:180px;max-width:100%;height:auto;"
      />
    </div>
  `
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
