const baseUrl = String(import.meta.env.BASE_URL ?? '/')

export const BRAND_LOGO_URL = `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}assets/icons/icon-192.webp`
