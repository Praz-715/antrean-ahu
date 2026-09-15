import { errors } from './response'
import { ERROR_CODES } from '../../shared/constants/errors'
import { createLogger } from './logger'

const log = createLogger('captcha')

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function isCaptchaConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY
}

/**
 * Verifikasi token Cloudflare Turnstile (§36).
 *
 * Sengaja gagal-tertutup: bila halaman mewajibkan captcha tetapi kunci rahasianya
 * belum dipasang, permintaan ditolak dengan pesan jelas — bukan diloloskan diam-diam.
 * UI admin mencegah setelan ini dinyalakan saat kunci belum ada, jadi keadaan ini
 * hanya muncul pada deployment yang salah konfigurasi, dan memang harus berisik.
 */
export async function verifyCaptcha(token: string | undefined | null, ip?: string | null): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    log.error('requireCaptcha aktif tetapi TURNSTILE_SECRET_KEY belum diset')
    throw errors.badRequest(
      ERROR_CODES.CAPTCHA_REQUIRED,
      'Verifikasi anti-bot belum dikonfigurasi pada server. Hubungi administrator.',
    )
  }

  if (!token) {
    throw errors.badRequest(ERROR_CODES.CAPTCHA_REQUIRED, 'Selesaikan verifikasi anti-bot terlebih dahulu')
  }

  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.set('remoteip', ip)

  let result: { success?: boolean, 'error-codes'?: string[] }
  try {
    const res = await $fetch<typeof result>(VERIFY_URL, {
      method: 'POST',
      body,
      timeout: 8000,
    })
    result = res
  }
  catch (error) {
    log.error('gagal menghubungi layanan verifikasi', { message: (error as Error).message })
    throw errors.badRequest(ERROR_CODES.CAPTCHA_INVALID, 'Verifikasi anti-bot gagal, coba lagi')
  }

  if (!result?.success) {
    log.warn('token captcha ditolak', { codes: result?.['error-codes'] })
    throw errors.badRequest(ERROR_CODES.CAPTCHA_INVALID, 'Verifikasi anti-bot tidak valid, coba lagi')
  }
}
